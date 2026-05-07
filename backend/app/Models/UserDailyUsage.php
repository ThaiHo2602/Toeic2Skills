<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserDailyUsage extends Model
{
    protected $guarded = [];

    protected $casts = [
        'usage_date' => 'date',
        'test_count' => 'integer',
        'ai_explanation_count' => 'integer',
    ];
}
