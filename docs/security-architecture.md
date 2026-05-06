# TOEIC 2 Skills Security Architecture

## Current Stack Review

- Frontend: React 19 + Vite + TypeScript.
- Backend: not implemented yet.
- Auth: demo-only state in `localStorage`; no real password storage, hash, session, token, or server validation exists.
- Routes: frontend view switching, not server routing.
- Database: SQL design files only; no runtime DB connection.
- Subscription/Premium: demo service in `src/services/subscription.ts`; real enforcement must be done by backend later.
- Admin: frontend UI only; not a security boundary.

## Current Findings

| Risk | Severity | Finding | Required Fix |
| --- | --- | --- | --- |
| Demo auth trusts browser state | High | `localStorage` can be edited to mark users authenticated or premium. | Implement backend auth, httpOnly sessions or short-lived access token + refresh rotation. |
| Admin UI is client-side only | High | Any user can access admin view if the frontend allows it. | Protect admin APIs with `auth + role:admin`; hide UI only as UX, not security. |
| Premium enforcement is client-side | High | Free/Premium can be bypassed by changing local state. | Check subscription from DB on every premium API. |
| Scoring is client-side demo | High | Client currently has answers in bundle and can inspect correct answers. | Backend must own answers and score attempts after submit. |
| No backend input validation | High | No API exists yet, so no request validation/mass assignment controls. | Add validation layer for every endpoint. |
| No production security headers | Medium | Static Vite app had no CSP/security meta before. | Added CSP meta now; backend/CDN must send real headers. |
| No upload validation | Medium | Admin upload is not implemented yet. | Add MIME, size, random filename, non-executable storage, AV scan if possible. |
| No API rate limit | Medium | Frontend demo has no server-side protection. | Add login/register/AI/test/upload/payment rate limit at backend. |
| Secret management not defined | Medium | No `.env.example` existed. | Added `.env.example`; keep `.env` ignored. |

## Authentication Security

Backend must implement:

- Password hashing:
  - Laravel: `Hash::make($password)` with bcrypt/argon2id.
  - Node: `argon2` preferred or `bcrypt` with cost >= 12.
- Register validation:
  - `name`: required, string, 2-80 chars.
  - `email`: required, valid email, max 254, unique.
  - `password`: required, min 8, max 128, at least one letter and one number.
- Login:
  - Use generic failed message: `Invalid email or password.`
  - Never return password hash.
  - Rate limit by IP + normalized email.
- Session/token:
  - Preferred MVP: httpOnly secure cookie session.
  - Cookie flags: `httpOnly`, `secure` in production, `sameSite=lax`.
  - JWT option: 15-minute access token, refresh token rotation stored hashed in DB.
- Logout:
  - Revoke session/refresh token server-side.

## Authorization

Do not trust any client field such as `is_premium`, `role`, `plan_id`, `score`, or `subscription_status`.

Required middleware:

1. `requireAuth`
2. `requireRole('admin')`
3. `checkPremiumFeature(featureKey)`
4. `checkAttemptOwnership`
5. `checkDailyTestLimit`
6. `rateLimit(key, limit, window)`

Premium feature keys:

- `ai_explanation`
- `weakness_analysis`
- `adaptive_learning`
- `advanced_dashboard`
- `unlimited_tests`
- `recommendations`

Premium check:

```pseudo
subscription = db.subscriptions.findFirst({
  where: {
    user_id: currentUser.id,
    status: 'active',
    expires_at: { gt: now() }
  },
  include: { plan: true }
})

plan = subscription?.plan ?? freePlan
allowed = plan.has_feature(featureKey)
logFeatureAccess(user, featureKey, allowed)
if !allowed: return 403 PREMIUM_REQUIRED
```

## API Protection Matrix

| Endpoint | Auth | Role/Plan | Rate Limit | Notes |
| --- | --- | --- | --- | --- |
| `POST /api/auth/register` | No | Public | 3/min/IP | Validate password, generic errors where possible. |
| `POST /api/auth/login` | No | Public | 5/min/IP+email | Generic failed message. |
| `POST /api/auth/logout` | Yes | User | 30/min/user | Revoke token/session. |
| `GET /api/questions` | Yes | User | 60/min/user | Do not return correct answer before submit. |
| `POST /api/practice/start` | Yes | User + daily limit | 20/min/user | Create attempt only after limit passes. |
| `POST /api/practice/adaptive/start` | Yes | Premium | 20/min/user | Also daily limit. |
| `POST /api/attempts/:id/submit` | Yes | Owner | 30/min/user | Reject completed attempts. Backend scores. |
| `GET /api/attempts/:id/review` | Yes | Owner | 60/min/user | Return answers only after submit. |
| `GET /api/analysis/weaknesses` | Yes | Premium | 30/min/user | Log denied access. |
| `GET /api/recommendations` | Yes | Premium | 30/min/user | Log denied access. |
| `POST /api/ai/explain` | Yes | Premium/Quota | plan quota | Limit input length and question ownership. |
| `POST /api/admin/questions` | Yes | Admin | 60/min/admin | Validate all fields, no mass assignment. |
| `POST /api/admin/upload` | Yes | Admin | 20/min/admin | MIME/size validation. |
| `POST /api/subscriptions/subscribe` | Yes | User | 10/min/user | Plan slug from DB only. |
| `POST /api/payments/callback` | Provider | Signature | strict | Verify provider signature. |

