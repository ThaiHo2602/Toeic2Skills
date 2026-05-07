<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserSkillStat extends Model
{
    protected $guarded = [];

    protected $casts = [
        'accuracy' => 'decimal:2',
        'last_practiced_at' => 'datetime',
    ];
}
