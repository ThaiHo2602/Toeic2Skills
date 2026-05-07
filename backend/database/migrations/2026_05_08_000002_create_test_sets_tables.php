<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('test_sets', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->enum('type', ['mini', 'full', 'placement'])->default('mini');
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('listening_question_count')->default(0);
            $table->unsignedSmallInteger('reading_question_count')->default(0);
            $table->unsignedSmallInteger('duration_minutes')->default(15);
            $table->string('difficulty_level')->default('medium');
            $table->unsignedSmallInteger('estimated_score_min')->nullable();
            $table->unsignedSmallInteger('estimated_score_max')->nullable();
            $table->boolean('is_published')->default(false);
            $table->timestamps();
            $table->index(['type', 'is_published']);
        });

        Schema::create('test_set_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('test_set_id')->constrained()->cascadeOnDelete();
            $table->foreignId('question_id')->constrained()->cascadeOnDelete();
            $table->foreignId('question_group_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('section', ['listening', 'reading']);
            $table->unsignedSmallInteger('display_order');
            $table->timestamps();
            $table->unique(['test_set_id', 'question_id']);
            $table->index(['test_set_id', 'section', 'display_order']);
        });

        Schema::table('attempts', function (Blueprint $table) {
            $table->foreignId('test_set_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attempts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('test_set_id');
        });
        Schema::dropIfExists('test_set_questions');
        Schema::dropIfExists('test_sets');
    }
};
