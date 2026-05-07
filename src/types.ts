export type Skill = "listening" | "reading";
export type AttemptMode = "practice" | "mini_test" | "full_test" | "placement";
export type DifficultyLevel = "easy" | "medium" | "hard";
export type PlanSlug = "free" | "premium_monthly" | "premium_quarterly" | "premium_yearly";
export type SubscriptionStatus = "active" | "expired" | "cancelled" | "pending";
export type PaymentStatus = "pending" | "success" | "failed" | "refunded";
export type FeatureKey =
  | "ai_explanation"
  | "weakness_analysis"
  | "adaptive_learning"
  | "advanced_dashboard"
  | "unlimited_tests"
  | "recommendations";

export interface Topic {
  id: number;
  name: string;
  skill: Skill | "both";
  description?: string;
}

export interface GrammarPoint {
  id: number;
  name: string;
  category: string;
  description?: string;
}

export interface QuestionGroup {
  id: number;
  skill: Skill;
  part: number;
  title: string;
  groupType: "conversation" | "talk" | "text_completion" | "reading_passage";
  passageText?: string;
  transcript?: string;
  audioUrl?: string;
  imageUrl?: string;
  source?: string;
}

export interface Answer {
  id: number;
  questionId: number;
  answerText: string;
  answerAudioUrl?: string;
  isCorrect: boolean;
  displayOrder: number;
  explanation?: string;
}

export interface Question {
  id: number;
  questionGroupId?: number;
  skill: Skill;
  part: number;
  questionType: string;
  questionText?: string;
  passageText?: string;
  transcript?: string;
  audioUrl?: string;
  imageUrl?: string;
  explanation: string;
  topicId?: number;
  grammarPointId?: number;
  difficultyLevel: DifficultyLevel;
  difficultyScore: number;
  estimatedTimeSeconds: number;
  correctRate: number;
  attemptCount: number;
  correctCount: number;
  isActive: boolean;
  answers?: Answer[];
}

export interface UserAnswer {
  questionId: number;
  selectedAnswerId?: number;
  isCorrect: boolean;
  timeSpentSeconds: number;
  answeredAt: string;
}

export interface UserAttempt {
  id: string;
  userId: string;
  mode: AttemptMode;
  skill: Skill | "both";
  part?: number;
  status: "in_progress" | "submitted" | "abandoned";
  startedAt: string;
  submittedAt?: string;
  durationSeconds: number;
  questionIds: number[];
  answers: UserAnswer[];
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  estimatedListeningScore?: number;
  estimatedReadingScore?: number;
  estimatedTotalScore?: number;
  scoreConfidence?: number;
  lockedFeatures?: LockedFeature[];
}

export interface LockedFeature {
  feature: FeatureKey;
  message: string;
}

export interface Stat {
  levelScore: number;
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
  estimatedScore?: number;
  lastPracticedAt?: string;
}

export interface Weakness {
  id: string;
  weaknessType: "part" | "topic" | "grammar";
  skill: Skill;
  part?: number;
  topicId?: number;
  grammarPointId?: number;
  severityScore: number;
  accuracy: number;
  sampleSize: number;
  lastDetectedAt: string;
}

export interface Bookmark {
  questionId: number;
  note?: string;
  createdAt: string;
}

export interface VocabularyCollectionItem {
  id: string;
  userId: string;
  word: string;
  meaning: string;
  level: string;
  sourceQuestionId?: number;
  part?: number;
  topicId?: number;
  createdAt: string;
  lastReviewedAt?: string;
  mastery: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role?: "user" | "admin";
  targetScore: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  onboardingCompleted: boolean;
}

export interface Plan {
  id: number;
  name: string;
  slug: PlanSlug;
  price: number;
  currency: string;
  durationDays: number | null;
  dailyTestLimit: number | null;
  aiExplanationLimit: number | null;
  hasAiFeatures: boolean;
  hasWeaknessAnalysis: boolean;
  hasAdaptiveLearning: boolean;
  hasAdvancedDashboard: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: number;
  status: SubscriptionStatus;
  startedAt: string;
  expiresAt: string | null;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserDailyUsage {
  id: string;
  userId: string;
  usageDate: string;
  testCount: number;
  aiExplanationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureAccessLog {
  id: string;
  userId: string;
  featureKey: FeatureKey;
  allowed: boolean;
  reason: string;
  createdAt: string;
}

export interface PaymentTransaction {
  id: string;
  userId: string;
  planId: number;
  amount: number;
  currency: string;
  provider: "mock" | "vnpay" | "momo" | "stripe";
  providerTransactionId: string;
  status: PaymentStatus;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccessDecision {
  success: boolean;
  code?: "DAILY_TEST_LIMIT_REACHED" | "PREMIUM_REQUIRED" | "AI_EXPLANATION_LIMIT_REACHED";
  message?: string;
  feature?: FeatureKey;
  upgradeRequired?: boolean;
}

export interface AppState {
  auth: AuthState;
  user: UserProfile;
  plans: Plan[];
  topics: Topic[];
  grammarPoints: GrammarPoint[];
  questionGroups: QuestionGroup[];
  subscriptions: Subscription[];
  userDailyUsages: UserDailyUsage[];
  featureAccessLogs: FeatureAccessLog[];
  paymentTransactions: PaymentTransaction[];
  attempts: UserAttempt[];
  bookmarks: Bookmark[];
  vocabularyCollection: VocabularyCollectionItem[];
  skillStats: Record<Skill, Stat>;
  partStats: Record<string, Stat>;
  weaknesses: Weakness[];
  questions: Question[];
}
