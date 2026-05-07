<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Answer extends Model
{
    protected $guarded = [];

    protected $casts = [
        'is_correct' => 'boolean',
        'display_order' => 'integer',
    ];
}
