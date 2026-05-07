<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Bookmark;
use Illuminate\Http\Request;

class BookmarkController extends Controller
{
    public function index(Request $request)
    {
        return response()->json([
            'success' => true,
            'bookmarks' => Bookmark::query()
                ->where('user_id', $request->user()->id)
                ->latest()
                ->get(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'question_id' => ['required', 'integer', 'exists:questions,id'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $bookmark = Bookmark::query()->updateOrCreate(
            ['user_id' => $request->user()->id, 'question_id' => $data['question_id']],
            ['note' => $data['note'] ?? null],
        );

        return response()->json(['success' => true, 'bookmark' => $bookmark], 201);
    }

    public function destroy(Request $request, int $questionId)
    {
        Bookmark::query()
            ->where('user_id', $request->user()->id)
            ->where('question_id', $questionId)
            ->delete();

        return response()->json(['success' => true]);
    }
}
