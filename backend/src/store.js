import bcrypt from "bcryptjs";
import { answers, plans, questions } from "./data.js";

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

export const store = {
  users: [],
  sessions: new Map(),
  plans: plans.map(withTimestamps),
  questions: questions.map((question) => ({ ...withTimestamps(question), attemptCount: 0, correctCount: 0, correctRate: 0 })),
  answers: answers.map(withTimestamps),
  subscriptions: [],
  dailyUsages: [],
  featureAccessLogs: [],
  paymentTransactions: [],
  attempts: [],
  vocabularyCollection: [],
  adminActionLogs: [],
};

export async function seedDemoUsers() {
  if (store.users.length) return;
  store.users.push({
    id: crypto.randomUUID(),
    name: "Demo Learner",
    email: "learner@example.com",
    passwordHash: await bcrypt.hash("Password1", 12),
    role: "user",
    targetScore: 650,
    createdAt: now(),
    updatedAt: now(),
  });
  store.users.push({
    id: crypto.randomUUID(),
    name: "Admin",
    email: "admin@example.com",
    passwordHash: await bcrypt.hash("Admin1234", 12),
    role: "admin",
    targetScore: 900,
    createdAt: now(),
    updatedAt: now(),
  });
}

export function publicUser(user) {
  if (!user) return undefined;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    targetScore: user.targetScore,
  };
}

export function getActiveSubscription(userId) {
  return store.subscriptions
    .filter((subscription) => subscription.userId === userId && subscription.status === "active")
    .filter((subscription) => !subscription.expiresAt || new Date(subscription.expiresAt).getTime() > Date.now())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

export function getCurrentPlan(userId) {
  const subscription = getActiveSubscription(userId);
  return subscription ? store.plans.find((plan) => plan.id === subscription.planId) : store.plans.find((plan) => plan.slug === "free");
}

export function planHasFeature(plan, featureKey) {
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
    default:
      return false;
  }
}

export function getTodayUsage(userId) {
  const usageDate = today();
  let usage = store.dailyUsages.find((item) => item.userId === userId && item.usageDate === usageDate);
  if (!usage) {
    usage = {
      id: crypto.randomUUID(),
      userId,
      usageDate,
      testCount: 0,
      aiExplanationCount: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    store.dailyUsages.unshift(usage);
  }
  return usage;
}

export function sanitizeQuestionForTaking(question) {
  const questionAnswers = store.answers
    .filter((answer) => answer.questionId === question.id)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(({ isCorrect, explanation, ...safeAnswer }) => safeAnswer);

  const { explanation, transcript, grammarFormula, ...safeQuestion } = question;
  return { ...safeQuestion, answers: questionAnswers };
}

export function questionWithReview(question) {
  const questionAnswers = store.answers
    .filter((answer) => answer.questionId === question.id)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return { ...question, answers: questionAnswers };
}

export function roundToNearest5(value) {
  return Math.max(5, Math.min(495, Math.round(value / 5) * 5));
}

function withTimestamps(item) {
  const timestamp = now();
  return { ...item, createdAt: timestamp, updatedAt: timestamp };
}
