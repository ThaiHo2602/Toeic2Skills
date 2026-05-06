import bcrypt from "bcryptjs";
import express from "express";
import { config } from "./config.js";
import { insert, isDatabaseAvailable, query, toMysqlDate } from "./db.js";
import {
  aiRateLimit,
  checkDailyTestLimit,
  loginRateLimit,
  registerRateLimit,
  requireAuth,
  requirePremiumFeature,
  requireRole,
  schemas,
  uploadRateLimit,
  validate,
} from "./middleware.js";
import {
  getActiveSubscription,
  getCurrentPlan,
  getTodayUsage,
  planHasFeature,
  publicUser,
  questionWithReview,
  roundToNearest5,
  sanitizeQuestionForTaking,
  store,
} from "./store.js";

export const router = express.Router();
const allowedUploadMimeTypes = ["image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/mp4"];
const uploadBody = express.raw({ type: allowedUploadMimeTypes, limit: "20mb" });

router.post("/auth/register", registerRateLimit, validate(schemas.register), async (req, res) => {
  const { name, email, password } = req.validated.body;
  if (store.users.some((user) => user.email === email)) {
    return res.status(409).json({ success: false, code: "EMAIL_ALREADY_USED", message: "Unable to create account." });
  }

  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "user",
    targetScore: 650,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.users.push(user);
  await persistUser(user);
  createSessionCookie(res, user.id);
  res.status(201).json({ success: true, user: publicUser(user) });
});

router.post("/auth/login", loginRateLimit, validate(schemas.login), async (req, res) => {
  const { email, password } = req.validated.body;
  const user = store.users.find((item) => item.email === email);
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!valid) {
    return res.status(401).json({ success: false, code: "INVALID_CREDENTIALS", message: "Invalid email or password." });
  }
  createSessionCookie(res, user.id);
  res.json({ success: true, user: publicUser(user) });
});

router.post("/auth/logout", requireAuth, (req, res) => {
  store.sessions.delete(req.sessionToken);
  res.clearCookie(config.cookieName);
  res.json({ success: true });
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});

router.get("/plans", (req, res) => {
  res.json({ success: true, plans: store.plans.filter((plan) => plan.isActive) });
});

router.get("/me/subscription", requireAuth, (req, res) => {
  const plan = getCurrentPlan(req.user.id);
  const usage = getTodayUsage(req.user.id);
  const subscription = getActiveSubscription(req.user.id);
  const unlimited = plan.dailyTestLimit === null || plan.dailyTestLimit < 0;
  res.json({
    success: true,
    plan: plan.slug,
    is_premium: plan.slug !== "free",
    subscription_status: subscription?.status ?? "free",
    expires_at: subscription?.expiresAt ?? null,
    daily_test_limit: plan.dailyTestLimit,
    used_tests_today: usage.testCount,
    remaining_tests_today: unlimited ? null : Math.max(0, plan.dailyTestLimit - usage.testCount),
    features: featureMap(plan),
  });
});

router.get("/me/usage/today", requireAuth, (req, res) => {
  res.json({ success: true, usage: getTodayUsage(req.user.id) });
});

router.post("/subscriptions/subscribe", requireAuth, validate(schemas.subscribe), async (req, res) => {
  const plan = store.plans.find((item) => item.slug === req.validated.body.plan_slug && item.isActive);
  if (!plan || plan.slug === "free") return res.status(404).json({ success: false, code: "PLAN_NOT_FOUND" });
  const startedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString();

  store.subscriptions.forEach((subscription) => {
    if (subscription.userId === req.user.id && subscription.status === "active") subscription.status = "cancelled";
  });
  const subscription = { id: crypto.randomUUID(), userId: req.user.id, planId: plan.id, status: "active", startedAt, expiresAt, createdAt: startedAt, updatedAt: startedAt };
  const payment = { id: crypto.randomUUID(), userId: req.user.id, planId: plan.id, amount: plan.price, currency: plan.currency, provider: "mock", providerTransactionId: `mock_${Date.now()}`, status: "success", paidAt: startedAt, createdAt: startedAt, updatedAt: startedAt };
  store.subscriptions.unshift(subscription);
  store.paymentTransactions.unshift(payment);
  await persistSubscriptionPurchase(req.user.id, subscription, payment);
  res.json({ success: true, subscription, payment });
});

