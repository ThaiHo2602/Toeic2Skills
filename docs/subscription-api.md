# Subscription API Contract

The current app is a React + Vite MVP with local service-layer persistence. These endpoints are implemented as service methods in `src/services/subscription.ts` and should become backend endpoints when Laravel or Node.js is added.

## Endpoints

```http
GET  /api/plans
GET  /api/me/subscription
POST /api/subscriptions/subscribe
POST /api/subscriptions/cancel
GET  /api/features/{featureKey}/access
GET  /api/me/usage/today
```

Protected starts:

```http
POST /api/practice/start
POST /api/tests/start
POST /api/full-tests/start
POST /api/mini-tests/start
POST /api/practice/adaptive/start
```

Premium-only features:

```http
GET  /api/analysis/weaknesses
GET  /api/recommendations
POST /api/ai/explain
GET  /api/dashboard/advanced
POST /api/practice/adaptive/start
```

## Middleware Mapping

- `CheckDailyTestLimit`: call `checkDailyTestLimit()` before creating any attempt.
- `CheckPremiumFeature:{featureKey}`: call `checkPremiumFeature()` before returning premium feature data.

## Error Responses

```json
{
  "success": false,
  "code": "DAILY_TEST_LIMIT_REACHED",
  "message": "Bạn đã dùng hết 5 lượt luyện thi hôm nay. Nâng cấp Premium để luyện không giới hạn.",
  "upgrade_required": true
}
```

```json
{
  "success": false,
  "code": "PREMIUM_REQUIRED",
  "message": "Tính năng này dành cho tài khoản Premium.",
  "feature": "weakness_analysis",
  "upgrade_required": true
}
```

## Quick Test Checklist

- Free user can start 5 practice/test sessions per day.
- Free user is blocked on the 6th start.
- Submit does not increment `test_count`.
- Premium user can start unlimited sessions.
- Free user cannot access AI explanation, recommendations, adaptive learning, weakness analysis, or advanced dashboard.
- Premium user can access premium features.
- Mock subscribe creates a successful payment transaction and active subscription.
- Cancel subscription changes status to `cancelled`.
- Expired subscription falls back to Free.
- `GET /api/me/subscription` equivalent returns `remaining_tests_today`.
