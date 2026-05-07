<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Services\SubscriptionService;
use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    public function __construct(private readonly SubscriptionService $subscriptions)
    {
    }

    public function current(Request $request)
    {
        $user = $request->user();
        $plan = $this->subscriptions->getCurrentPlan($user);
        $subscription = $this->subscriptions->getActiveSubscription($user);
        $usage = $this->subscriptions->getTodayUsage($user);
        $remaining = $plan->daily_test_limit === null ? null : max(0, $plan->daily_test_limit - $usage->test_count);

        return response()->json([
            'success' => true,
            'plan' => $plan->slug,
            'plan_name' => $plan->name,
            'is_premium' => $this->subscriptions->isPremium($user),
            'subscription_status' => $subscription?->status ?? ($plan->slug === 'free' ? 'free' : null),
            'expires_at' => $subscription?->expires_at,
            'daily_test_limit' => $plan->daily_test_limit,
            'used_tests_today' => $usage->test_count,
            'remaining_tests_today' => $remaining,
            'features' => [
                'ai_explanation' => $this->subscriptions->userHasFeature($user, 'ai_explanation'),
                'weakness_analysis' => $this->subscriptions->userHasFeature($user, 'weakness_analysis'),
                'adaptive_learning' => $this->subscriptions->userHasFeature($user, 'adaptive_learning'),
                'advanced_dashboard' => $this->subscriptions->userHasFeature($user, 'advanced_dashboard'),
                'recommendations' => $this->subscriptions->userHasFeature($user, 'recommendations'),
            ],
        ]);
    }

    public function subscribe(Request $request)
    {
        $data = $request->validate(['plan_slug' => ['required', 'string', 'exists:plans,slug']]);
        $plan = Plan::query()->where('slug', $data['plan_slug'])->where('is_active', true)->firstOrFail();
        $subscription = $this->subscriptions->subscribeUser($request->user(), $plan);

        return response()->json(['success' => true, 'subscription' => $subscription->load('plan')], 201);
    }

    public function cancel(Request $request)
    {
        $this->subscriptions->cancelSubscription($request->user());
        return response()->json(['success' => true]);
    }

    public function usageToday(Request $request)
    {
        return response()->json(['success' => true, 'usage' => $this->subscriptions->getTodayUsage($request->user())]);
    }
}
