<?php

namespace App\Services;

use App\Models\Attempt;
use App\Models\Question;
use App\Models\UserPartStat;
use App\Models\UserSkillStat;
use App\Models\UserWeakness;
use Illuminate\Support\Collection;

class UserPerformanceService
{
    public function refreshAfterSubmit(Attempt $attempt): void
    {
        $attempt->loadMissing('questions', 'userAnswers');
        $this->updateQuestionDifficultyStats($attempt);
        $this->refreshUserStats((int) $attempt->user_id);
    }

    public function refreshUserStats(int $userId): void
    {
        $attempts = Attempt::query()
            ->with('questions:id,skill,part,topic_id,grammar_point_id', 'userAnswers:id,attempt_id,question_id,is_correct,time_spent_seconds')
            ->where('user_id', $userId)
            ->where('status', 'completed')
            ->latest('submitted_at')
            ->limit(200)
            ->get();

        foreach (['listening', 'reading'] as $skill) {
            $answers = $this->answersFor($attempts, fn ($question) => $question?->skill === $skill);
            $stat = $this->statFromAnswers($answers);
            UserSkillStat::query()->updateOrCreate(
                ['user_id' => $userId, 'skill' => $skill],
                [
                    ...$stat,
                    'estimated_score' => $stat['total_answered'] ? max(5, min(495, (int) round((5 + ($stat['accuracy'] / 100) * 490) / 5) * 5)) : null,
                    'last_practiced_at' => $attempts->first()?->submitted_at,
                ],
            );
        }

        foreach (range(1, 7) as $part) {
            $skill = $part <= 4 ? 'listening' : 'reading';
            $answers = $this->answersFor($attempts, fn ($question) => (int) $question?->part === $part);
            $stat = $this->statFromAnswers($answers);
            UserPartStat::query()->updateOrCreate(
                ['user_id' => $userId, 'part' => $part],
                [
                    'skill' => $skill,
                    ...$stat,
                    'avg_time_seconds' => round((float) $answers->avg('time_spent_seconds'), 2),
                    'last_practiced_at' => $attempts->first()?->submitted_at,
                ],
            );
        }

        $this->refreshWeaknesses($userId, $attempts);
    }

    private function updateQuestionDifficultyStats(Attempt $attempt): void
    {
        foreach ($attempt->questions as $question) {
            $userAnswer = $attempt->userAnswers->firstWhere('question_id', $question->id);
            if (!$userAnswer) {
                continue;
            }

            $attemptCount = $question->attempt_count + 1;
            $correctCount = $question->correct_count + ($userAnswer->is_correct ? 1 : 0);
            $correctRate = round(($correctCount / max(1, $attemptCount)) * 100, 2);
            $targetLevel = $correctRate >= 80 ? 'easy' : ($correctRate >= 50 ? 'medium' : 'hard');
            $targetScore = ['easy' => 30, 'medium' => 55, 'hard' => 80][$targetLevel];
            $newScore = $attemptCount < 30
                ? $question->difficulty_score
                : max(1, min(100, $question->difficulty_score + max(-10, min(10, $targetScore - $question->difficulty_score))));

            $question->update([
                'attempt_count' => $attemptCount,
                'correct_count' => $correctCount,
                'correct_rate' => $correctRate,
                'difficulty_level' => $attemptCount >= 30 ? $targetLevel : $question->difficulty_level,
                'difficulty_score' => $newScore,
            ]);
        }
    }

    private function refreshWeaknesses(int $userId, Collection $attempts): void
    {
        UserWeakness::query()->where('user_id', $userId)->delete();

        $weaknesses = collect();
        foreach (range(1, 7) as $part) {
            $answers = $this->answersFor($attempts, fn ($question) => (int) $question?->part === $part);
            $stat = $this->statFromAnswers($answers);
            if ($stat['total_answered'] >= 2 && $stat['accuracy'] < 65) {
                $weaknesses->push([
                    'weakness_type' => 'part',
                    'skill' => $part <= 4 ? 'listening' : 'reading',
                    'part' => $part,
                    'severity_score' => min(100, (int) round(100 - $stat['accuracy'])),
                    'accuracy' => $stat['accuracy'],
                    'sample_size' => $stat['total_answered'],
                    'last_detected_at' => now(),
                ]);
            }
        }

        foreach (['topic_id' => 'topic', 'grammar_point_id' => 'grammar'] as $column => $type) {
            $buckets = [];
            $attempts->each(function (Attempt $attempt) use (&$buckets, $column) {
                foreach ($attempt->userAnswers as $answer) {
                    $question = $attempt->questions->firstWhere('id', $answer->question_id);
                    $key = $question?->{$column};
                    if (!$question || !$key) {
                        continue;
                    }
                    $buckets[$key] ??= ['skill' => $question->skill, 'total' => 0, 'correct' => 0];
                    $buckets[$key]['total'] += 1;
                    $buckets[$key]['correct'] += $answer->is_correct ? 1 : 0;
                }
            });

            foreach ($buckets as $id => $bucket) {
                $accuracy = round(($bucket['correct'] / max(1, $bucket['total'])) * 100, 2);
                if ($bucket['total'] >= 2 && $accuracy < 70) {
                    $weaknesses->push([
                        'weakness_type' => $type,
                        'skill' => $bucket['skill'],
                        'topic_id' => $type === 'topic' ? $id : null,
                        'grammar_point_id' => $type === 'grammar' ? $id : null,
                        'severity_score' => min(100, (int) round(100 - $accuracy)),
                        'accuracy' => $accuracy,
                        'sample_size' => $bucket['total'],
                        'last_detected_at' => now(),
                    ]);
                }
            }
        }

        $weaknesses->sortByDesc('severity_score')->take(12)->each(
            fn (array $weakness) => UserWeakness::query()->create(['user_id' => $userId, ...$weakness]),
        );
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
}
