<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserWeakness;
use Illuminate\Http\Request;

class AnalysisController extends Controller
{
    public function weaknesses(Request $request)
    {
        $weaknesses = UserWeakness::query()
            ->with('topic:id,name', 'grammarPoint:id,name,category')
            ->where('user_id', $request->user()->id)
            ->orderByDesc('severity_score')
            ->get();

        return response()->json(['success' => true, 'weaknesses' => $weaknesses]);
    }
}