router.post("/subscriptions/cancel", requireAuth, async (req, res) => {
  const subscription = getActiveSubscription(req.user.id);
  if (!subscription) return res.status(404).json({ success: false, code: "NO_ACTIVE_SUBSCRIPTION" });
  subscription.status = "cancelled";
  subscription.cancelledAt = new Date().toISOString();
  subscription.updatedAt = subscription.cancelledAt;
  await persistSubscriptionCancel(subscription);
  res.json({ success: true, subscription });
});

router.get("/features/:featureKey/access", requireAuth, validate(schemas.feature), (req, res) => {
  const featureKey = req.validated.params.featureKey;
  const plan = getCurrentPlan(req.user.id);
  const allowed = planHasFeature(plan, featureKey);
  store.featureAccessLogs.unshift({ id: crypto.randomUUID(), userId: req.user.id, featureKey, allowed, reason: allowed ? "allowed" : "premium_required", createdAt: new Date().toISOString() });
  res.json({ success: true, feature: featureKey, allowed, upgrade_required: !allowed });
});

router.post("/practice/start", requireAuth, validate(schemas.startPractice), checkDailyTestLimit, async (req, res) => {
  const { part, question_count } = req.validated.body;
  const selected = store.questions.filter((question) => question.part === part && question.isActive).slice(0, question_count);
  const attempt = createAttempt(req.user.id, "practice", selected);
  await persistAttempt(attempt);
  res.status(201).json({ success: true, attempt, questions: selected.map(sanitizeQuestionForTaking) });
});

router.post("/practice/adaptive/start", requireAuth, requirePremiumFeature("adaptive_learning"), validate(schemas.startPractice), checkDailyTestLimit, async (req, res) => {
  const { part, question_count } = req.validated.body;
  const selected = store.questions
    .filter((question) => question.part === part && question.isActive)
    .sort((a, b) => a.difficultyScore - b.difficultyScore)
    .slice(0, question_count);
  const attempt = createAttempt(req.user.id, "practice", selected, true);
  await persistAttempt(attempt);
  res.status(201).json({ success: true, attempt, questions: selected.map(sanitizeQuestionForTaking) });
});

router.post(["/tests/start", "/mini-tests/start", "/full-tests/start"], requireAuth, checkDailyTestLimit, async (req, res) => {
  const mode = req.path.includes("full") ? "full_test" : "mini_test";
  const selected = store.questions.filter((question) => question.isActive).slice(0, mode === "full_test" ? 200 : 20);
  const attempt = createAttempt(req.user.id, mode, selected);
  await persistAttempt(attempt);
  res.status(201).json({ success: true, attempt, questions: selected.map(sanitizeQuestionForTaking) });
});

