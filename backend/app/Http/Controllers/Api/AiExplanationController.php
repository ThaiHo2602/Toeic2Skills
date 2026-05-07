<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Question;
use App\Services\SubscriptionService;
use Illuminate\Http\Request;

class AiExplanationController extends Controller
{
    public function __construct(private readonly SubscriptionService $subscriptions)
    {
    }

    public function explain(Request $request)
    {
        $data = $request->validate([
            'question_id' => ['required', 'integer', 'exists:questions,id'],
            'selected_answer_id' => ['nullable', 'integer', 'exists:answers,id'],
        ]);

        $usage = $this->subscriptions->getTodayUsage($request->user());
        $usage->increment('ai_explanation_count');

        $question = Question::query()->with('answers')->findOrFail($data['question_id']);
        $correct = $question->answers->firstWhere('is_correct', true);
        $selected = isset($data['selected_answer_id']) ? $question->answers->firstWhere('id', $data['selected_answer_id']) : null;

        return response()->json([
            'success' => true,
            'explanation' => [
                'question_id' => $question->id,
                'summary' => $question->explanation ?: 'Review the question stem, identify the tested TOEIC skill, then eliminate options that do not match the context.',
                'correct_answer' => $correct ? ['id' => $correct->id, 'text' => $correct->answer_text] : null,
                'selected_answer' => $selected ? ['id' => $selected->id, 'text' => $selected->answer_text] : null,
                'study_tip' => $question->skill === 'reading'
                    ? 'For Reading, underline keywords around the blank/question and check grammar role before meaning.'
                    : 'For Listening, focus on speaker intent and avoid options that repeat only isolated words.',
                'source' => 'deterministic_backend',
            ],
        ]);
    }
}
