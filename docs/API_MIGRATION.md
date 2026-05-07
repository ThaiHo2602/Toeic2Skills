# TOEIC2Skills API Migration Notes

Backend moi nam trong `backend/` va la Laravel + MySQL API. Frontend hien tai van chay bang localStorage, nen nen migrate tung service mot cach an toan.

## Local services can thay the

| Frontend service | Local responsibility | Backend endpoint thay the |
| --- | --- | --- |
| `src/services/storage.ts` | user, attempts, bookmarks, question state trong localStorage | `POST /api/auth/*`, `GET /api/auth/me`, `GET /api/attempts/{id}`, `GET /api/attempts/{id}/result`, admin question APIs |
| `src/services/subscription.ts` | Free/Premium, daily limit, feature gate | `GET /api/plans`, `GET /api/me/subscription`, `POST /api/subscriptions/subscribe`, `POST /api/subscriptions/cancel`, `GET /api/me/usage/today`, `GET /api/features/{featureKey}/access` |
| `src/services/scoring.ts` | estimated TOEIC score | `POST /api/attempts/{id}/submit`, `GET /api/attempts/{id}/result` |
| `src/services/adaptive.ts` | adaptive question selection | `POST /api/practice/adaptive/start` |

## Safe migration order

1. Add `VITE_API_BASE_URL=http://127.0.0.1:8000/api` to frontend env.
2. Replace auth first: login/register/logout/me. Store Sanctum bearer token in an API client wrapper.
3. Replace subscription summary and usage widgets with `/api/me/subscription`.
4. Replace practice start with `/api/practice/start`. The backend must be the only source of question options and must not expose `is_correct`.
5. Replace answer submit with `/api/attempts/{id}/answers`.
6. Replace scoring/result with `/api/attempts/{id}/submit` and `/api/attempts/{id}/result`.
7. Migrate admin question bank to `/api/admin/questions`.
8. Replace premium feature routes only after UI handles `PREMIUM_REQUIRED` and `DAILY_TEST_LIMIT_REACHED`.

## Important contracts

- Frontend must never send `role`, `plan_id`, `score`, `is_correct`, or `correct_answer`.
- Backend returns correct answers only in result/review after attempt submission.
- Free users can submit and see basic estimated score.
- Premium/admin-only APIs return `403` with `upgrade_required: true`.
- Admin users bypass onboarding, daily limits, and premium gates.

## Still mock / phase later

- `/api/ai/explain` is a protected placeholder and returns `mock: true`.
- `/api/recommendations`, `/api/analysis/weaknesses`, `/api/dashboard/advanced` are protected placeholders until analytics jobs are implemented.
- Automatic import from `src/data.ts` is not wired; seeders create minimal sample data. Importing real content should be done through admin API or a dedicated importer.
