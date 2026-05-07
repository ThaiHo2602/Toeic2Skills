<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Answer;
use App\Models\Attempt;
use App\Models\UserAnswer;
use App\Services\ScoringService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AttemptController extends Controller
{
    public function __construct(private readonly ScoringService $scoring)
    {
    }

    public function show(Request $request, Attempt $attempt)
    {
        $this->authorizeAttempt($request, $attempt);
        return response()->json(['success' => true, 'attempt' => $attempt->load('questions.answers')]);
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
        ]);
    }

    private function authorizeAttempt(Request $request, Attempt $attempt): void
    {
        abort_unless($attempt->user_id === $request->user()->id || $request->user()->isAdmin(), 403);
    }
}
