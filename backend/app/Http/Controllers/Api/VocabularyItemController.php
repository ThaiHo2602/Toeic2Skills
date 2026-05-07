<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Question;
use App\Models\VocabularyItem;
use Illuminate\Http\Request;

class VocabularyItemController extends Controller
{
    public function index(Request $request)
    {
        return response()->json([
            'success' => true,
            'items' => VocabularyItem::query()
                ->where('user_id', $request->user()->id)
                ->latest()
                ->get(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'word' => ['required', 'string', 'max:120'],
            'meaning' => ['nullable', 'string', 'max:500'],
            'example' => ['nullable', 'string', 'max:500'],
            'source' => ['nullable', 'string', 'max:120'],
            'question_id' => ['nullable', 'integer', 'exists:questions,id'],
        ]);

        $question = isset($data['question_id']) ? Question::query()->find($data['question_id']) : null;
        $item = VocabularyItem::query()->updateOrCreate(
            ['user_id' => $request->user()->id, 'word' => trim($data['word'])],
            [
                'question_id' => $data['question_id'] ?? null,
                'meaning' => $data['meaning'] ?? null,
                'example' => $data['example'] ?? null,
                'source' => $data['source'] ?? 'practice',
            ],
        );

        return response()->json([
            'success' => true,
            'item' => [
                ...$item->toArray(),
                'part' => $question?->part,
                'topic_id' => $question?->topic_id,
            ],
        ], 201);
    }

    public function destroy(Request $request, VocabularyItem $vocabularyItem)
    {
        abort_unless($vocabularyItem->user_id === $request->user()->id, 403);
        $vocabularyItem->delete();

        return response()->json(['success' => true]);
    }
}
