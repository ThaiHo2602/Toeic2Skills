<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SubscriptionService;
use Illuminate\Http\Request;

class FeatureController extends Controller
{
    public function __construct(private readonly SubscriptionService $subscriptions)
    {
    }

    public function access(Request $request, string $featureKey)
    {
        $allowed = $this->subscriptions->userHasFeature($request->user(), $featureKey);
        $this->subscriptions->logFeatureAccess($request->user(), $featureKey, $allowed, $allowed ? 'allowed' : 'checked');

        return response()->json([
            'success' => true,
            'feature' => $featureKey,
            'allowed' => $allowed,
            'upgrade_required' => !$allowed,
        ]);
    }
}
