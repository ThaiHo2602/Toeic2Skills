<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TestSet extends Model
{
    protected $guarded = [];

    protected $casts = [
        'is_published' => 'boolean',
        'listening_question_count' => 'integer',
        'reading_question_count' => 'integer',
        'duration_minutes' => 'integer',
        'estimated_score_min' => 'integer',
        'estimated_score_max' => 'integer',
    ];

    public function questions()
    {
        return $this->belongsToMany(Question::class, 'test_set_questions')
            ->withPivot(['question_group_id', 'section', 'display_order'])
            ->orderBy('test_set_questions.display_order');
    }
}
