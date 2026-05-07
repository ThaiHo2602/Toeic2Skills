<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserPartStat extends Model
{
    protected $guarded = [];

    protected $casts = [
        'accuracy' => 'decimal:2',
        'avg_time_seconds' => 'decimal:2',
        'last_practiced_at' => 'datetime',
    ];
}
