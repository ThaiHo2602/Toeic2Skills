<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\Answer;
use App\Models\Question;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminQuestionController extends Controller
{
    public function index(Request $request)
    {
        $data = $request->validate([
            'skill' => ['nullable', 'in:listening,reading'],
            'part' => ['nullable', 'integer', 'between:1,7'],
            'q' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);

        $questions = Question::query()
            ->with('answers')
            ->when(isset($data['skill']), fn ($q) => $q->where('skill', $data['skill']))
            ->when(isset($data['part']), fn ($q) => $q->where('part', $data['part']))
            ->when(isset($data['q']), fn ($q) => $q->where('question_text', 'like', '%'.$data['q'].'%'))
            ->latest()
            ->paginate($data['per_page'] ?? 20);

        return response()->json(['success' => true, 'questions' => $questions]);
    }

    public function store(Request $request)
    {
        $data = $this->validatedQuestion($request);

        $question = DB::transaction(function () use ($data, $request) {
            $answers = $data['answers'];
            unset($data['answers']);
            $question = Question::query()->create($data);
            $this->syncAnswers($question, $answers);
            $this->log($request, 'create_question', $question);
            return $question->load('answers');
        });

        return response()->json(['success' => true, 'question' => $question], 201);
    }

    public function update(Request $request, Question $question)
    {
        $data = $this->validatedQuestion($request, $question);

        DB::transaction(function () use ($question, $data, $request) {
            $answers = $data['answers'] ?? null;
            unset($data['answers']);
            $question->update($data);
            if ($answers !== null) {
                $this->syncAnswers($question, $answers);
            }
            $this->log($request, 'update_question', $question);
        });

        return response()->json(['success' => true, 'question' => $question->refresh()->load('answers')]);
    }

    public function destroy(Request $request, Question $question)
    {
        $question->update(['is_active' => false]);
        $this->log($request, 'deactivate_question', $question);
        return response()->json(['success' => true]);
    }

    private function validatedQuestion(Request $request, ?Question $question = null): array
    {
        return $request->validate([
            'question_group_id' => ['nullable', 'integer', 'exists:question_groups,id'],
            'skill' => ['required', 'in:listening,reading'],
            'part' => ['required', 'integer', 'between:1,7'],
            'question_type' => ['nullable', 'string', 'max:80'],
            'question_text' => ['nullable', 'string'],
            'passage_text' => ['nullable', 'string'],
            'transcript' => ['nullable', 'string'],
            'audio_url' => ['nullable', 'url', 'max:500'],
            'image_url' => ['nullable', 'url', 'max:500'],
            'explanation' => ['nullable', 'string'],
            'grammar_formula' => ['nullable', 'array'],
            'vocabulary_hints' => ['nullable', 'array'],
            'topic_id' => ['nullable', 'integer', 'exists:topics,id'],
            'grammar_point_id' => ['nullable', 'integer', 'exists:grammar_points,id'],
            'difficulty_level' => ['required', Rule::in(['easy', 'medium', 'hard'])],
            'difficulty_score' => ['required', 'integer', 'between:1,100'],
            'estimated_time_seconds' => ['required', 'integer', 'between:5,3600'],
            'is_active' => ['sometimes', 'boolean'],
            'answers' => [$question ? 'sometimes' : 'required', 'array', 'min:2', 'max:4'],
            'answers.*.answer_text' => ['required_with:answers', 'string'],
            'answers.*.answer_audio_url' => ['nullable', 'url', 'max:500'],
            'answers.*.is_correct' => ['required_with:answers', 'boolean'],
            'answers.*.display_order' => ['required_with:answers', 'integer', 'between:1,4'],
            'answers.*.explanation' => ['nullable', 'string'],
        ]);
    }

    private function syncAnswers(Question $question, array $answers): void
    {
        abort_unless(collect($answers)->where('is_correct', true)->count() === 1, 422, 'Exactly one answer must be correct.');
        $question->answers()->delete();
        foreach ($answers as $answer) {
            Answer::query()->create([
                'question_id' => $question->id,
                'answer_text' => $answer['answer_text'],
                'answer_audio_url' => $answer['answer_audio_url'] ?? null,
                'is_correct' => $answer['is_correct'],
                'display_order' => $answer['display_order'],
                'explanation' => $answer['explanation'] ?? null,
            ]);
        }
    }

    private function log(Request $request, string $action, Question $question): void
    {
        AdminActivityLog::query()->create([
            'admin_user_id' => $request->user()->id,
            'action' => $action,
            'subject_type' => Question::class,
            'subject_id' => $question->id,
        ]);
    }
}
