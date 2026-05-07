<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\QuestionGroup;
use Illuminate\Http\Request;

class AdminQuestionGroupController extends Controller
{
    public function index(Request $request)
    {
        $data = $request->validate([
            'skill' => ['nullable', 'in:listening,reading'],
            'part' => ['nullable', 'integer', 'between:1,7'],
            'q' => ['nullable', 'string', 'max:120'],
        ]);

        $groups = QuestionGroup::query()
            ->withCount('questions')
            ->when(isset($data['skill']), fn ($query) => $query->where('skill', $data['skill']))
            ->when(isset($data['part']), fn ($query) => $query->where('part', $data['part']))
            ->when(isset($data['q']), fn ($query) => $query->where('title', 'like', '%'.$data['q'].'%'))
            ->latest()
            ->limit(100)
            ->get();

        return response()->json(['success' => true, 'groups' => $groups]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $group = QuestionGroup::query()->create($data);
        $this->log($request, 'create_question_group', $group);

        return response()->json(['success' => true, 'group' => $group], 201);
    }

    public function update(Request $request, QuestionGroup $questionGroup)
    {
        $questionGroup->update($this->validated($request));
        $this->log($request, 'update_question_group', $questionGroup);

        return response()->json(['success' => true, 'group' => $questionGroup->refresh()]);
    }

    public function destroy(Request $request, QuestionGroup $questionGroup)
    {
        $questionGroup->delete();
        $this->log($request, 'delete_question_group', $questionGroup);

        return response()->json(['success' => true]);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'skill' => ['required', 'in:listening,reading'],
            'part' => ['required', 'integer', 'between:1,7'],
            'title' => ['nullable', 'string', 'max:255'],
            'group_type' => ['required', 'in:conversation,talk,text_completion,reading_passage'],
            'passage_text' => ['nullable', 'string'],
            'transcript' => ['nullable', 'string'],
            'audio_url' => ['nullable', 'url', 'max:500'],
            'image_url' => ['nullable', 'url', 'max:500'],
            'source' => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function log(Request $request, string $action, QuestionGroup $group): void
    {
        AdminActivityLog::query()->create([
            'admin_user_id' => $request->user()->id,
            'action' => $action,
            'subject_type' => QuestionGroup::class,
            'subject_id' => $group->id,
        ]);
    }
}
