import bcrypt from "bcryptjs";
import express from "express";
import { config } from "./config.js";
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

router.post("/subscriptions/subscribe", requireAuth, validate(schemas.subscribe), (req, res) => {
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
  res.json({ success: true, subscription, payment });
});

router.post("/subscriptions/cancel", requireAuth, (req, res) => {
  const subscription = getActiveSubscription(req.user.id);
  if (!subscription) return res.status(404).json({ success: false, code: "NO_ACTIVE_SUBSCRIPTION" });
  subscription.status = "cancelled";
  subscription.cancelledAt = new Date().toISOString();
  subscription.updatedAt = subscription.cancelledAt;
  res.json({ success: true, subscription });
});

router.get("/features/:featureKey/access", requireAuth, validate(schemas.feature), (req, res) => {
  const featureKey = req.validated.params.featureKey;
  const plan = getCurrentPlan(req.user.id);
  const allowed = planHasFeature(plan, featureKey);
  store.featureAccessLogs.unshift({ id: crypto.randomUUID(), userId: req.user.id, featureKey, allowed, reason: allowed ? "allowed" : "premium_required", createdAt: new Date().toISOString() });
  res.json({ success: true, feature: featureKey, allowed, upgrade_required: !allowed });
});

router.post("/practice/start", requireAuth, validate(schemas.startPractice), checkDailyTestLimit, (req, res) => {
  const { part, question_count } = req.validated.body;
  const selected = store.questions.filter((question) => question.part === part && question.isActive).slice(0, question_count);
  const attempt = createAttempt(req.user.id, "practice", selected);
  res.status(201).json({ success: true, attempt, questions: selected.map(sanitizeQuestionForTaking) });
});

router.post("/practice/adaptive/start", requireAuth, requirePremiumFeature("adaptive_learning"), validate(schemas.startPractice), checkDailyTestLimit, (req, res) => {
  const { part, question_count } = req.validated.body;
  const selected = store.questions
    .filter((question) => question.part === part && question.isActive)
    .sort((a, b) => a.difficultyScore - b.difficultyScore)
    .slice(0, question_count);
  const attempt = createAttempt(req.user.id, "practice", selected, true);
  res.status(201).json({ success: true, attempt, questions: selected.map(sanitizeQuestionForTaking) });
});

router.post(["/tests/start", "/mini-tests/start", "/full-tests/start"], requireAuth, checkDailyTestLimit, (req, res) => {
  const mode = req.path.includes("full") ? "full_test" : "mini_test";
  const selected = store.questions.filter((question) => question.isActive).slice(0, mode === "full_test" ? 200 : 20);
  const attempt = createAttempt(req.user.id, mode, selected);
  res.status(201).json({ success: true, attempt, questions: selected.map(sanitizeQuestionForTaking) });
});

router.post("/attempts/:id/submit", requireAuth, validate(schemas.submitAttempt), (req, res) => {
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
