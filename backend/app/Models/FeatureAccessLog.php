<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FeatureAccessLog extends Model
{
    protected $guarded = [];

    protected $casts = [
        'allowed' => 'boolean',
    ];
}
