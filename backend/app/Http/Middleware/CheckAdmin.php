<?php

namespace App\Http\Middleware;

use App\Models\AdminActivityLog;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!$request->user()?->isAdmin()) {
            AdminActivityLog::query()->create([
                'admin_user_id' => $request->user()?->id,
                'action' => 'admin_access_denied',
                'metadata' => ['path' => $request->path()],
            ]);

            return response()->json([
                'success' => false,
                'code' => 'ADMIN_REQUIRED',
                'message' => 'Admin access required.',
            ], 403);
        }

        return $next($request);
    }
}
