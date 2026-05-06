import type {
  AccessDecision,
  AppState,
  FeatureAccessLog,
  FeatureKey,
  PaymentTransaction,
  Plan,
  PlanSlug,
  Subscription,
  UserDailyUsage,
  UserProfile,
} from "../types";

export const FREE_DAILY_TEST_LIMIT = 5;

const nowIso = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0, 10);

export const seedPlans: Plan[] = [
  {
    id: 1,
    name: "Free",
    slug: "free",
    price: 0,
    currency: "VND",
    durationDays: null,
    dailyTestLimit: FREE_DAILY_TEST_LIMIT,
    aiExplanationLimit: 0,
    hasAiFeatures: false,
    hasWeaknessAnalysis: false,
    hasAdaptiveLearning: false,
    hasAdvancedDashboard: false,
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 2,
    name: "Premium Monthly",
    slug: "premium_monthly",
    price: 99000,
    currency: "VND",
    durationDays: 30,
    dailyTestLimit: null,
    aiExplanationLimit: null,
    hasAiFeatures: true,
    hasWeaknessAnalysis: true,
    hasAdaptiveLearning: true,
    hasAdvancedDashboard: true,
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 3,
    name: "Premium Quarterly",
    slug: "premium_quarterly",
    price: 249000,
    currency: "VND",
    durationDays: 90,
    dailyTestLimit: null,
    aiExplanationLimit: null,
    hasAiFeatures: true,
    hasWeaknessAnalysis: true,
    hasAdaptiveLearning: true,
    hasAdvancedDashboard: true,
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 4,
    name: "Premium Yearly",
    slug: "premium_yearly",
    price: 799000,
    currency: "VND",
    durationDays: 365,
    dailyTestLimit: null,
    aiExplanationLimit: null,
    hasAiFeatures: true,
    hasWeaknessAnalysis: true,
    hasAdaptiveLearning: true,
    hasAdvancedDashboard: true,
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

export function getActivePlans(state: AppState) {
  return state.plans.filter((plan) => plan.isActive);
}

export function getPlanBySlug(state: AppState, slug: PlanSlug) {
  return state.plans.find((plan) => plan.slug === slug && plan.isActive);
}

export function getActiveSubscription(state: AppState, user: UserProfile) {
  const active = state.subscriptions
    .filter((subscription) => subscription.userId === user.id && subscription.status === "active")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  if (!active) return undefined;
  if (active.expiresAt && new Date(active.expiresAt).getTime() <= Date.now()) return undefined;
  return active;
}

export function getCurrentPlan(state: AppState, user: UserProfile) {
  const activeSubscription = getActiveSubscription(state, user);
  const premiumPlan = activeSubscription ? state.plans.find((plan) => plan.id === activeSubscription.planId) : undefined;
  return premiumPlan ?? state.plans.find((plan) => plan.slug === "free") ?? seedPlans[0];
}

export function isPremium(state: AppState, user: UserProfile) {
  return getCurrentPlan(state, user).slug !== "free";
}

export function expireOldSubscriptions(state: AppState) {
  return {
    ...state,
    subscriptions: state.subscriptions.map((subscription) =>
      subscription.status === "active" && subscription.expiresAt && new Date(subscription.expiresAt).getTime() <= Date.now()
        ? { ...subscription, status: "expired" as const, updatedAt: nowIso() }
        : subscription,
    ),
  };
}

export function subscribeUser(state: AppState, user: UserProfile, planSlug: PlanSlug) {
  const plan = getPlanBySlug(state, planSlug);
  if (!plan || plan.slug === "free") return state;

  const startedAt = nowIso();
  const expiresAt = plan.durationDays
    ? new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const subscription: Subscription = {
    id: crypto.randomUUID(),
    userId: user.id,
    planId: plan.id,
    status: "active",
    startedAt,
    expiresAt,
    createdAt: startedAt,
    updatedAt: startedAt,
  };

  const payment: PaymentTransaction = {
    id: crypto.randomUUID(),
    userId: user.id,
    planId: plan.id,
    amount: plan.price,
    currency: plan.currency,
    provider: "mock",
    providerTransactionId: `mock_${Date.now()}`,
    status: "success",
    paidAt: startedAt,
    createdAt: startedAt,
    updatedAt: startedAt,
  };

  return {
    ...state,
    subscriptions: [
      subscription,
      ...state.subscriptions.map((item) =>
        item.userId === user.id && item.status === "active"
          ? { ...item, status: "cancelled" as const, cancelledAt: startedAt, updatedAt: startedAt }
          : item,
      ),
    ],
    paymentTransactions: [payment, ...state.paymentTransactions],
  };
}

export function cancelSubscription(state: AppState, user: UserProfile) {
  const active = getActiveSubscription(state, user);
  if (!active) return state;
  const cancelledAt = nowIso();
  return {
    ...state,
    subscriptions: state.subscriptions.map((subscription) =>
      subscription.id === active.id
        ? { ...subscription, status: "cancelled" as const, cancelledAt, updatedAt: cancelledAt }
        : subscription,
    ),
  };
}

export function userHasFeature(state: AppState, user: UserProfile, featureKey: FeatureKey) {
  const plan = getCurrentPlan(state, user);
  switch (featureKey) {
    case "ai_explanation":
      return plan.hasAiFeatures;
    case "weakness_analysis":
      return plan.hasWeaknessAnalysis;
    case "adaptive_learning":
      return plan.hasAdaptiveLearning;
    case "advanced_dashboard":
      return plan.hasAdvancedDashboard;
    case "unlimited_tests":
      return plan.dailyTestLimit === null || plan.dailyTestLimit < 0;
    case "recommendations":
      return plan.hasAdaptiveLearning || plan.hasWeaknessAnalysis;
  }
}

export function logFeatureAccess(state: AppState, user: UserProfile, featureKey: FeatureKey, allowed: boolean, reason: string) {
  const log: FeatureAccessLog = {
    id: crypto.randomUUID(),
    userId: user.id,
    featureKey,
    allowed,
    reason,
    createdAt: nowIso(),
  };
  return { ...state, featureAccessLogs: [log, ...state.featureAccessLogs].slice(0, 200) };
}

export function checkPremiumFeature(state: AppState, user: UserProfile, featureKey: FeatureKey) {
  const allowed = userHasFeature(state, user, featureKey);
  const nextState = logFeatureAccess(
    state,
    user,
    featureKey,
    allowed,
    allowed ? "Feature allowed by current plan." : "Premium plan required.",
  );

  const decision: AccessDecision = allowed
    ? { success: true }
    : {
        success: false,
        code: "PREMIUM_REQUIRED",
        message: "Tính năng này dành cho tài khoản Premium.",
        feature: featureKey,
        upgradeRequired: true,
      };

  return { state: nextState, decision };
}

export function getTodayUsage(state: AppState, user: UserProfile) {
  const usageDate = todayKey();
  const existing = state.userDailyUsages.find((usage) => usage.userId === user.id && usage.usageDate === usageDate);
  if (existing) return existing;

  const createdAt = nowIso();
  return {
    id: crypto.randomUUID(),
    userId: user.id,
    usageDate,
    testCount: 0,
    aiExplanationCount: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

export function upsertTodayUsage(state: AppState, usage: UserDailyUsage) {
  const exists = state.userDailyUsages.some((item) => item.id === usage.id);
  return {
    ...state,
    userDailyUsages: exists
      ? state.userDailyUsages.map((item) => (item.id === usage.id ? usage : item))
      : [usage, ...state.userDailyUsages],
  };
}

export function canStartTest(state: AppState, user: UserProfile) {
  const plan = getCurrentPlan(state, user);
  const usage = getTodayUsage(state, user);
  if (plan.dailyTestLimit === null || plan.dailyTestLimit < 0) return { success: true, usage };
  if (usage.testCount < plan.dailyTestLimit) return { success: true, usage };

  return {
    success: false,
    usage,
    decision: {
      success: false,
      code: "DAILY_TEST_LIMIT_REACHED",
      message: "Bạn đã dùng hết 5 lượt luyện thi hôm nay. Nâng cấp Premium để luyện không giới hạn.",
      upgradeRequired: true,
    } satisfies AccessDecision,
  };
}

export function incrementTestCount(state: AppState, user: UserProfile) {
  const usage = getTodayUsage(state, user);
  return upsertTodayUsage(state, { ...usage, testCount: usage.testCount + 1, updatedAt: nowIso() });
}

export function checkDailyTestLimit(state: AppState, user: UserProfile) {
  const result = canStartTest(state, user);
  if (!result.success) return { state: upsertTodayUsage(state, result.usage), decision: result.decision! };
  return { state: incrementTestCount(upsertTodayUsage(state, result.usage), user), decision: { success: true } as AccessDecision };
}

export function canUseAIExplanation(state: AppState, user: UserProfile) {
  const feature = checkPremiumFeature(state, user, "ai_explanation");
  if (!feature.decision.success) return feature;

  const plan = getCurrentPlan(feature.state, user);
  const usage = getTodayUsage(feature.state, user);
  if (plan.aiExplanationLimit === null || plan.aiExplanationLimit < 0 || usage.aiExplanationCount < plan.aiExplanationLimit) {
    return { state: upsertTodayUsage(feature.state, usage), decision: { success: true } as AccessDecision };
  }

  return {
    state: upsertTodayUsage(feature.state, usage),
    decision: {
      success: false,
      code: "AI_EXPLANATION_LIMIT_REACHED",
      message: "Bạn đã hết lượt AI explanation hôm nay.",
      feature: "ai_explanation",
      upgradeRequired: true,
    } as AccessDecision,
  };
}

export function incrementAIExplanationCount(state: AppState, user: UserProfile) {
  const usage = getTodayUsage(state, user);
  return upsertTodayUsage(state, { ...usage, aiExplanationCount: usage.aiExplanationCount + 1, updatedAt: nowIso() });
}

export function getSubscriptionSummary(state: AppState, user: UserProfile) {
  const plan = getCurrentPlan(state, user);
  const subscription = getActiveSubscription(state, user);
  const usage = getTodayUsage(state, user);
  const unlimited = plan.dailyTestLimit === null || plan.dailyTestLimit < 0;

  return {
    plan: plan.slug,
    planName: plan.name,
    isPremium: plan.slug !== "free",
    subscriptionStatus: subscription?.status ?? "free",
    expiresAt: subscription?.expiresAt ?? null,
    dailyTestLimit: plan.dailyTestLimit,
    usedTestsToday: usage.testCount,
    remainingTestsToday: unlimited ? null : Math.max(0, (plan.dailyTestLimit ?? 0) - usage.testCount),
    features: {
      ai_explanation: userHasFeature(state, user, "ai_explanation"),
      weakness_analysis: userHasFeature(state, user, "weakness_analysis"),
      adaptive_learning: userHasFeature(state, user, "adaptive_learning"),
      advanced_dashboard: userHasFeature(state, user, "advanced_dashboard"),
      unlimited_tests: userHasFeature(state, user, "unlimited_tests"),
      recommendations: userHasFeature(state, user, "recommendations"),
    },
  };
}
