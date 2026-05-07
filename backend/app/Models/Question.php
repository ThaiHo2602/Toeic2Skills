<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Question extends Model
{
    protected $guarded = [];

    protected $casts = [
        'grammar_formula' => 'array',
        'vocabulary_hints' => 'array',
        'difficulty_score' => 'integer',
        'estimated_time_seconds' => 'integer',
        'correct_rate' => 'decimal:2',
        'attempt_count' => 'integer',
        'correct_count' => 'integer',
        'is_active' => 'boolean',
    ];

    public function answers()
    {
        return $this->hasMany(Answer::class)->orderBy('display_order');
    }

    public function group()
    {
        return $this->belongsTo(QuestionGroup::class, 'question_group_id');
    }
}
