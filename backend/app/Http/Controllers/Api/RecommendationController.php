<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserPartStat;
use App\Models\UserWeakness;
use Illuminate\Http\Request;

class RecommendationController extends Controller
{
    public function index(Request $request)
    {
        $weaknesses = UserWeakness::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('severity_score')
            ->limit(5)
            ->get();

        $recommendations = $weaknesses->map(function (UserWeakness $weakness) {
            $part = $weakness->part ?? ($weakness->skill === 'listening' ? 3 : 5);
            return [
                'type' => 'practice',
                'title' => "Practice Part {$part}",
                'skill' => $weakness->skill,
                'part' => $part,
                'question_count' => $weakness->severity_score >= 60 ? 15 : 10,
                'reason' => $weakness->weakness_type,
                'severity_score' => $weakness->severity_score,
            ];
        })->values();

        if ($recommendations->isEmpty()) {
            $part = UserPartStat::query()
                ->where('user_id', $request->user()->id)
                ->orderBy('accuracy')
                ->first();
            $recommendations = collect([[
                'type' => 'practice',
                'title' => 'Recommended TOEIC practice',
                'skill' => $part?->skill ?? 'reading',
                'part' => $part?->part ?? 5,
                'question_count' => 10,
                'reason' => 'keep_momentum',
                'severity_score' => 20,
            ]]);
        }

        return response()->json(['success' => true, 'recommendations' => $recommendations]);
    }
}