## Validation Rules

### Start Practice/Test

- `mode`: enum `practice | mini_test | full_test | placement`.
- `skill`: enum `listening | reading | both`.
- `part`: integer 1-7, required for practice.
- `question_count`: integer 1-200, max based on mode.
- Server picks questions; client cannot send arbitrary answer keys.

### Submit Attempt

- `attempt_id`: UUID, exists, belongs to current user.
- `answers`: array max 200.
- `answers[].question_id`: exists in attempt question set.
- `answers[].selected_answer_id`: exists and belongs to question.
- Reject if attempt status is not `in_progress`.
- Backend calculates `is_correct`, score, accuracy, confidence.

### Create/Update Question

- `skill`: enum.
- `part`: 1-7.
- `question_text`: string max 5000.
- `passage_text`, `transcript`, `explanation`: string max 50000.
- `audio_url`, `image_url`: URL or storage object key generated by upload service.
- `difficulty_score`: integer 1-100.
- `topic_id`, `grammar_point_id`: exists.
- `answers`: exact count based on part, one correct answer.
- Never accept `correct_rate`, `attempt_count`, `correct_count` from public/admin form unless explicitly internal.

### Upload

- Images: `jpg`, `jpeg`, `png`, `webp`; max 5 MB.
- Audio: `mp3`, `wav`, `m4a`; max 20 MB.
- Reject `php`, `js`, `html`, `svg` by default.
- Generate random storage filename.
- Store outside executable app directory or on object storage.

## SQL Injection Prevention

- Use ORM/query builder only.
- Whitelist sortable fields:
  - questions: `created_at`, `part`, `difficulty_score`, `correct_rate`.
  - attempts: `submitted_at`, `estimated_total_score`, `accuracy`.
- Use parameter binding for any raw query.
- Never pass table/column names from request directly into SQL.

## XSS Prevention

- React escapes text by default.
- Do not use `dangerouslySetInnerHTML` unless content is sanitized.
- Admin rich text must be sanitized with a whitelist.
- Recommended allowed tags for future rich content: `p`, `strong`, `em`, `ul`, `ol`, `li`, `br`.
- CSP was added to `index.html`; production should send CSP as HTTP header.

## CSRF/CORS

If cookie/session auth:

- Enable CSRF middleware.
- Require CSRF token on `POST/PUT/PATCH/DELETE`.
- Cookies: `httpOnly`, `secure`, `sameSite=lax`.

If Bearer token:

- CORS must only allow known frontend origins.
- Do not use `Access-Control-Allow-Origin: *` with credentials.

Recommended production CORS:

```text
allowed_origins = ["https://your-domain.com"]
allowed_methods = ["GET", "POST", "PUT", "PATCH", "DELETE"]
allowed_headers = ["Authorization", "Content-Type", "X-CSRF-Token"]
credentials = true only for cookie sessions
```

## Payment & Subscription Security

- Frontend can only send `plan_slug`.
- Backend loads plan and price from DB.
- Mock payment is acceptable only in dev.
- Production payment callback must verify provider signature.
- Store transactions with immutable amount/currency/provider status.
- Subscription active condition: `status = active AND expires_at > now`.
- Expired subscription falls back to Free automatically.

## AI API Security

- `OPENAI_API_KEY` only in backend `.env`, never `VITE_`.
- Premium check before any AI call.
- Plan quota before any AI call.
- Input length limits:
  - `question_id`: required.
  - optional user question: max 1000 chars.
- Fetch question/attempt by ownership.
- Send minimal context to AI.
- Do not let user override system/developer prompts.
- Log usage: user id, feature, token estimate, status. Do not log secrets.

## Security Headers

Frontend currently includes CSP meta as a dev fallback. Production should send HTTP headers:

```text
Content-Security-Policy: default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

## Logging

Log these events:

- Failed login over threshold.
- Access denied for admin/premium.
- Subscription/payment changes.
- AI usage and quota denied.
- Upload rejected.
- Attempt submit anomalies.

Never log:

- password
- token
- API key
- payment provider secret
- full prompt if it contains private user data

## Backend Implementation Priority

1. Auth + user roles + sessions.
2. Question/answer APIs with no correct answer leakage.
3. Attempt ownership + backend scoring.
4. Subscription middleware and daily limit.
5. Admin question bank with upload validation.
6. AI endpoint with premium/quota/rate limit.
