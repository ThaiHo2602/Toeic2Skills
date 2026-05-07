# TOEIC2Skills Laravel API

Laravel + MySQL backend for TOEIC Listening + Reading. This API is authoritative for auth, subscriptions, daily limits, question bank, attempts, scoring, and premium feature access.

## Setup

```bash
cd backend
copy .env.example .env
composer update --no-dev
php artisan key:generate
php artisan migrate --seed
php artisan serve --host=127.0.0.1 --port=8000
```

If Composer fails because PHP zip/unzip is missing, enable the `zip` extension in `D:\xampp\php\php.ini` or install 7-Zip/unzip, then rerun `composer update --no-dev`.

## Demo accounts

- User: `learner@example.com` / `Password1`
- Admin: `admin@example.com` / `Admin1234`

## Main endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Subscription

- `GET /api/plans`
- `GET /api/me/subscription`
- `POST /api/subscriptions/subscribe`
- `POST /api/subscriptions/cancel`
- `GET /api/me/usage/today`
- `GET /api/features/{featureKey}/access`

### Practice/Test

- `POST /api/practice/start`
- `POST /api/tests/start`
- `POST /api/practice/adaptive/start`
- `GET /api/attempts/{id}`
- `POST /api/attempts/{id}/answers`
- `POST /api/attempts/{id}/submit`
- `GET /api/attempts/{id}/result`

### Admin

- `GET /api/admin/questions`
- `POST /api/admin/questions`
- `PUT /api/admin/questions/{question}`
- `DELETE /api/admin/questions/{question}`

## Quick curl

```bash
curl -X POST http://127.0.0.1:8000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@example.com\",\"password\":\"Admin1234\"}"
```

Use the returned token:

```bash
curl http://127.0.0.1:8000/api/me/subscription ^
  -H "Authorization: Bearer YOUR_TOKEN"
```

Start practice:

```bash
curl -X POST http://127.0.0.1:8000/api/practice/start ^
  -H "Authorization: Bearer YOUR_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"skill\":\"reading\",\"part\":5,\"question_count\":5}"
```
