<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TestSet;
use Illuminate\Http\Request;

class TestSetController extends Controller
{
    public function index(Request $request)
    {
        $data = $request->validate([
            'type' => ['nullable', 'in:mini,full,placement'],
        ]);

        $testSets = TestSet::query()
            ->where('is_published', true)
            ->when(isset($data['type']), fn ($query) => $query->where('type', $data['type']))
            ->latest()
            ->get();

        return response()->json(['success' => true, 'test_sets' => $testSets]);
    }
}
