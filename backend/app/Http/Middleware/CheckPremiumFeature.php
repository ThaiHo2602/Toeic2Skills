<?php

namespace App\Http\Middleware;

use App\Services\SubscriptionService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPremiumFeature
{
    public function __construct(private readonly SubscriptionService $subscriptions)
    {
    }

    public function handle(Request $request, Closure $next, string $featureKey): Response
    {
        $allowed = $this->subscriptions->userHasFeature($request->user(), $featureKey);
        $this->subscriptions->logFeatureAccess($request->user(), $featureKey, $allowed, $allowed ? 'allowed' : 'premium_required');

        if (!$allowed) {
            return response()->json([
                'success' => false,
                'code' => 'PREMIUM_REQUIRED',
                'message' => 'Tính năng này dành cho tài khoản Premium.',
                'feature' => $featureKey,
                'upgrade_required' => true,
            ], 403);
        }

        return $next($request);
    }
}
