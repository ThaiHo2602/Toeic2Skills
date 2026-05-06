import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "./config.js";
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

export function checkDailyTestLimit(req, res, next) {
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
