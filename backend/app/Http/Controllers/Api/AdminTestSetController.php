<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\Question;
use App\Models\TestSet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminTestSetController extends Controller
{
    public function index(Request $request)
    {
        $data = $request->validate([
            'type' => ['nullable', 'in:mini,full,placement'],
            'published' => ['nullable', 'boolean'],
        ]);

        $testSets = TestSet::query()
            ->with('questions:id')
            ->withCount('questions')
            ->when(isset($data['type']), fn ($query) => $query->where('type', $data['type']))
            ->when($request->has('published'), fn ($query) => $query->where('is_published', (bool) $data['published']))
            ->latest()
            ->paginate((int) min(50, max(5, $request->integer('per_page', 20))));

        return response()->json(['success' => true, 'test_sets' => $testSets]);
    }

    public function show(TestSet $testSet)
    {
        return response()->json([
            'success' => true,
            'test_set' => $testSet->load('questions.answers', 'questions.group'),
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validatedPayload($request);

        $testSet = DB::transaction(fn () => $this->persistTestSet(new TestSet(), $data, $request->user()->id, 'created'));

        return response()->json(['success' => true, 'test_set' => $testSet->load('questions')], 201);
    }

    public function update(Request $request, TestSet $testSet)
    {
        $data = $this->validatedPayload($request);

        $testSet = DB::transaction(fn () => $this->persistTestSet($testSet, $data, $request->user()->id, 'updated'));

        return response()->json(['success' => true, 'test_set' => $testSet->load('questions')]);
    }

    public function destroy(Request $request, TestSet $testSet)
    {
        $testSet->delete();
        AdminActivityLog::query()->create([
            'admin_user_id' => $request->user()->id,
            'action' => 'deleted_test_set',
            'subject_type' => TestSet::class,
            'subject_id' => $testSet->id,
        ]);

        return response()->json(['success' => true]);
    }

    private function validatedPayload(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::in(['mini', 'full', 'placement'])],
            'description' => ['nullable', 'string', 'max:2000'],
            'duration_minutes' => ['required', 'integer', 'min:1', 'max:240'],
            'difficulty_level' => ['nullable', Rule::in(['easy', 'medium', 'hard'])],
            'estimated_score_min' => ['nullable', 'integer', 'min:10', 'max:990'],
            'estimated_score_max' => ['nullable', 'integer', 'min:10', 'max:990'],
            'is_published' => ['boolean'],
            'question_ids' => ['required', 'array', 'min:1', 'max:200'],
            'question_ids.*' => ['integer', 'exists:questions,id'],
        ]);
    }

    private function persistTestSet(TestSet $testSet, array $data, int $adminUserId, string $action): TestSet
    {
        $questions = Question::query()
            ->whereIn('id', $data['question_ids'])
            ->where('is_active', true)
            ->get()
            ->keyBy('id');

        abort_if($questions->count() !== count(array_unique($data['question_ids'])), 422, 'Every selected question must be active.');

        $listeningCount = $questions->where('skill', 'listening')->count();
        $readingCount = $questions->where('skill', 'reading')->count();

        $testSet->fill([
            'title' => $data['title'],
            'type' => $data['type'],
            'description' => $data['description'] ?? null,
            'duration_minutes' => $data['duration_minutes'],
            'difficulty_level' => $data['difficulty_level'] ?? 'medium',
            'estimated_score_min' => $data['estimated_score_min'] ?? null,
            'estimated_score_max' => $data['estimated_score_max'] ?? null,
            'is_published' => (bool) ($data['is_published'] ?? false),
            'listening_question_count' => $listeningCount,
            'reading_question_count' => $readingCount,
        ])->save();

        $sync = [];
        foreach (array_values(array_unique($data['question_ids'])) as $index => $questionId) {
            $question = $questions[$questionId];
            $sync[$questionId] = [
                'question_group_id' => $question->question_group_id,
                'section' => $question->skill,
                'display_order' => $index + 1,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }
        $testSet->questions()->sync($sync);

        AdminActivityLog::query()->create([
            'admin_user_id' => $adminUserId,
            'action' => "{$action}_test_set",
            'subject_type' => TestSet::class,
            'subject_id' => $testSet->id,
            'metadata' => ['question_count' => count($sync), 'published' => $testSet->is_published],
        ]);

        return $testSet->refresh();
    }
}
