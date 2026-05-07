import type { Answer, AttemptMode, AppState, PlanSlug, Question, Skill, Stat, UserAnswer, UserAttempt, Weakness } from "../types";

const API_BASE_URL = ((import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL) ?? "http://127.0.0.1:8000/api";
const API_TOKEN_KEY = "toeic2skills-api-token";

type ApiOptions = RequestInit & {
  json?: unknown;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor(status: number, message: string, code?: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const token = getApiToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.json ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.json ? JSON.stringify(options.json) : options.body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, payload.message ?? "API request failed.", payload.code, payload);
  }
  return payload as T;
}

export function getApiToken() {
  return localStorage.getItem(API_TOKEN_KEY);
}

export function setApiToken(token: string) {
  localStorage.setItem(API_TOKEN_KEY, token);
}

export function clearApiToken() {
  localStorage.removeItem(API_TOKEN_KEY);
}

export function loginApi(email: string, password: string) {
  return apiRequest<{ success: true; token: string; user: ApiUser }>("/auth/login", { method: "POST", json: { email, password } });
}

export function registerApi(name: string, email: string, password: string) {
  return apiRequest<{ success: true; token: string; user: ApiUser }>("/auth/register", {
    method: "POST",
    json: { name, email, password, password_confirmation: password },
  });
}

export function logoutApi() {
  return apiRequest<{ success: true }>("/auth/logout", { method: "POST" });
}

export function getCurrentUserApi() {
  return apiRequest<{ success: true; user: ApiUser }>("/auth/me");
}

export function getSubscriptionApi() {
  return apiRequest<ApiSubscriptionSummary>("/me/subscription");
}

export function getDashboardApi() {
  return apiRequest<ApiDashboardResponse>("/dashboard");
}

export function subscribeApi(planSlug: PlanSlug) {
  return apiRequest<{ success: true }>("/subscriptions/subscribe", { method: "POST", json: { plan_slug: planSlug } });
}

export function cancelSubscriptionApi() {
  return apiRequest<{ success: true }>("/subscriptions/cancel", { method: "POST" });
}

export function startPracticeApi(part: number, questionCount: number, adaptive = false) {
  const skill: Skill = part <= 4 ? "listening" : "reading";
  return apiRequest<ApiStartAttemptResponse>(adaptive ? "/practice/adaptive/start" : "/practice/start", {
    method: "POST",
    json: { skill, part, question_count: questionCount },
  });
}

export function startTestApi(mode: "mini_test" | "full_test" | "placement") {
  return apiRequest<ApiStartAttemptResponse>("/tests/start", { method: "POST", json: { mode, skill: "both" } });
}

export function submitAttemptApi(attempt: UserAttempt) {
  return apiRequest<ApiSubmitAttemptResponse>(`/attempts/${attempt.id}/submit`, {
    method: "POST",
    json: {
      answers: attempt.answers.map((answer) => ({
        question_id: answer.questionId,
        selected_answer_id: answer.selectedAnswerId ?? null,
      })),
    },
  });
}

export function getAdminQuestionsApi() {
  return apiRequest<{ success: true; questions: ApiAdminQuestion[] | { data: ApiAdminQuestion[] } }>("/admin/questions");
}

export function createAdminQuestionApi(question: Question) {
  return apiRequest<{ success: true; question: ApiAdminQuestion }>("/admin/questions", {
    method: "POST",
    json: questionToAdminPayload(question),
  });
}

export function updateAdminQuestionApi(question: Question) {
  return apiRequest<{ success: true; question: ApiAdminQuestion }>(`/admin/questions/${question.id}`, {
    method: "PUT",
    json: questionToAdminPayload(question),
  });
}

export function deleteAdminQuestionApi(questionId: number) {
  return apiRequest<{ success: true; question: ApiAdminQuestion }>(`/admin/questions/${questionId}`, { method: "DELETE" });
}

export async function uploadAdminMediaApi(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const payload = await apiRequest<{ success: true; file: { key: string; url: string; mimetype: string; size: number } }>("/admin/media", {
    method: "POST",
    body: formData,
  });
  return payload as { success: true; file: { key: string; url: string; mimetype: string; size: number } };
}

