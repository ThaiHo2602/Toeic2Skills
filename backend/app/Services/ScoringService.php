<?php

namespace App\Services;

use App\Models\Attempt;

class ScoringService
{
    public function scoreAttempt(Attempt $attempt): array
    {
        $attempt->loadMissing('questions', 'userAnswers');
        $correct = $attempt->userAnswers->where('is_correct', true)->count();
        $total = max(1, $attempt->questions->count());
        $listeningTotal = $attempt->questions->where('skill', 'listening')->count();
        $readingTotal = $attempt->questions->where('skill', 'reading')->count();
        $listeningCorrect = $attempt->userAnswers->filter(fn ($answer) => $attempt->questions->firstWhere('id', $answer->question_id)?->skill === 'listening' && $answer->is_correct)->count();
        $readingCorrect = $attempt->userAnswers->filter(fn ($answer) => $attempt->questions->firstWhere('id', $answer->question_id)?->skill === 'reading' && $answer->is_correct)->count();

        $listeningScore = $listeningTotal > 0 ? $this->estimateSectionScore(($listeningCorrect / $listeningTotal) * 100) : null;
        $readingScore = $readingTotal > 0 ? $this->estimateSectionScore(($readingCorrect / $readingTotal) * 100) : null;
        $totalScore = $this->roundToNearestFive(($listeningScore ?? 5) + ($readingScore ?? 5));

        return [
            'correct_count' => $correct,
            'accuracy' => round(($correct / $total) * 100, 2),
            'estimated_listening_score' => $listeningScore,
            'estimated_reading_score' => $readingScore,
            'estimated_total_score' => $totalScore,
            'score_confidence' => $this->confidence($attempt, $total),
            'label' => 'estimated',
        ];
    }

    public function estimateSectionScore(float $projectedCorrect): int
    {
        return $this->roundToNearestFive(5 + min(100, max(0, $projectedCorrect)) * 4.9);
    }

    public function roundToNearestFive(float $score): int
    {
        return (int) (round($score / 5) * 5);
    }

    private function confidence(Attempt $attempt, int $totalQuestions): float
    {
        if ($attempt->mode === 'full_test' && $totalQuestions >= 180) {
            return 95.0;
        }

        $sample = min($totalQuestions / 100, 1);
        $coverage = $attempt->skill === 'both' ? 0.8 : 0.45;
        return round(($sample * 0.5 + $coverage * 0.3 + 0.75 * 0.2) * 100, 2);
    }
}
