# Security Test Checklist

Run this checklist after the backend is implemented.

## Authentication

- [ ] Register rejects weak passwords shorter than 8 characters.
- [ ] Register rejects passwords without letters and numbers.
- [ ] Login failed message does not reveal whether email exists.
- [ ] Login is rate-limited after 5 failed attempts per minute per IP/email.
- [ ] Logout revokes session/token.
- [ ] API never returns password hash/token in user payload.

## Authorization

- [ ] Normal user cannot call any `/api/admin/*` endpoint.
- [ ] Free user cannot call AI explain.
- [ ] Free user cannot call weakness analysis.
- [ ] Free user cannot start adaptive practice.
- [ ] Premium access is checked from DB subscription, not request body.
- [ ] Expired subscription falls back to Free.
- [ ] Access denied events are written to `feature_access_logs`.

## Attempt & Scoring Integrity

- [ ] Question list does not return `is_correct` before submit.
- [ ] Submit request only sends `attempt_id`, `question_id`, `selected_answer_id`.
- [ ] Backend calculates score without trusting frontend score fields.
- [ ] User A cannot view or submit User B's attempt.
- [ ] Completed attempt cannot be submitted again.
- [ ] Submit rejects question IDs not included in the attempt.
- [ ] Full/mini test hides study tools and returns explanations only after submit.

## API Abuse

- [ ] Start test is rate-limited and also checks daily plan limit.
- [ ] Submit attempt is rate-limited.
- [ ] AI explain is rate-limited and plan quota-limited.
- [ ] Pagination max page size is enforced.
- [ ] Unknown sort fields are rejected or ignored.

## Upload

- [ ] Image upload accepts only jpg/jpeg/png/webp.
- [ ] Audio upload accepts only mp3/wav/m4a.
- [ ] SVG/HTML/JS/PHP files are rejected.
- [ ] Oversized files are rejected.
- [ ] Uploaded file names are randomized.
- [ ] Upload requires admin role.

## Web Security

- [ ] Production responses include CSP/security headers.
- [ ] CORS rejects unknown origins.
- [ ] Cookies are httpOnly, secure in production, sameSite lax/strict.
- [ ] CSRF token is required for cookie-auth mutations.
- [ ] Production errors do not include stack traces.

## Secrets & Logging

- [ ] `.env` is not committed.
- [ ] API keys are backend-only and not prefixed with `VITE_`.
- [ ] Logs do not include passwords, tokens, or API keys.
- [ ] Payment callbacks verify provider signatures.