export function mapApiQuestion(question: ApiQuestion): Question {
  const questionId = question.id;
  return {
    id: questionId,
    skill: question.skill,
    part: question.part,
    questionType: question.questionType ?? question.question_type ?? "",
    questionText: question.questionText ?? question.question_text,
    passageText: question.passageText ?? question.passage_text,
    transcript: question.transcript,
    audioUrl: question.audioUrl ?? question.audio_url,
    imageUrl: question.imageUrl ?? question.image_url,
    explanation: question.explanation ?? "",
    difficultyLevel: question.difficultyLevel ?? question.difficulty_level,
    difficultyScore: question.difficultyScore ?? question.difficulty_score,
    estimatedTimeSeconds: question.estimatedTimeSeconds ?? question.estimated_time_seconds,
    correctRate: question.correctRate ?? question.correct_rate ?? 0,
    attemptCount: question.attemptCount ?? question.attempt_count ?? 0,
    correctCount: question.correctCount ?? question.correct_count ?? 0,
    isActive: question.isActive ?? question.is_active,
    answers: question.answers?.map((answer) => mapApiAnswer(answer, questionId, false)),
  };
}

export function mapApiAdminQuestion(question: ApiAdminQuestion): Question {
  return {
    ...mapApiQuestion(question),
    explanation: question.explanation,
    transcript: question.transcript,
    passageText: question.passageText,
    audioUrl: question.audioUrl,
    imageUrl: question.imageUrl,
    answers: question.answers?.map((answer) => mapApiAnswer(answer, question.id, true)),
  } as Question & { answers?: Answer[] };
}

function mapApiAnswer(answer: ApiAnswer, questionId: number, includeCorrect: boolean): Answer {
  return {
    id: answer.id,
    questionId: answer.questionId ?? answer.question_id ?? questionId,
    answerText: answer.answerText ?? answer.answer_text,
    answerAudioUrl: answer.answerAudioUrl ?? answer.answer_audio_url,
    isCorrect: includeCorrect ? Boolean(answer.isCorrect ?? answer.is_correct) : false,
    displayOrder: answer.displayOrder ?? answer.display_order,
    explanation: answer.explanation,
  };
}

function questionToAdminPayload(question: Question) {
  const adminQuestion = question as Question & { answers?: Answer[] };
  return {
    skill: question.skill,
    part: question.part,
    question_type: question.questionType,
    question_text: question.questionText ?? "",
    passage_text: question.passageText ?? null,
    transcript: question.transcript ?? null,
    audio_url: question.audioUrl ?? null,
    image_url: question.imageUrl ?? null,
    explanation: question.explanation,
    difficulty_level: question.difficultyLevel,
    difficulty_score: question.difficultyScore,
    estimated_time_seconds: question.estimatedTimeSeconds,
    is_active: question.isActive,
    answers: adminQuestion.answers?.map((answer) => ({
      id: answer.id > 0 ? answer.id : undefined,
      answer_text: answer.answerText,
      is_correct: answer.isCorrect,
      display_order: answer.displayOrder,
      explanation: answer.explanation ?? null,
    })),
  };
}

export function mapApiAttempt(attempt: ApiAttempt): UserAttempt {
  return {
    id: String(attempt.id),
    userId: String(attempt.userId ?? attempt.user_id),
    mode: attempt.mode,
    skill: "both",
    status: attempt.status === "expired" ? "abandoned" : attempt.status === "completed" ? "submitted" : attempt.status,
    startedAt: attempt.startedAt ?? attempt.started_at ?? new Date().toISOString(),
    submittedAt: attempt.submittedAt ?? attempt.submitted_at,
    durationSeconds: 0,
    questionIds: attempt.questionIds ?? attempt.questions?.map((question) => question.id) ?? [],
    answers: [],
    totalQuestions: attempt.totalQuestions ?? attempt.total_questions,
    correctCount: attempt.correctCount ?? attempt.correct_count ?? 0,
    accuracy: Number(attempt.accuracy ?? 0),
    estimatedListeningScore: attempt.estimatedListeningScore ?? attempt.estimated_listening_score,
    estimatedReadingScore: attempt.estimatedReadingScore ?? attempt.estimated_reading_score,
    estimatedTotalScore: attempt.estimatedTotalScore ?? attempt.estimated_total_score,
    scoreConfidence: Number(attempt.scoreConfidence ?? attempt.score_confidence ?? 0),
  };
}

