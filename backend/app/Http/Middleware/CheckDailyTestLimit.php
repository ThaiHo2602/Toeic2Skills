<?php

namespace App\Http\Middleware;

use App\Services\SubscriptionService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckDailyTestLimit
{
    public function __construct(private readonly SubscriptionService $subscriptions)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$this->subscriptions->canStartTest($user)) {
            $plan = $this->subscriptions->getCurrentPlan($user);
            return response()->json([
                'success' => false,
                'code' => 'DAILY_TEST_LIMIT_REACHED',
                'message' => "Bạn đã dùng hết {$plan->daily_test_limit} lượt luyện thi hôm nay. Nâng cấp Premium để luyện không giới hạn.",
                'upgrade_required' => true,
            ], 403);
        }

        $this->subscriptions->incrementTestCount($user);
        return $next($request);
    }
}
