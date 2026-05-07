<?php

namespace Database\Seeders;

use App\Models\Answer;
use App\Models\GrammarPoint;
use App\Models\Plan;
use App\Models\Question;
use App\Models\TestSet;
use App\Models\Topic;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        Plan::query()->upsert([
            ['id' => 1, 'name' => 'Free', 'slug' => 'free', 'price' => 0, 'currency' => 'VND', 'duration_days' => null, 'daily_test_limit' => 5, 'ai_explanation_limit' => 0, 'has_ai_features' => false, 'has_weakness_analysis' => false, 'has_adaptive_learning' => false, 'has_advanced_dashboard' => false, 'is_active' => true],
            ['id' => 2, 'name' => 'Premium Monthly', 'slug' => 'premium_monthly', 'price' => 99000, 'currency' => 'VND', 'duration_days' => 30, 'daily_test_limit' => null, 'ai_explanation_limit' => null, 'has_ai_features' => true, 'has_weakness_analysis' => true, 'has_adaptive_learning' => true, 'has_advanced_dashboard' => true, 'is_active' => true],
            ['id' => 3, 'name' => 'Premium Quarterly', 'slug' => 'premium_quarterly', 'price' => 249000, 'currency' => 'VND', 'duration_days' => 90, 'daily_test_limit' => null, 'ai_explanation_limit' => null, 'has_ai_features' => true, 'has_weakness_analysis' => true, 'has_adaptive_learning' => true, 'has_advanced_dashboard' => true, 'is_active' => true],
            ['id' => 4, 'name' => 'Premium Yearly', 'slug' => 'premium_yearly', 'price' => 799000, 'currency' => 'VND', 'duration_days' => 365, 'daily_test_limit' => null, 'ai_explanation_limit' => null, 'has_ai_features' => true, 'has_weakness_analysis' => true, 'has_adaptive_learning' => true, 'has_advanced_dashboard' => true, 'is_active' => true],
        ], ['slug']);

        User::query()->updateOrCreate(['email' => 'learner@example.com'], [
            'name' => 'Demo Learner',
            'password' => Hash::make('Password1'),
            'role' => 'user',
            'target_score' => 650,
        ]);
        User::query()->updateOrCreate(['email' => 'admin@example.com'], [
            'name' => 'Admin',
            'password' => Hash::make('Admin1234'),
            'role' => 'admin',
            'target_score' => 900,
        ]);

        $business = Topic::query()->updateOrCreate(['name' => 'Business travel'], ['skill' => 'both']);
        $office = Topic::query()->updateOrCreate(['name' => 'Office communication'], ['skill' => 'both']);
        $grammar = GrammarPoint::query()->updateOrCreate(['name' => 'Part of speech'], ['category' => 'Grammar']);

        $this->seedQuestion([
            'id' => 1,
            'skill' => 'reading',
            'part' => 5,
            'question_type' => 'incomplete_sentence',
            'question_text' => 'The manager reviewed the report very ____ before the meeting.',
            'explanation' => 'An adverb is needed to modify the verb reviewed.',
            'grammar_formula' => ['title' => 'Word form', 'pattern' => 'Verb + adverb', 'example' => 'She reviewed the report carefully.'],
            'vocabulary_hints' => [['word' => 'review', 'meaning' => 'xem xet'], ['word' => 'carefully', 'meaning' => 'can than']],
            'topic_id' => $office->id,
            'grammar_point_id' => $grammar->id,
            'difficulty_level' => 'easy',
            'difficulty_score' => 30,
            'estimated_time_seconds' => 30,
        ], [
            ['answer_text' => 'careful', 'is_correct' => false, 'display_order' => 1],
            ['answer_text' => 'carefully', 'is_correct' => true, 'display_order' => 2],
            ['answer_text' => 'care', 'is_correct' => false, 'display_order' => 3],
            ['answer_text' => 'caring', 'is_correct' => false, 'display_order' => 4],
        ]);

        $this->seedQuestion([
            'id' => 2,
            'skill' => 'listening',
            'part' => 1,
            'question_type' => 'photograph',
            'question_text' => 'What is happening in the picture?',
            'transcript' => 'A woman is arranging documents on a desk.',
            'audio_url' => 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg',
            'image_url' => 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
            'explanation' => 'The correct answer describes office work with documents.',
            'topic_id' => $business->id,
            'difficulty_level' => 'easy',
            'difficulty_score' => 28,
            'estimated_time_seconds' => 35,
        ], [
            ['answer_text' => 'A woman is arranging documents.', 'is_correct' => true, 'display_order' => 1],
            ['answer_text' => 'A man is opening a window.', 'is_correct' => false, 'display_order' => 2],
            ['answer_text' => 'People are boarding a train.', 'is_correct' => false, 'display_order' => 3],
            ['answer_text' => 'The room is empty.', 'is_correct' => false, 'display_order' => 4],
        ]);

        $demoTest = TestSet::query()->updateOrCreate(['id' => 1], [
            'title' => 'Demo Mini Test',
            'type' => 'mini',
            'description' => 'Short mixed TOEIC check from seeded questions.',
            'listening_question_count' => 1,
            'reading_question_count' => 1,
            'duration_minutes' => 12,
            'difficulty_level' => 'easy',
            'estimated_score_min' => 350,
            'estimated_score_max' => 650,
            'is_published' => true,
        ]);
        $demoTest->questions()->sync([
            2 => ['question_group_id' => null, 'section' => 'listening', 'display_order' => 1],
            1 => ['question_group_id' => null, 'section' => 'reading', 'display_order' => 2],
        ]);
    }

    private function seedQuestion(array $question, array $answers): void
    {
        $model = Question::query()->updateOrCreate(['id' => $question['id']], $question + ['is_active' => true]);
        $model->answers()->delete();
        foreach ($answers as $answer) {
            Answer::query()->create($answer + ['question_id' => $model->id]);
        }
    }
}
