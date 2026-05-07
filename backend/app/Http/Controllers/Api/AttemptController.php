<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Answer;
use App\Models\Attempt;
use App\Models\UserAnswer;
use App\Services\ScoringService;
use App\Services\SubscriptionService;
use App\Services\UserPerformanceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AttemptController extends Controller
{
    public function __construct(
        private readonly ScoringService $scoring,
        private readonly UserPerformanceService $performance,
        private readonly SubscriptionService $subscriptions,
    )
    {
    }

    public function show(Request $request, Attempt $attempt)
    {
        $this->authorizeAttempt($request, $attempt);
        $attempt->load('questions.answers', 'questions.group');

        return response()->json([
            'success' => true,
            'attempt' => $attempt,
            'questions' => $attempt->questions->map(fn ($question) => $attempt->status === 'in_progress'
                ? $this->questionForTaking($question)
                : $question)->values(),
        ]);
    }

    public function answer(Request $request, Attempt $attempt)
    {
        $this->authorizeAttempt($request, $attempt);
        if ($attempt->status !== 'in_progress') {
            return response()->json(['success' => false, 'code' => 'ATTEMPT_NOT_IN_PROGRESS'], 409);
        }

        $data = $request->validate([
            'question_id' => ['required', 'integer', 'exists:questions,id'],
            'selected_answer_id' => ['nullable', 'integer', 'exists:answers,id'],
            'time_spent_seconds' => ['nullable', 'integer', 'min:0', 'max:7200'],
        ]);

        abort_unless($attempt->questions()->where('questions.id', $data['question_id'])->exists(), 422, 'Question does not belong to this attempt.');
        $selected = isset($data['selected_answer_id']) ? Answer::query()->where('question_id', $data['question_id'])->findOrFail($data['selected_answer_id']) : null;

        $userAnswer = UserAnswer::query()->updateOrCreate(
            ['attempt_id' => $attempt->id, 'question_id' => $data['question_id']],
            [
                'user_id' => $request->user()->id,
                'selected_answer_id' => $selected?->id,
                'is_correct' => (bool) $selected?->is_correct,
                'time_spent_seconds' => $data['time_spent_seconds'] ?? null,
                'answered_at' => now(),
            ],
        );

        return response()->json(['success' => true, 'answer' => $userAnswer]);
    }

    public function submit(Request $request, Attempt $attempt)
    {
        $this->authorizeAttempt($request, $attempt);
        if ($attempt->status !== 'in_progress') {
            return response()->json(['success' => false, 'code' => 'ATTEMPT_ALREADY_SUBMITTED'], 409);
        }

        $payload = $request->validate([
            'answers' => ['nullable', 'array'],
            'answers.*.question_id' => ['required_with:answers', 'integer', 'exists:questions,id'],
            'answers.*.selected_answer_id' => ['nullable', 'integer', 'exists:answers,id'],
            'answers.*.time_spent_seconds' => ['nullable', 'integer', 'min:0', 'max:7200'],
        ]);

        DB::transaction(function () use ($request, $attempt, $payload) {
            foreach ($payload['answers'] ?? [] as $answerPayload) {
                $this->answer($request->merge($answerPayload), $attempt);
            }

            $attempt->refresh()->load('questions', 'userAnswers');
            $score = $this->scoring->scoreAttempt($attempt);
            unset($score['label']);
            $attempt->update([
                'status' => 'completed',
                'submitted_at' => now(),
                'duration_seconds' => max(0, (int) abs(now()->diffInSeconds($attempt->started_at))),
                ...$score,
            ]);
            $this->performance->refreshAfterSubmit($attempt->refresh());
        });

        return $this->result($request, $attempt->refresh());
    }

    public function result(Request $request, Attempt $attempt)
    {
        $this->authorizeAttempt($request, $attempt);
        $attempt->load('questions.answers', 'userAnswers');

        return response()->json([
            'success' => true,
            'attempt' => $attempt,
            'score' => [
                'listening' => $attempt->estimated_listening_score,
                'reading' => $attempt->estimated_reading_score,
                'total' => $attempt->estimated_total_score,
                'confidence' => $attempt->score_confidence,
                'label' => 'estimated',
            ],
            'review' => $attempt->questions->map(function ($question) use ($attempt) {
                $userAnswer = $attempt->userAnswers->firstWhere('question_id', $question->id);
                return [
                    'question' => $question,
                    'selected_answer_id' => $userAnswer?->selected_answer_id,
                    'is_correct' => (bool) $userAnswer?->is_correct,
                    'time_spent_seconds' => $userAnswer?->time_spent_seconds,
                ];
            })->values(),
            'locked_features' => $this->subscriptions->isPremium($request->user()) ? [] : [
                ['feature' => 'weakness_analysis', 'message' => 'Nâng cấp Premium để xem phân tích điểm yếu.'],
                ['feature' => 'recommendations', 'message' => 'Nâng cấp Premium để nhận lộ trình ôn tập cá nhân hóa.'],
                ['feature' => 'ai_explanation', 'message' => 'Nâng cấp Premium để xem giải thích bằng AI.'],
            ],
        ]);
    }

    private function authorizeAttempt(Request $request, Attempt $attempt): void
    {
        abort_unless($attempt->user_id === $request->user()->id || $request->user()->isAdmin(), 403);
    }

    private function questionForTaking($question): array
    {
        return [
            'id' => $question->id,
            'question_group_id' => $question->question_group_id,
            'skill' => $question->skill,
            'part' => $question->part,
            'question_type' => $question->question_type,
            'question_text' => $question->question_text,
            'passage_text' => $question->passage_text,
            'transcript' => null,
            'audio_url' => $question->audio_url,
            'image_url' => $question->image_url,
            'estimated_time_seconds' => $question->estimated_time_seconds,
            'group' => $question->group ? [
                'id' => $question->group->id,
                'skill' => $question->group->skill,
                'part' => $question->group->part,
                'title' => $question->group->title,
                'group_type' => $question->group->group_type,
                'passage_text' => $question->group->passage_text,
                'transcript' => null,
                'audio_url' => $question->group->audio_url,
                'image_url' => $question->group->image_url,
            ] : null,
            'answers' => $question->answers->map(fn ($answer) => [
                'id' => $answer->id,
                'question_id' => $answer->question_id,
                'answer_text' => $answer->answer_text,
                'answer_audio_url' => $answer->answer_audio_url,
                'display_order' => $answer->display_order,
            ])->values(),
        ];
    }
}
