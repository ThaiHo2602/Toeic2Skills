# TOEIC2Skills Backend

Secure Node.js/Express API scaffold for the TOEIC Listening + Reading app.

## Run

```bash
cd backend
npm install
npm run dev
```

API base URL:

```text
http://127.0.0.1:8000/api
```

Demo accounts:

```text
learner@example.com / Password1
admin@example.com / Admin1234
```

## Implemented Security Baseline

- `helmet` security headers.
- strict CORS allow-list from `FRONTEND_ORIGINS`.
- httpOnly SameSite session cookie.
- bcrypt password hashing.
- generic login failure message.
- login/register/API/AI/upload rate limits.
- zod validation.
- admin role middleware.
- premium feature middleware.
- daily test limit middleware.
- server-side attempt scoring.
- no correct answer leakage before submit.
- upload MIME and size validation.
- feature access/admin upload logs.

## Key Endpoints

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me

GET  /api/plans
GET  /api/me/subscription
GET  /api/me/usage/today
POST /api/subscriptions/subscribe
POST /api/subscriptions/cancel
GET  /api/features/:featureKey/access

POST /api/practice/start
POST /api/practice/adaptive/start
POST /api/tests/start
POST /api/mini-tests/start
POST /api/full-tests/start
POST /api/attempts/:id/submit
GET  /api/attempts/:id/review

GET  /api/analysis/weaknesses
GET  /api/recommendations
POST /api/ai/explain

GET  /api/admin/questions
POST /api/admin/upload
```

## Production Notes

This MVP backend uses an in-memory store so it can run immediately. Replace `src/store.js` with a database repository before production:

- PostgreSQL + Prisma, or Laravel + MySQL/PostgreSQL.
- Store sessions/refresh tokens in DB or Redis.
- Store uploads in S3/R2.
- Verify payment provider signatures.
- Keep AI/payment secrets only in backend `.env`.
