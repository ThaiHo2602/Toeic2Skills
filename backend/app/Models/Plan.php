<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Plan extends Model
{
    protected $guarded = [];

    protected $casts = [
        'price' => 'integer',
        'duration_days' => 'integer',
        'daily_test_limit' => 'integer',
        'ai_explanation_limit' => 'integer',
        'has_ai_features' => 'boolean',
        'has_weakness_analysis' => 'boolean',
        'has_adaptive_learning' => 'boolean',
        'has_advanced_dashboard' => 'boolean',
        'is_active' => 'boolean',
    ];
}
