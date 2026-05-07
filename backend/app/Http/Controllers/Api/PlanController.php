<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Plan;

class PlanController extends Controller
{
    public function index()
    {
        return response()->json([
            'success' => true,
            'plans' => Plan::query()->where('is_active', true)->orderBy('id')->get(),
        ]);
    }
}
