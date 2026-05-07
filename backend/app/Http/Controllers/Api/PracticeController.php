<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attempt;
use App\Models\Question;
use App\Models\TestSet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PracticeController extends Controller
{
    public function start(Request $request)
    {
        $data = $request->validate([
            'mode' => ['nullable', 'in:practice,mini_test,full_test,placement'],
            'skill' => ['required', 'in:listening,reading,both'],
            'part' => ['nullable', 'integer', 'between:1,7'],
            'question_count' => ['nullable', 'integer', 'between:1,200'],
            'adaptive' => ['nullable', 'boolean'],
            'test_set_id' => ['nullable', 'integer', 'exists:test_sets,id'],
        ]);

        $testSet = null;
        if (isset($data['test_set_id'])) {
            $testSet = TestSet::query()
                ->where('id', $data['test_set_id'])
                ->where('is_published', true)
                ->with('questions.answers', 'questions.group')
                ->firstOrFail();
            $questions = $testSet->questions;
            $data['mode'] = match ($testSet->type) {
                'mini' => 'mini_test',
                'full' => 'full_test',
                default => 'placement',
            };
            $data['skill'] = 'both';
        } else {
            $count = $data['question_count'] ?? (($data['mode'] ?? 'practice') === 'full_test' ? 200 : 15);
            $query = Question::query()
                ->with('answers', 'group')
                ->where('is_active', true)
                ->when($data['skill'] !== 'both', fn ($q) => $q->where('skill', $data['skill']))
                ->when(isset($data['part']), fn ($q) => $q->where('part', $data['part']))
                ->inRandomOrder()
                ->limit($count);

            $questions = $query->get();
        }

        $groupIds = $questions
            ->filter(fn (Question $question) => in_array((int) $question->part, [3, 4, 6, 7], true) && $question->question_group_id)
            ->pluck('question_group_id')
            ->unique()
            ->values();
        if ($groupIds->isNotEmpty()) {
            $groupQuestions = Question::query()
                ->with('answers', 'group')
                ->where('is_active', true)
                ->whereIn('question_group_id', $groupIds)
                ->get();
            $questions = $questions->merge($groupQuestions)->unique('id')->values();
        }
        if ($questions->isEmpty()) {
            return response()->json(['success' => false, 'code' => 'NO_QUESTIONS_AVAILABLE'], 422);
        }

        $attempt = DB::transaction(function () use ($request, $data, $questions, $testSet) {
            $attempt = Attempt::query()->create([
                'user_id' => $request->user()->id,
                'test_set_id' => $testSet?->id,
                'mode' => $data['mode'] ?? 'practice',
                'skill' => $data['skill'],
                'part' => $data['part'] ?? null,
                'adaptive' => (bool) ($data['adaptive'] ?? false),
                'status' => 'in_progress',
                'started_at' => now(),
                'total_questions' => $questions->count(),
            ]);

            foreach ($questions->values() as $index => $question) {
                $attempt->questions()->attach($question->id, ['display_order' => $index + 1]);
            }

            return $attempt;
        });

        return response()->json([
            'success' => true,
            'attempt' => $attempt,
            'questions' => $questions->map(fn (Question $question) => $this->questionForTaking($question))->values(),
        ], 201);
    }

    private function questionForTaking(Question $question): array
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