router.post("/attempts/:id/submit", requireAuth, validate(schemas.submitAttempt), async (req, res) => {
  const attempt = store.attempts.find((item) => item.id === req.validated.params.id && item.userId === req.user.id);
  if (!attempt) return res.status(404).json({ success: false, code: "ATTEMPT_NOT_FOUND" });
  if (attempt.status !== "in_progress") return res.status(409).json({ success: false, code: "ATTEMPT_ALREADY_SUBMITTED" });

  const allowedQuestionIds = new Set(attempt.questionIds);
  const submittedAnswers = req.validated.body.answers.map((answer) => {
    if (!allowedQuestionIds.has(answer.question_id)) throw new Error("Invalid question submitted.");
    const correctAnswer = store.answers.find((item) => item.questionId === answer.question_id && item.isCorrect);
    return {
      questionId: answer.question_id,
      selectedAnswerId: answer.selected_answer_id ?? null,
      isCorrect: answer.selected_answer_id === correctAnswer?.id,
      answeredAt: new Date().toISOString(),
    };
  });

  const correctCount = submittedAnswers.filter((answer) => answer.isCorrect).length;
  const listeningCorrect = submittedAnswers.filter((answer) => store.questions.find((q) => q.id === answer.questionId)?.skill === "listening" && answer.isCorrect).length;
  const readingCorrect = submittedAnswers.filter((answer) => store.questions.find((q) => q.id === answer.questionId)?.skill === "reading" && answer.isCorrect).length;
  const listeningTotal = Math.max(1, attempt.questionIds.filter((id) => store.questions.find((q) => q.id === id)?.skill === "listening").length);
  const readingTotal = Math.max(1, attempt.questionIds.filter((id) => store.questions.find((q) => q.id === id)?.skill === "reading").length);

  attempt.status = "submitted";
  attempt.answers = submittedAnswers;
  attempt.submittedAt = new Date().toISOString();
  attempt.correctCount = correctCount;
  attempt.accuracy = Math.round((correctCount / attempt.questionIds.length) * 100);
  attempt.estimatedListeningScore = roundToNearest5(5 + (listeningCorrect / listeningTotal) * 490);
  attempt.estimatedReadingScore = roundToNearest5(5 + (readingCorrect / readingTotal) * 490);
  attempt.estimatedTotalScore = attempt.estimatedListeningScore + attempt.estimatedReadingScore;
  attempt.scoreConfidence = attempt.mode === "full_test" ? 95 : Math.min(90, Math.round((attempt.questionIds.length / 100) * 100));
  await persistAttemptSubmit(attempt, submittedAnswers);

  res.json({ success: true, attempt, locked_features: getCurrentPlan(req.user.id).slug === "free" ? lockedFeatures() : [] });
});

router.get("/attempts/:id/review", requireAuth, (req, res) => {
  const attempt = store.attempts.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!attempt) return res.status(404).json({ success: false, code: "ATTEMPT_NOT_FOUND" });
  if (attempt.status !== "submitted") return res.status(403).json({ success: false, code: "ATTEMPT_NOT_SUBMITTED" });
  const questions = attempt.questionIds.map((id) => questionWithReview(store.questions.find((question) => question.id === id)));
  res.json({ success: true, attempt, questions });
});

router.get("/analysis/weaknesses", requireAuth, requirePremiumFeature("weakness_analysis"), (req, res) => {
  res.json({ success: true, weaknesses: [{ type: "part", part: 5, accuracy: 58, severity: 42 }] });
});

router.get("/recommendations", requireAuth, requirePremiumFeature("recommendations"), (req, res) => {
  res.json({ success: true, recommendations: [{ part: 5, title: "Part 5 word form drill", question_count: 15 }] });
});

router.post("/ai/explain", requireAuth, aiRateLimit, requirePremiumFeature("ai_explanation"), (req, res) => {
  const questionId = Number(req.body?.question_id);
  const question = store.questions.find((item) => item.id === questionId);
  if (!question) return res.status(404).json({ success: false, code: "QUESTION_NOT_FOUND" });
  const usage = getTodayUsage(req.user.id);
  usage.aiExplanationCount += 1;
  res.json({ success: true, explanation: question.explanation, note: "AI integration placeholder. Use backend .env API key only." });
});

router.get("/admin/questions", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ success: true, questions: store.questions.map(questionWithReview) });
});

router.post("/admin/questions", requireAuth, requireRole("admin"), validate(schemas.adminQuestion), async (req, res) => {
  const question = buildAdminQuestion(req.validated.body);
  const answers = assignAnswerIds(req.validated.body.answers ?? []);
  store.questions.unshift(question);
  if (answers.length) {
    store.answers = [
      ...answers.map((answer) => buildAdminAnswer(question.id, answer)),
      ...store.answers,
    ];
  }
  await persistAdminQuestion(question, answers);
  logAdminAction(req.user.id, "create_question", question.id);
  res.status(201).json({ success: true, question: questionWithReview(question) });
});

