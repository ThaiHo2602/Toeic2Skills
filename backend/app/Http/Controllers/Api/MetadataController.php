<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GrammarPoint;
use App\Models\QuestionGroup;
use App\Models\Topic;

class MetadataController extends Controller
{
    public function index()
    {
        return response()->json([
            'success' => true,
            'topics' => Topic::query()->orderBy('name')->get(),
            'grammar_points' => GrammarPoint::query()->orderBy('category')->orderBy('name')->get(),
            'question_groups' => QuestionGroup::query()->withCount('questions')->latest()->limit(100)->get(),
        ]);
    }
}
