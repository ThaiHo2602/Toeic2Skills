# Backend Security Blueprint

This project does not have a backend yet. Use this blueprint when adding Laravel or Node.js.

## Laravel 11 Blueprint

### Middleware

```php
// routes/api.php
Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::post('/practice/start', [PracticeController::class, 'start'])
        ->middleware(['daily.test.limit']);

    Route::post('/practice/adaptive/start', [PracticeController::class, 'adaptive'])
        ->middleware(['premium.feature:adaptive_learning', 'daily.test.limit']);

    Route::get('/analysis/weaknesses', [AnalysisController::class, 'weaknesses'])
        ->middleware(['premium.feature:weakness_analysis']);

    Route::post('/ai/explain', [AiController::class, 'explain'])
        ->middleware(['premium.feature:ai_explanation', 'throttle:ai']);

    Route::middleware(['role:admin'])->prefix('admin')->group(function () {
        Route::apiResource('/questions', AdminQuestionController::class);
        Route::post('/uploads', [UploadController::class, 'store'])->middleware('throttle:uploads');
    });
});
```

```php
// CheckPremiumFeature middleware
$subscription = Subscription::query()
    ->where('user_id', $request->user()->id)
    ->where('status', 'active')
    ->where('expires_at', '>', now())
    ->with('plan')
    ->latest()
    ->first();

$plan = $subscription?->plan ?? Plan::where('slug', 'free')->firstOrFail();
$allowed = match ($feature) {
    'ai_explanation' => $plan->has_ai_features,
    'weakness_analysis' => $plan->has_weakness_analysis,
    'adaptive_learning' => $plan->has_adaptive_learning,
    'advanced_dashboard' => $plan->has_advanced_dashboard,
    'recommendations' => $plan->has_adaptive_learning || $plan->has_weakness_analysis,
    default => false,
};

FeatureAccessLog::create([
    'user_id' => $request->user()->id,
    'feature_key' => $feature,
    'allowed' => $allowed,
    'reason' => $allowed ? 'allowed' : 'premium_required',
]);

abort_unless($allowed, 403, 'PREMIUM_REQUIRED');
```

### Validation

```php
// RegisterRequest
'name' => ['required', 'string', 'min:2', 'max:80'],
'email' => ['required', 'email:rfc,dns', 'max:254', 'unique:users,email'],
'password' => ['required', 'string', 'min:8', 'max:128', 'regex:/^(?=.*[A-Za-z])(?=.*\d).+$/'],
```

```php
// SubmitAttemptRequest
'answers' => ['required', 'array', 'max:200'],
'answers.*.question_id' => ['required', 'integer', 'exists:questions,id'],
'answers.*.selected_answer_id' => ['nullable', 'integer', 'exists:answers,id'],
```

### Security Packages

- Auth/session: Laravel Sanctum.
- Password hashing: built-in `Hash::make`.
- CSRF: built-in for cookie/session routes.
- Rate limit: Laravel `RateLimiter`.
- Upload validation: Laravel validator + storage disk.

## Node.js / Express Blueprint

### Recommended Packages

```text
express
helmet
cors
zod
argon2
express-rate-limit
cookie-parser
csurf if cookie sessions
multer for uploads
file-type for MIME sniffing
prisma or knex query builder
```

### Middleware Order

```ts
app.set("trust proxy", 1);
app.use(helmet(securityHeaders));
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api/auth/login", loginRateLimit);
app.use("/api/auth/register", registerRateLimit);
app.use("/api/ai", aiRateLimit);
```

### Premium Middleware

```ts
export function requirePremiumFeature(featureKey: FeatureKey) {
  return async (req, res, next) => {
    const userId = req.user.id;
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: "active",
        expiresAt: { gt: new Date() },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });

    const plan = subscription?.plan ?? await prisma.plan.findUniqueOrThrow({ where: { slug: "free" } });
    const allowed = planHasFeature(plan, featureKey);

    await prisma.featureAccessLog.create({
      data: { userId, featureKey, allowed, reason: allowed ? "allowed" : "premium_required" },
    });

    if (!allowed) {
      return res.status(403).json({
        success: false,
        code: "PREMIUM_REQUIRED",
        message: "Tính năng này dành cho tài khoản Premium.",
        feature: featureKey,
        upgrade_required: true,
      });
    }

    next();
  };
}
```

### Attempt Submit Integrity

```ts
const attempt = await prisma.userAttempt.findFirst({
  where: { id: attemptId, userId: req.user.id },
  include: { questions: { include: { answers: true } } },
});

if (!attempt) return res.status(404).json({ code: "NOT_FOUND" });
if (attempt.status !== "in_progress") return res.status(409).json({ code: "ATTEMPT_ALREADY_SUBMITTED" });

const allowedQuestionIds = new Set(attempt.questions.map((q) => q.id));
for (const answer of body.answers) {
  if (!allowedQuestionIds.has(answer.questionId)) return res.status(400).json({ code: "INVALID_QUESTION" });
}

// Server calculates correct/score. Client never sends score/correct.
```

## Shared Error Response

```json
{
  "success": false,
  "code": "PREMIUM_REQUIRED",
  "message": "Tính năng này dành cho tài khoản Premium.",
  "upgrade_required": true
}
```

Do not return stack traces in production.