router.put("/admin/questions/:id", requireAuth, requireRole("admin"), validate(schemas.idParam.merge(schemas.adminQuestion)), async (req, res) => {
  const question = store.questions.find((item) => item.id === req.validated.params.id);
  if (!question) return res.status(404).json({ success: false, code: "QUESTION_NOT_FOUND" });
  const updated = {
    ...question,
    ...apiQuestionToStoreFields(req.validated.body),
    updatedAt: new Date().toISOString(),
  };
  store.questions = store.questions.map((item) => (item.id === updated.id ? updated : item));
  if (req.validated.body.answers) {
    const answers = assignAnswerIds(req.validated.body.answers);
    store.answers = [
      ...store.answers.filter((answer) => answer.questionId !== updated.id),
      ...answers.map((answer) => buildAdminAnswer(updated.id, answer)),
    ];
    await persistAdminQuestion(updated, answers, true);
  } else {
    await persistAdminQuestion(updated, undefined, true);
  }
  logAdminAction(req.user.id, "update_question", updated.id);
  res.json({ success: true, question: questionWithReview(updated) });
});

router.delete("/admin/questions/:id", requireAuth, requireRole("admin"), validate(schemas.idParam), async (req, res) => {
  const question = store.questions.find((item) => item.id === req.validated.params.id);
  if (!question) return res.status(404).json({ success: false, code: "QUESTION_NOT_FOUND" });
  question.isActive = false;
  question.updatedAt = new Date().toISOString();
  if (isDatabaseAvailable()) {
    await insert("UPDATE questions SET is_active=false, updated_at=? WHERE id=?", [toMysqlDate(question.updatedAt), question.id]);
  }
  logAdminAction(req.user.id, "deactivate_question", question.id);
  res.json({ success: true, question: questionWithReview(question) });
});

router.post("/admin/upload", requireAuth, requireRole("admin"), uploadRateLimit, uploadBody, (req, res) => {
  const mimetype = req.headers["content-type"]?.split(";")[0];
  if (!mimetype || !allowedUploadMimeTypes.includes(mimetype)) {
    return res.status(422).json({ success: false, code: "INVALID_FILE_TYPE" });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(422).json({ success: false, code: "FILE_REQUIRED" });
  }
  const rawName = String(req.headers["x-file-name"] ?? "upload.bin");
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 120) || "upload.bin";
  const key = `${crypto.randomUUID()}-${safeName}`;
  store.adminActionLogs.unshift({ id: crypto.randomUUID(), userId: req.user.id, action: "upload", key, mimetype, size: req.body.length, createdAt: new Date().toISOString() });
  res.status(201).json({ success: true, file: { key, mimetype, size: req.body.length } });
});