export function mapApiSubmitResponse(response: ApiSubmitAttemptResponse, fallbackAnswers: UserAnswer[]): UserAttempt {
  const attempt = mapApiAttempt(response.attempt);
  const reviewAnswers = response.review?.map((item) => ({
    questionId: item.question.id,
    selectedAnswerId: item.selected_answer_id ?? undefined,
    isCorrect: Boolean(item.is_correct),
    timeSpentSeconds: item.time_spent_seconds ?? item.question.estimated_time_seconds ?? 0,
    answeredAt: response.attempt.submitted_at ?? response.attempt.submittedAt ?? new Date().toISOString(),
  }));

  return {
    ...attempt,
    answers: reviewAnswers?.length ? reviewAnswers : fallbackAnswers,
  };
}

export function applyDashboardToState(state: AppState, response: ApiDashboardResponse): AppState {
  const attempts = response.recent_attempts.map(mapApiAttempt);
  const skillStats = {
    listening: mapApiStat(response.skill_stats.listening, state.skillStats.listening?.estimatedScore),
    reading: mapApiStat(response.skill_stats.reading, state.skillStats.reading?.estimatedScore),
  };

  const partStats = { ...state.partStats };
  Object.entries(response.part_stats).forEach(([part, stat]) => {
    const numericPart = Number(part);
    const skill: Skill = numericPart <= 4 ? "listening" : "reading";
    partStats[`${skill}-${numericPart}`] = mapApiStat(stat);
  });

  const weaknesses: Weakness[] = response.weaknesses.map((weakness) => {
    const part = weakness.part;
    const skill: Skill = part <= 4 ? "listening" : "reading";
    return {
      id: `remote-part-${part}`,
      weaknessType: "part",
      skill,
      part,
      severityScore: Math.max(1, Math.min(100, Math.round(100 - weakness.accuracy))),
      accuracy: Math.round(weakness.accuracy),
      sampleSize: weakness.total_answered,
      lastDetectedAt: new Date().toISOString(),
    };
  });

  const latest = attempts[0];
  if (latest) {
    skillStats.listening.estimatedScore = latest.estimatedListeningScore;
    skillStats.reading.estimatedScore = latest.estimatedReadingScore;
  }

  return {
    ...state,
    attempts: mergeAttempts(state.attempts, attempts),
    skillStats,
    partStats,
    weaknesses,
  };
}

function mapApiStat(stat: ApiStat, estimatedScore?: number): Stat {
  return {
    levelScore: stat.level_score,
    totalAnswered: stat.total_answered,
    totalCorrect: stat.total_correct,
    accuracy: Math.round(stat.accuracy),
    estimatedScore,
  };
}

function mergeAttempts(local: UserAttempt[], remote: UserAttempt[]) {
  const map = new Map<string, UserAttempt>();
  [...remote, ...local].forEach((attempt) => {
    map.set(String(attempt.id), attempt);
  });
  return Array.from(map.values()).sort((a, b) => new Date(b.submittedAt ?? b.startedAt).getTime() - new Date(a.submittedAt ?? a.startedAt).getTime());
}

export function mapApiUser(user: ApiUser) {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    targetScore: user.targetScore ?? user.target_score ?? 650,
  };
}

export function extractAdminQuestions(response: { questions: ApiAdminQuestion[] | { data: ApiAdminQuestion[] } }) {
  return Array.isArray(response.questions) ? response.questions : response.questions.data;
}

export function mapSubscriptionSummary(response: ApiSubscriptionSummary) {
  return {
    plan: response.plan === "admin" ? ("premium_yearly" as PlanSlug) : response.plan,
    planName: response.plan_name ?? response.plan,
    isPremium: response.is_premium,
    subscriptionStatus: response.subscription_status,
    expiresAt: response.expires_at,
    dailyTestLimit: response.daily_test_limit,
    usedTestsToday: response.used_tests_today,
    remainingTestsToday: response.remaining_tests_today,
    features: {
      ai_explanation: Boolean(response.features.ai_explanation),
      weakness_analysis: Boolean(response.features.weakness_analysis),
      adaptive_learning: Boolean(response.features.adaptive_learning),
      advanced_dashboard: Boolean(response.features.advanced_dashboard),
      unlimited_tests: response.daily_test_limit === null || Boolean(response.features.unlimited_tests),
      recommendations: Boolean(response.features.recommendations),
    },
  };
}

