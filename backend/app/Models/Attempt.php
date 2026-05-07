<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Attempt extends Model
{
    protected $guarded = [];

    protected $casts = [
        'adaptive' => 'boolean',
        'started_at' => 'datetime',
        'submitted_at' => 'datetime',
        'accuracy' => 'decimal:2',
        'score_confidence' => 'decimal:2',
    ];

    public function questions()
    {
        return $this->belongsToMany(Question::class, 'attempt_questions')
            ->withPivot('display_order')
            ->orderBy('attempt_questions.display_order');
    }

    public function userAnswers()
    {
        return $this->hasMany(UserAnswer::class);
    }
}
