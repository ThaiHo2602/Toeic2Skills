<?php

namespace App\Services;

use App\Models\FeatureAccessLog;
use App\Models\PaymentTransaction;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Models\UserDailyUsage;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SubscriptionService
{
    public const FEATURE_MAP = [
        'ai_explanation' => 'has_ai_features',
        'weakness_analysis' => 'has_weakness_analysis',
        'adaptive_learning' => 'has_adaptive_learning',
        'advanced_dashboard' => 'has_advanced_dashboard',
        'recommendations' => 'has_adaptive_learning',
    ];

    public function getCurrentPlan(User $user): Plan
    {
        if ($user->isAdmin()) {
            return $this->adminPlan();
        }

        $subscription = $this->getActiveSubscription($user);
        return $subscription?->plan ?? Plan::query()->where('slug', 'free')->firstOrFail();
    }

    public function isPremium(User $user): bool
    {
        return $user->isAdmin() || $this->getCurrentPlan($user)->slug !== 'free';
    }

    public function getActiveSubscription(User $user): ?Subscription
    {
        return Subscription::query()
            ->with('plan')
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->where(function ($query) {
                $query->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->latest('expires_at')
            ->first();
    }

    public function subscribeUser(User $user, Plan $plan): Subscription
    {
        return DB::transaction(function () use ($user, $plan) {
            Subscription::query()
                ->where('user_id', $user->id)
                ->where('status', 'active')
                ->update(['status' => 'cancelled', 'cancelled_at' => now()]);

            if ($plan->price > 0) {
                PaymentTransaction::query()->create([
                    'user_id' => $user->id,
                    'plan_id' => $plan->id,
                    'amount' => $plan->price,
                    'currency' => $plan->currency,
                    'provider' => 'mock',
                    'provider_transaction_id' => 'mock_'.Str::uuid(),
                    'status' => 'success',
                    'paid_at' => now(),
                ]);
            }

            return Subscription::query()->create([
                'user_id' => $user->id,
                'plan_id' => $plan->id,
                'status' => $plan->slug === 'free' ? 'active' : 'active',
                'started_at' => now(),
                'expires_at' => $plan->duration_days ? now()->addDays($plan->duration_days) : null,
            ]);
        });
    }

    public function cancelSubscription(User $user): void
    {
        Subscription::query()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->update(['status' => 'cancelled', 'cancelled_at' => now()]);
    }

    public function expireOldSubscriptions(): int
    {
        return Subscription::query()
            ->where('status', 'active')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired']);
    }

    public function getTodayUsage(User $user): UserDailyUsage
    {
        return UserDailyUsage::query()->firstOrCreate(
            ['user_id' => $user->id, 'usage_date' => CarbonImmutable::now()->toDateString()],
            ['test_count' => 0, 'ai_explanation_count' => 0],
        );
    }

    public function canStartTest(User $user): bool
    {
        $plan = $this->getCurrentPlan($user);
        if ($user->isAdmin() || $plan->daily_test_limit === null || $plan->daily_test_limit < 0) {
            return true;
        }

        return $this->getTodayUsage($user)->test_count < $plan->daily_test_limit;
    }

    public function incrementTestCount(User $user): void
    {
        if ($user->isAdmin()) {
            return;
        }

        $usage = $this->getTodayUsage($user);
        $usage->increment('test_count');
    }

    public function userHasFeature(User $user, string $featureKey): bool
    {
        if ($user->isAdmin() || $featureKey === 'unlimited_tests') {
            return $user->isAdmin() || $this->getCurrentPlan($user)->daily_test_limit === null;
        }

        $column = self::FEATURE_MAP[$featureKey] ?? null;
        return $column ? (bool) $this->getCurrentPlan($user)->{$column} : false;
    }

    public function logFeatureAccess(User $user, string $featureKey, bool $allowed, string $reason): void
    {
        FeatureAccessLog::query()->create([
            'user_id' => $user->id,
            'feature_key' => $featureKey,
            'allowed' => $allowed,
            'reason' => $reason,
        ]);
    }

    private function adminPlan(): Plan
    {
        $plan = new Plan([
            'name' => 'Admin',
            'slug' => 'admin',
            'price' => 0,
            'currency' => 'VND',
            'daily_test_limit' => null,
            'ai_explanation_limit' => null,
            'has_ai_features' => true,
            'has_weakness_analysis' => true,
            'has_adaptive_learning' => true,
            'has_advanced_dashboard' => true,
            'is_active' => true,
        ]);
        $plan->exists = true;
        return $plan;
    }
}