export interface ApiUser {
  id: string | number;
  name: string;
  email: string;
  role: "user" | "admin";
  targetScore?: number;
  target_score?: number;
}

export interface ApiSubscriptionSummary {
  success: true;
  plan: PlanSlug | "free" | "admin";
  plan_name?: string;
  is_premium: boolean;
  subscription_status: string;
  expires_at: string | null;
  daily_test_limit: number | null;
  used_tests_today: number;
  remaining_tests_today: number | null;
  features: Record<string, boolean>;
}

export interface ApiStartAttemptResponse {
  success: true;
  attempt: ApiAttempt;
  questions: ApiQuestion[];
}

export interface ApiSubmitAttemptResponse {
  success: true;
  attempt: ApiAttempt;
  score?: {
    listening?: number;
    reading?: number;
    total?: number;
    confidence?: number;
    label: "estimated";
  };
  review?: Array<{
    question: ApiQuestion;
    selected_answer_id: number | null;
    is_correct: boolean;
    time_spent_seconds?: number;
  }>;
  locked_features?: Array<{ feature: string; message: string }>;
}

export interface ApiDashboardResponse {
  success: true;
  estimated_score: {
    listening: number | null;
    reading: number | null;
    total: number | null;
    confidence: number | null;
  };
  skill_stats: Record<Skill, ApiStat>;
  part_stats: Record<string, ApiStat>;
  weaknesses: Array<ApiStat & { part: number }>;
  recent_attempts: ApiAttempt[];
}

export interface ApiStat {
  level_score: number;
  total_answered: number;
  total_correct: number;
  accuracy: number;
}

export interface ApiAttempt {
  id: string | number;
  userId?: string | number;
  user_id?: string | number;
  mode: AttemptMode;
  adaptive?: boolean;
  status: "in_progress" | "submitted" | "completed" | "abandoned" | "expired";
  startedAt?: string;
  started_at?: string;
  submittedAt?: string;
  submitted_at?: string;
  questionIds?: number[];
  questions?: ApiQuestion[];
  totalQuestions?: number;
  total_questions: number;
  correctCount?: number;
  correct_count?: number;
  accuracy?: number;
  estimatedListeningScore?: number;
  estimated_listening_score?: number;
  estimatedReadingScore?: number;
  estimated_reading_score?: number;
  estimatedTotalScore?: number;
  estimated_total_score?: number;
  scoreConfidence?: number;
  score_confidence?: number;
}

export interface ApiQuestion {
  id: number;
  skill: Skill;
  part: number;
  questionType?: string;
  question_type?: string;
  questionText?: string;
  question_text?: string;
  passageText?: string;
  passage_text?: string;
  transcript?: string;
  audioUrl?: string;
  audio_url?: string;
  imageUrl?: string;
  image_url?: string;
  explanation?: string;
  difficultyLevel: "easy" | "medium" | "hard";
  difficulty_level: "easy" | "medium" | "hard";
  difficultyScore: number;
  difficulty_score: number;
  estimatedTimeSeconds: number;
  estimated_time_seconds: number;
  correctRate?: number;
  correct_rate?: number;
  attemptCount?: number;
  attempt_count?: number;
  correctCount?: number;
  correct_count?: number;
  isActive?: boolean;
  is_active: boolean;
  answers?: ApiAnswer[];
}

export interface ApiAdminQuestion extends ApiQuestion {
  explanation: string;
  answers?: ApiAnswer[];
}

export interface ApiAnswer {
  id: number;
  questionId?: number;
  question_id?: number;
  answerText?: string;
  answer_text: string;
  answerAudioUrl?: string;
  answer_audio_url?: string;
  isCorrect?: boolean;
  is_correct?: boolean;
  displayOrder?: number;
  display_order: number;
  explanation?: string;
}
