<?php

use App\Http\Controllers\Api\AdminQuestionController;
use App\Http\Controllers\Api\AdminMediaController;
use App\Http\Controllers\Api\AttemptController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\FeatureController;
use App\Http\Controllers\Api\PlanController;
use App\Http\Controllers\Api\PracticeController;
use App\Http\Controllers\Api\SubscriptionController;
use Illuminate\Support\Facades\Route;

Route::middleware('throttle:60,1')->group(function () {
    Route::get('/plans', [PlanController::class, 'index']);
});

Route::middleware('throttle:5,1')->group(function () {
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login', [AuthController::class, 'login']);
});

Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::get('/me/subscription', [SubscriptionController::class, 'current']);
    Route::get('/me/usage/today', [SubscriptionController::class, 'usageToday']);
    Route::get('/dashboard', [DashboardController::class, 'summary']);
    Route::get('/attempts', [DashboardController::class, 'attempts']);
    Route::post('/subscriptions/subscribe', [SubscriptionController::class, 'subscribe'])->middleware('throttle:10,1');
    Route::post('/subscriptions/cancel', [SubscriptionController::class, 'cancel']);
    Route::get('/features/{featureKey}/access', [FeatureController::class, 'access']);

    Route::post('/practice/start', [PracticeController::class, 'start'])->middleware(['daily.test.limit', 'throttle:20,1']);
    Route::post('/tests/start', [PracticeController::class, 'start'])->middleware(['daily.test.limit', 'throttle:20,1']);
    Route::post('/practice/adaptive/start', [PracticeController::class, 'start'])->middleware(['premium.feature:adaptive_learning', 'daily.test.limit', 'throttle:20,1']);

    Route::get('/attempts/{attempt}', [AttemptController::class, 'show']);
    Route::post('/attempts/{attempt}/answers', [AttemptController::class, 'answer'])->middleware('throttle:120,1');
    Route::post('/attempts/{attempt}/submit', [AttemptController::class, 'submit'])->middleware('throttle:30,1');
    Route::get('/attempts/{attempt}/result', [AttemptController::class, 'result']);

    Route::get('/analysis/weaknesses', fn () => response()->json(['success' => true, 'weaknesses' => []]))->middleware('premium.feature:weakness_analysis');
    Route::get('/recommendations', fn () => response()->json(['success' => true, 'recommendations' => []]))->middleware('premium.feature:recommendations');
    Route::get('/dashboard/advanced', fn () => response()->json(['success' => true, 'dashboard' => []]))->middleware('premium.feature:advanced_dashboard');
    Route::post('/ai/explain', fn () => response()->json(['success' => true, 'explanation' => null, 'mock' => true]))->middleware(['premium.feature:ai_explanation', 'throttle:10,1']);

    Route::middleware('admin')->prefix('admin')->group(function () {
        Route::post('media', [AdminMediaController::class, 'store'])->middleware('throttle:20,1');
        Route::apiResource('questions', AdminQuestionController::class)->except(['show']);
    });
});
