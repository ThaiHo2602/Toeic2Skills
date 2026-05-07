<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->unsignedInteger('price')->default(0);
            $table->string('currency', 8)->default('VND');
            $table->unsignedSmallInteger('duration_days')->nullable();
            $table->integer('daily_test_limit')->nullable();
            $table->integer('ai_explanation_limit')->nullable();
            $table->boolean('has_ai_features')->default(false);
            $table->boolean('has_weakness_analysis')->default(false);
            $table->boolean('has_adaptive_learning')->default(false);
            $table->boolean('has_advanced_dashboard')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained()->restrictOnDelete();
            $table->enum('status', ['active', 'expired', 'cancelled', 'pending'])->default('pending');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'status', 'expires_at']);
        });

        Schema::create('payment_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('amount');
            $table->string('currency', 8)->default('VND');
            $table->string('provider')->default('mock');
            $table->string('provider_transaction_id')->nullable();
            $table->enum('status', ['pending', 'success', 'failed', 'refunded'])->default('pending');
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        Schema::create('user_daily_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('usage_date');
            $table->unsignedInteger('test_count')->default(0);
            $table->unsignedInteger('ai_explanation_count')->default(0);
            $table->timestamps();
            $table->unique(['user_id', 'usage_date']);
        });

        Schema::create('topics', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('skill', ['listening', 'reading', 'both'])->default('both');
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('grammar_points', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('category')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('question_groups', function (Blueprint $table) {
            $table->id();
            $table->enum('skill', ['listening', 'reading']);
            $table->unsignedTinyInteger('part');
            $table->string('title')->nullable();
            $table->string('group_type')->nullable();
            $table->longText('passage_text')->nullable();
            $table->longText('transcript')->nullable();
            $table->string('audio_url', 500)->nullable();
            $table->string('image_url', 500)->nullable();
            $table->string('source')->nullable();
            $table->timestamps();
        });

        Schema::create('questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('question_group_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('skill', ['listening', 'reading']);
            $table->unsignedTinyInteger('part');
            $table->string('question_type')->nullable();
            $table->longText('question_text')->nullable();
            $table->longText('passage_text')->nullable();
            $table->longText('transcript')->nullable();
            $table->string('audio_url', 500)->nullable();
            $table->string('image_url', 500)->nullable();
            $table->longText('explanation')->nullable();
            $table->json('grammar_formula')->nullable();
            $table->json('vocabulary_hints')->nullable();
            $table->foreignId('topic_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('grammar_point_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('difficulty_level', ['easy', 'medium', 'hard'])->default('medium');
            $table->unsignedTinyInteger('difficulty_score')->default(55);
            $table->unsignedSmallInteger('estimated_time_seconds')->default(60);
            $table->decimal('correct_rate', 5, 2)->default(0);
            $table->unsignedInteger('attempt_count')->default(0);
            $table->unsignedInteger('correct_count')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['skill', 'part', 'difficulty_score', 'is_active']);
        });

        Schema::create('answers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('question_id')->constrained()->cascadeOnDelete();
            $table->text('answer_text');
            $table->string('answer_audio_url', 500)->nullable();
            $table->boolean('is_correct')->default(false);
            $table->unsignedTinyInteger('display_order')->default(1);
            $table->text('explanation')->nullable();
            $table->timestamps();
        });

        Schema::create('attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('mode', ['practice', 'mini_test', 'full_test', 'placement'])->default('practice');
            $table->enum('skill', ['listening', 'reading', 'both'])->default('both');
            $table->unsignedTinyInteger('part')->nullable();
            $table->boolean('adaptive')->default(false);
            $table->enum('status', ['in_progress', 'completed', 'expired', 'abandoned'])->default('in_progress');
            $table->timestamp('started_at');
            $table->timestamp('submitted_at')->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->unsignedSmallInteger('total_questions')->default(0);
            $table->unsignedSmallInteger('correct_count')->nullable();
            $table->decimal('accuracy', 5, 2)->nullable();
            $table->unsignedSmallInteger('estimated_listening_score')->nullable();
            $table->unsignedSmallInteger('estimated_reading_score')->nullable();
            $table->unsignedSmallInteger('estimated_total_score')->nullable();
            $table->decimal('score_confidence', 5, 2)->nullable();
            $table->timestamps();
        });

        Schema::create('attempt_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attempt_id')->constrained('attempts')->cascadeOnDelete();
            $table->foreignId('question_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('display_order');
            $table->unique(['attempt_id', 'question_id']);
        });

        Schema::create('user_answers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attempt_id')->constrained('attempts')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('question_id')->constrained()->cascadeOnDelete();
            $table->foreignId('selected_answer_id')->nullable()->constrained('answers')->nullOnDelete();
            $table->boolean('is_correct')->default(false);
            $table->unsignedInteger('time_spent_seconds')->nullable();
            $table->timestamp('answered_at')->nullable();
            $table->timestamps();
            $table->unique(['attempt_id', 'question_id']);
        });

        Schema::create('user_skill_stats', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('skill', ['listening', 'reading']);
            $table->unsignedTinyInteger('level_score')->default(50);
            $table->unsignedInteger('total_answered')->default(0);
            $table->unsignedInteger('total_correct')->default(0);
            $table->decimal('accuracy', 5, 2)->default(0);
            $table->unsignedSmallInteger('estimated_score')->nullable();
            $table->timestamp('last_practiced_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'skill']);
        });

        Schema::create('user_part_stats', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('skill', ['listening', 'reading']);
            $table->unsignedTinyInteger('part');
            $table->unsignedTinyInteger('level_score')->default(50);
            $table->unsignedInteger('total_answered')->default(0);
            $table->unsignedInteger('total_correct')->default(0);
            $table->decimal('accuracy', 5, 2)->default(0);
            $table->decimal('avg_time_seconds', 8, 2)->default(0);
            $table->timestamp('last_practiced_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'part']);
        });

        Schema::create('user_weaknesses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('weakness_type', ['part', 'topic', 'grammar']);
            $table->enum('skill', ['listening', 'reading']);
            $table->unsignedTinyInteger('part')->nullable();
            $table->foreignId('topic_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('grammar_point_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('severity_score')->default(50);
            $table->decimal('accuracy', 5, 2)->default(0);
            $table->unsignedInteger('sample_size')->default(0);
            $table->timestamp('last_detected_at')->nullable();
            $table->timestamps();
        });

        Schema::create('bookmarks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('question_id')->constrained()->cascadeOnDelete();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'question_id']);
        });

        Schema::create('vocabulary_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('question_id')->nullable()->constrained()->nullOnDelete();
            $table->string('word');
            $table->string('meaning')->nullable();
            $table->string('example')->nullable();
            $table->string('source')->nullable();
            $table->timestamps();
        });

        Schema::create('feature_access_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('feature_key');
            $table->boolean('allowed')->default(false);
            $table->string('reason')->nullable();
            $table->timestamps();
        });

        Schema::create('admin_activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action');
            $table->string('subject_type')->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach ([
            'admin_activity_logs', 'feature_access_logs', 'vocabulary_items', 'bookmarks',
            'user_weaknesses', 'user_part_stats', 'user_skill_stats', 'user_answers',
            'attempt_questions', 'attempts', 'answers', 'questions', 'question_groups',
            'grammar_points', 'topics', 'user_daily_usages', 'payment_transactions',
            'subscriptions', 'plans',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