function createSessionCookie(res, userId) {
  const token = crypto.randomUUID();
  store.sessions.set(token, { userId, createdAt: new Date().toISOString() });
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    signed: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function createAttempt(userId, mode, selectedQuestions, adaptive = false) {
  const attempt = {
    id: crypto.randomUUID(),
    userId,
    mode,
    adaptive,
    status: "in_progress",
    startedAt: new Date().toISOString(),
    questionIds: selectedQuestions.map((question) => question.id),
    totalQuestions: selectedQuestions.length,
    answers: [],
  };
  store.attempts.unshift(attempt);
  return attempt;
}

function featureMap(plan) {
  return {
    ai_explanation: planHasFeature(plan, "ai_explanation"),
    weakness_analysis: planHasFeature(plan, "weakness_analysis"),
    adaptive_learning: planHasFeature(plan, "adaptive_learning"),
    advanced_dashboard: planHasFeature(plan, "advanced_dashboard"),
    recommendations: planHasFeature(plan, "recommendations"),
  };
}

function lockedFeatures() {
  return [
    { feature: "weakness_analysis", message: "Nâng cấp Premium để xem phân tích điểm yếu." },
    { feature: "recommendations", message: "Nâng cấp Premium để nhận lộ trình ôn tập cá nhân hóa." },
  ];
}

function buildAdminQuestion(body) {
  const timestamp = new Date().toISOString();
  return {
    id: nextQuestionId(),
    ...apiQuestionToStoreFields(body),
    attemptCount: 0,
    correctCount: 0,
    correctRate: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function apiQuestionToStoreFields(body) {
  return {
    skill: body.skill,
    part: body.part,
    questionType: body.question_type ?? "incomplete_sentence",
    questionText: body.question_text ?? "",
    passageText: body.passage_text ?? undefined,
    transcript: body.transcript ?? undefined,
    audioUrl: body.audio_url ?? undefined,
    imageUrl: body.image_url ?? undefined,
    explanation: body.explanation,
    difficultyLevel: body.difficulty_level,
    difficultyScore: body.difficulty_score,
    estimatedTimeSeconds: body.estimated_time_seconds,
    isActive: body.is_active,
  };
}

function buildAdminAnswer(questionId, answer) {
  const timestamp = new Date().toISOString();
  return {
    id: answer.id ?? nextAnswerId(),
    questionId,
    answerText: answer.answer_text,
    isCorrect: answer.is_correct,
    displayOrder: answer.display_order,
    explanation: answer.explanation ?? undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function nextQuestionId() {
  return Math.max(0, ...store.questions.map((question) => question.id)) + 1;
}

function nextAnswerId() {
  return Math.max(0, ...store.answers.map((answer) => answer.id)) + 1;
}

function assignAnswerIds(answers) {
  let nextId = nextAnswerId();
  return answers.map((answer) => ({
    ...answer,
    id: answer.id ?? nextId++,
  }));
}

function logAdminAction(userId, action, questionId) {
  store.adminActionLogs.unshift({ id: crypto.randomUUID(), userId, action, questionId, createdAt: new Date().toISOString() });
}

async function persistAdminQuestion(question, answersToPersist, updateExisting = false) {
  if (!isDatabaseAvailable()) return;
  const timestamp = toMysqlDate(question.updatedAt);
  if (updateExisting) {
    await insert(
      `UPDATE questions
       SET skill=?, part=?, question_type=?, question_text=?, passage_text=?, transcript=?, audio_url=?, image_url=?,
           explanation=?, difficulty_level=?, difficulty_score=?, estimated_time_seconds=?, is_active=?, updated_at=?
       WHERE id=?`,
      [
        question.skill,
        question.part,
        question.questionType,
        question.questionText ?? null,
        question.passageText ?? null,
        question.transcript ?? null,
        question.audioUrl ?? null,
        question.imageUrl ?? null,
        question.explanation,
        question.difficultyLevel,
        question.difficultyScore,
        question.estimatedTimeSeconds,
        question.isActive,
        timestamp,
        question.id,
      ],
    );
  } else {
    await insert(
      `INSERT INTO questions (
        id, skill, part, question_type, question_text, passage_text, transcript, audio_url, image_url,
        explanation, difficulty_level, difficulty_score, estimated_time_seconds, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        question.id,
        question.skill,
        question.part,
        question.questionType,
        question.questionText ?? null,
        question.passageText ?? null,
        question.transcript ?? null,
        question.audioUrl ?? null,
        question.imageUrl ?? null,
        question.explanation,
        question.difficultyLevel,
        question.difficultyScore,
        question.estimatedTimeSeconds,
        question.isActive,
        toMysqlDate(question.createdAt),
        timestamp,
      ],
    );
  }

  if (answersToPersist) {
    await insert("DELETE FROM answers WHERE question_id=?", [question.id]);
    for (const answer of store.answers.filter((item) => item.questionId === question.id)) {
      await insert(
        `INSERT INTO answers (id, question_id, answer_text, is_correct, display_order, explanation, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          answer.id,
          answer.questionId,
          answer.answerText,
          answer.isCorrect,
          answer.displayOrder,
          answer.explanation ?? null,
          toMysqlDate(answer.createdAt),
          toMysqlDate(answer.updatedAt),
        ],
      );
    }
  }
}

async function persistUser(user) {
  if (!isDatabaseAvailable()) return;
  await insert(
    `INSERT INTO users (id, name, email, password_hash, role, target_score, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, user.name, user.email, user.passwordHash, user.role, user.targetScore, toMysqlDate(user.createdAt), toMysqlDate(user.updatedAt)],
  );
}

async function persistSubscriptionPurchase(userId, subscription, payment) {
  if (!isDatabaseAvailable()) return;
  await insert("UPDATE subscriptions SET status='cancelled', cancelled_at=?, updated_at=? WHERE user_id=? AND status='active' AND id<>?", [
    toMysqlDate(subscription.startedAt),
    toMysqlDate(subscription.startedAt),
    userId,
    subscription.id,
  ]);
  await insert(
    `INSERT INTO subscriptions (id, user_id, plan_id, status, started_at, expires_at, cancelled_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      subscription.id,
      subscription.userId,
      subscription.planId,
      subscription.status,
      toMysqlDate(subscription.startedAt),
      toMysqlDate(subscription.expiresAt),
      null,
      toMysqlDate(subscription.createdAt),
      toMysqlDate(subscription.updatedAt),
    ],
  );
  await insert(
    `INSERT INTO payment_transactions (id, user_id, plan_id, amount, currency, provider, provider_transaction_id, status, paid_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payment.id,
      payment.userId,
      payment.planId,
      payment.amount,
      payment.currency,
      payment.provider,
      payment.providerTransactionId,
      payment.status,
      toMysqlDate(payment.paidAt),
      toMysqlDate(payment.createdAt),
      toMysqlDate(payment.updatedAt),
    ],
  );
}

async function persistSubscriptionCancel(subscription) {
  if (!isDatabaseAvailable()) return;
  await insert("UPDATE subscriptions SET status='cancelled', cancelled_at=?, updated_at=? WHERE id=?", [
    toMysqlDate(subscription.cancelledAt),
    toMysqlDate(subscription.updatedAt),
    subscription.id,
  ]);
}

async function persistAttempt(attempt) {
  if (!isDatabaseAvailable()) return;
  await insert(
    `INSERT INTO user_attempts (id, user_id, mode, adaptive, status, started_at, question_ids, total_questions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attempt.id,
      attempt.userId,
      attempt.mode,
      attempt.adaptive,
      attempt.status,
      toMysqlDate(attempt.startedAt),
      JSON.stringify(attempt.questionIds),
      attempt.totalQuestions,
      toMysqlDate(attempt.startedAt),
      toMysqlDate(attempt.startedAt),
    ],
  );
}

async function persistAttemptSubmit(attempt, submittedAnswers) {
  if (!isDatabaseAvailable()) return;
  await insert(
    `UPDATE user_attempts
     SET status=?, submitted_at=?, correct_count=?, accuracy=?, estimated_listening_score=?, estimated_reading_score=?, estimated_total_score=?, score_confidence=?, updated_at=?
     WHERE id=?`,
    [
      attempt.status,
      toMysqlDate(attempt.submittedAt),
      attempt.correctCount,
      attempt.accuracy,
      attempt.estimatedListeningScore,
      attempt.estimatedReadingScore,
      attempt.estimatedTotalScore,
      attempt.scoreConfidence,
      toMysqlDate(attempt.submittedAt),
      attempt.id,
    ],
  );
  for (const answer of submittedAnswers) {
    const timestamp = toMysqlDate(answer.answeredAt);
    await insert(
      `INSERT INTO user_answers (id, user_attempt_id, user_id, question_id, selected_answer_id, is_correct, answered_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), attempt.id, attempt.userId, answer.questionId, answer.selectedAnswerId, answer.isCorrect, timestamp, timestamp, timestamp],
    );
  }
}
