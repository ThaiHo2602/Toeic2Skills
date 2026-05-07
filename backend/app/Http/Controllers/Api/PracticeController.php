<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attempt;
use App\Models\Question;
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
        ]);

        $count = $data['question_count'] ?? (($data['mode'] ?? 'practice') === 'full_test' ? 200 : 15);
        $query = Question::query()
            ->with('answers')
            ->where('is_active', true)
            ->when($data['skill'] !== 'both', fn ($q) => $q->where('skill', $data['skill']))
            ->when(isset($data['part']), fn ($q) => $q->where('part', $data['part']))
            ->inRandomOrder()
            ->limit($count);

        $questions = $query->get();
        if ($questions->isEmpty()) {
            return response()->json(['success' => false, 'code' => 'NO_QUESTIONS_AVAILABLE'], 422);
        }

        $attempt = DB::transaction(function () use ($request, $data, $questions) {
            $attempt = Attempt::query()->create([
                'user_id' => $request->user()->id,
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
            'skill' => $question->skill,
            'part' => $question->part,
            'question_type' => $question->question_type,
            'question_text' => $question->question_text,
            'passage_text' => $question->passage_text,
            'transcript' => null,
            'audio_url' => $question->audio_url,
            'image_url' => $question->image_url,
            'estimated_time_seconds' => $question->estimated_time_seconds,
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
