import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "./config.js";
import { insert, isDatabaseAvailable, toMysqlDate } from "./db.js";
import { getCurrentPlan, getTodayUsage, planHasFeature, store } from "./store.js";

export const loginRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email ?? "").toLowerCase()}`,
});

export const registerRateLimit = rateLimit({ windowMs: 60_000, limit: 3, standardHeaders: true, legacyHeaders: false });
export const apiRateLimit = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
export const aiRateLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
export const uploadRateLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

export function requireAuth(req, res, next) {
  const cookieToken = req.cookies?.[config.cookieName];
  const bearerToken = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
  const token = cookieToken ?? bearerToken;
  const session = token ? store.sessions.get(token) : undefined;
  const user = session ? store.users.find((item) => item.id === session.userId) : undefined;

  if (!user) return res.status(401).json({ success: false, code: "UNAUTHENTICATED", message: "Authentication required." });
  req.user = user;
  req.sessionToken = token;
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      store.featureAccessLogs.unshift({
        id: crypto.randomUUID(),
        userId: req.user?.id ?? "anonymous",
        featureKey: "admin",
        allowed: false,
        reason: `role_${role}_required`,
        createdAt: new Date().toISOString(),
      });
      return res.status(403).json({ success: false, code: "ADMIN_REQUIRED", message: "Admin access required." });
    }
    next();
  };
}

export function requirePremiumFeature(featureKey) {
  return (req, res, next) => {
    const plan = getCurrentPlan(req.user.id);
    const allowed = planHasFeature(plan, featureKey);
    store.featureAccessLogs.unshift({
      id: crypto.randomUUID(),
      userId: req.user.id,
      featureKey,
      allowed,
      reason: allowed ? "allowed" : "premium_required",
      createdAt: new Date().toISOString(),
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

export async function checkDailyTestLimit(req, res, next) {
  const plan = getCurrentPlan(req.user.id);
  const usage = getTodayUsage(req.user.id);
  const unlimited = plan.dailyTestLimit === null || plan.dailyTestLimit < 0;
  if (!unlimited && usage.testCount >= plan.dailyTestLimit) {
    return res.status(403).json({
      success: false,
      code: "DAILY_TEST_LIMIT_REACHED",
      message: `Bạn đã dùng hết ${plan.dailyTestLimit} lượt luyện thi hôm nay. Nâng cấp Premium để luyện không giới hạn.`,
      upgrade_required: true,
    });
  }

  usage.testCount += 1;
  usage.updatedAt = new Date().toISOString();
  await persistUsage(usage);
  next();
}

export function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!parsed.success) {
      return res.status(422).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Invalid request payload.",
        errors: parsed.error.flatten(),
      });
    }
    req.validated = parsed.data;
    next();
  };
}

export const schemas = {
  register: z.object({
    body: z.object({
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
      password: z.string().min(8).max(128).regex(/^(?=.*[A-Za-z])(?=.*\d).+$/),
    }),
  }),
  login: z.object({
    body: z.object({
      email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
      password: z.string().min(1).max(128),
    }),
  }),
  startPractice: z.object({
    body: z.object({
      skill: z.enum(["listening", "reading"]).optional(),
      part: z.number().int().min(1).max(7),
      question_count: z.number().int().min(1).max(50).default(10),
    }),
  }),
  submitAttempt: z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      answers: z.array(
        z.object({
          question_id: z.number().int(),
          selected_answer_id: z.number().int().nullable().optional(),
        }),
      ).max(200),
    }),
  }),
  subscribe: z.object({
    body: z.object({
      plan_slug: z.enum(["premium_monthly", "premium_quarterly", "premium_yearly"]),
    }),
  }),
  feature: z.object({
    params: z.object({ featureKey: z.enum(["ai_explanation", "weakness_analysis", "adaptive_learning", "advanced_dashboard", "unlimited_tests", "recommendations"]) }),
  }),
  idParam: z.object({
    params: z.object({ id: z.coerce.number().int().positive() }),
  }),
  adminQuestion: z.object({
    body: z.object({
      skill: z.enum(["listening", "reading"]),
      part: z.number().int().min(1).max(7),
      question_type: z.string().trim().min(2).max(80).optional(),
      question_text: z.string().trim().min(1).max(5000).optional(),
      passage_text: z.string().trim().max(50000).nullable().optional(),
      transcript: z.string().trim().max(50000).nullable().optional(),
      audio_url: z.string().trim().url().max(500).nullable().optional(),
      image_url: z.string().trim().url().max(500).nullable().optional(),
      explanation: z.string().trim().min(1).max(50000),
      difficulty_level: z.enum(["easy", "medium", "hard"]),
      difficulty_score: z.number().int().min(1).max(100),
      estimated_time_seconds: z.number().int().min(5).max(600).default(30),
      is_active: z.boolean().default(true),
      answers: z
        .array(
          z.object({
            id: z.number().int().positive().optional(),
            answer_text: z.string().trim().min(1).max(5000),
            is_correct: z.boolean(),
            display_order: z.number().int().min(1).max(6),
            explanation: z.string().trim().max(5000).nullable().optional(),
          }),
        )
        .max(6)
        .optional(),
    }),
  }),
};

export function notFound(req, res) {
  res.status(404).json({ success: false, code: "NOT_FOUND", message: "Endpoint not found." });
}

export function errorHandler(error, req, res, next) {
  console.error(error.message);
  res.status(500).json({
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: config.isProduction ? "Something went wrong." : error.message,
  });
}

async function persistUsage(usage) {
  if (!isDatabaseAvailable()) return;
  await insert(
    `INSERT INTO user_daily_usages (id, user_id, usage_date, test_count, ai_explanation_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE test_count=VALUES(test_count), ai_explanation_count=VALUES(ai_explanation_count), updated_at=VALUES(updated_at)`,
    [
      usage.id,
      usage.userId,
      usage.usageDate,
      usage.testCount,
      usage.aiExplanationCount,
      toMysqlDate(usage.createdAt),
      toMysqlDate(usage.updatedAt),
    ],
  );
}
