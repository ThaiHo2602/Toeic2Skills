<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attempt;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class DashboardController extends Controller
{
    public function summary(Request $request)
    {
        $attempts = Attempt::query()
            ->with('questions:id,skill,part', 'userAnswers:id,attempt_id,question_id,is_correct')
            ->where('user_id', $request->user()->id)
            ->where('status', 'completed')
            ->latest('submitted_at')
            ->limit(50)
            ->get();

        $latest = $attempts->first();

        return response()->json([
            'success' => true,
            'estimated_score' => [
                'listening' => $latest?->estimated_listening_score,
                'reading' => $latest?->estimated_reading_score,
                'total' => $latest?->estimated_total_score,
                'confidence' => $latest?->score_confidence,
            ],
            'skill_stats' => [
                'listening' => $this->skillStat($attempts, 'listening'),
                'reading' => $this->skillStat($attempts, 'reading'),
            ],
            'part_stats' => collect(range(1, 7))->mapWithKeys(fn ($part) => [
                (string) $part => $this->partStat($attempts, $part),
            ]),
            'weaknesses' => collect(range(1, 7))
                ->map(fn ($part) => ['part' => $part, ...$this->partStat($attempts, $part)])
                ->filter(fn ($stat) => $stat['total_answered'] >= 2 && $stat['accuracy'] < 65)
                ->sortBy('accuracy')
                ->take(3)
                ->values(),
            'recent_attempts' => $attempts->take(8)->map(fn (Attempt $attempt) => $this->attemptResource($attempt))->values(),
        ]);
    }

    public function attempts(Request $request)
    {
        $attempts = Attempt::query()
            ->where('user_id', $request->user()->id)
            ->latest('started_at')
            ->paginate(min((int) $request->query('per_page', 20), 50));

        return response()->json(['success' => true, 'attempts' => $attempts]);
    }

    private function skillStat(Collection $attempts, string $skill): array
    {
        $answers = $this->answersFor($attempts, fn ($question) => $question?->skill === $skill);
        return $this->statFromAnswers($answers);
    }

    private function partStat(Collection $attempts, int $part): array
    {
        $answers = $this->answersFor($attempts, fn ($question) => (int) $question?->part === $part);
        return $this->statFromAnswers($answers);
    }

    private function answersFor(Collection $attempts, callable $questionFilter): Collection
    {
        return $attempts->flatMap(function (Attempt $attempt) use ($questionFilter) {
            return $attempt->userAnswers->filter(function ($answer) use ($attempt, $questionFilter) {
                $question = $attempt->questions->firstWhere('id', $answer->question_id);
                return $questionFilter($question);
            });
        })->values();
    }

    private function statFromAnswers(Collection $answers): array
    {
        $total = $answers->count();
        $correct = $answers->where('is_correct', true)->count();
        $accuracy = $total ? round(($correct / $total) * 100, 2) : 0;

        return [
            'level_score' => max(1, min(100, (int) round(30 + $accuracy * 0.7))),
            'total_answered' => $total,
            'total_correct' => $correct,
            'accuracy' => $accuracy,
        ];
    }

    private function attemptResource(Attempt $attempt): array
    {
        return [
            'id' => $attempt->id,
            'user_id' => $attempt->user_id,
            'mode' => $attempt->mode,
            'skill' => $attempt->skill,
            'part' => $attempt->part,
            'status' => $attempt->status,
            'started_at' => $attempt->started_at,
            'submitted_at' => $attempt->submitted_at,
            'total_questions' => $attempt->total_questions,
            'correct_count' => $attempt->correct_count,
            'accuracy' => $attempt->accuracy,
            'estimated_listening_score' => $attempt->estimated_listening_score,
            'estimated_reading_score' => $attempt->estimated_reading_score,
            'estimated_total_score' => $attempt->estimated_total_score,
            'score_confidence' => $attempt->score_confidence,
        ];
    }
}
