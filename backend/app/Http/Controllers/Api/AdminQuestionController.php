<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\Answer;
use App\Models\Question;
use Illuminate\Http\UploadedFile;
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
            'difficulty_level' => ['nullable', 'in:easy,medium,hard'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);

        $questions = Question::query()
            ->with('answers', 'group')
            ->when(isset($data['skill']), fn ($q) => $q->where('skill', $data['skill']))
            ->when(isset($data['part']), fn ($q) => $q->where('part', $data['part']))
            ->when(isset($data['difficulty_level']), fn ($q) => $q->where('difficulty_level', $data['difficulty_level']))
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

    public function import(Request $request)
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:10240'],
        ]);

        /** @var UploadedFile $file */
        $file = $data['file'];
        $handle = fopen($file->getRealPath(), 'r');
        abort_unless($handle !== false, 422, 'Unable to read import file.');

        $headers = fgetcsv($handle);
        if (!$headers) {
            return response()->json(['success' => false, 'code' => 'EMPTY_IMPORT_FILE'], 422);
        }
        $headers = array_map(fn ($header) => trim((string) $header), $headers);

        $created = 0;
        $errors = [];
        $rowNumber = 1;

        while (($row = fgetcsv($handle)) !== false) {
            $rowNumber += 1;
            $record = array_combine($headers, array_pad($row, count($headers), null));
            if (!$record) {
                $errors[] = ['row' => $rowNumber, 'message' => 'Invalid column count.'];
                continue;
            }

            try {
                $correct = strtoupper(trim((string) ($record['correct_option'] ?? 'A')));
                if (!in_array($correct, ['A', 'B', 'C', 'D'], true)) {
                    throw new \RuntimeException('correct_option must be A, B, C, or D.');
                }

                DB::transaction(function () use ($record, $correct) {
                    $question = Question::query()->create([
                        'skill' => $record['skill'] ?? 'reading',
                        'part' => (int) ($record['part'] ?? 5),
                        'question_type' => $record['question_type'] ?? 'incomplete_sentence',
                        'question_text' => $record['question_text'] ?? null,
                        'passage_text' => $record['passage_text'] ?? null,
                        'transcript' => $record['transcript'] ?? null,
                        'audio_url' => $record['audio_url'] ?? null,
                        'image_url' => $record['image_url'] ?? null,
                        'explanation' => $record['explanation'] ?? null,
                        'difficulty_level' => $record['difficulty_level'] ?? 'medium',
                        'difficulty_score' => (int) ($record['difficulty_score'] ?? 55),
                        'estimated_time_seconds' => (int) ($record['estimated_time_seconds'] ?? 60),
                        'is_active' => true,
                    ]);

                    foreach (['A', 'B', 'C', 'D'] as $index => $letter) {
                        $text = $record['option_'.$letter] ?? $record['option_'.strtolower($letter)] ?? null;
                        if (!$text) {
                            throw new \RuntimeException("Missing option {$letter}.");
                        }
                        Answer::query()->create([
                            'question_id' => $question->id,
                            'answer_text' => $text,
                            'is_correct' => $correct === $letter,
                            'display_order' => $index + 1,
                        ]);
                    }
                });
                $created += 1;
            } catch (\Throwable $exception) {
                $errors[] = ['row' => $rowNumber, 'message' => $exception->getMessage()];
            }
        }

        fclose($handle);
        AdminActivityLog::query()->create([
            'admin_user_id' => $request->user()->id,
            'action' => 'import_questions',
            'metadata' => ['created' => $created, 'errors' => count($errors)],
        ]);

        return response()->json(['success' => true, 'created_count' => $created, 'errors' => $errors]);
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
