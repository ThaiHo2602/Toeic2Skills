<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserWeakness extends Model
{
    protected $guarded = [];

    protected $casts = [
        'accuracy' => 'decimal:2',
        'last_detected_at' => 'datetime',
    ];

    public function topic()
    {
        return $this->belongsTo(Topic::class);
    }

    public function grammarPoint()
    {
        return $this->belongsTo(GrammarPoint::class);
    }
}
