import type { Answer, AttemptMode, PlanSlug, Question, Skill, UserAttempt } from "../types";

const API_BASE_URL = ((import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL) ?? "http://127.0.0.1:8000/api";

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.json ? { "Content-Type": "application/json" } : {}),
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

export function loginApi(email: string, password: string) {
  return apiRequest<{ success: true; user: ApiUser }>("/auth/login", { method: "POST", json: { email, password } });
}

export function registerApi(name: string, email: string, password: string) {
  return apiRequest<{ success: true; user: ApiUser }>("/auth/register", { method: "POST", json: { name, email, password } });
}

export function getSubscriptionApi() {
  return apiRequest<ApiSubscriptionSummary>("/me/subscription");
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
  const path = mode === "full_test" ? "/full-tests/start" : mode === "mini_test" ? "/mini-tests/start" : "/tests/start";
  return apiRequest<ApiStartAttemptResponse>(path, { method: "POST" });
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
  return apiRequest<{ success: true; questions: ApiAdminQuestion[] }>("/admin/questions");
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
  const response = await fetch(`${API_BASE_URL}/admin/upload`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": file.type,
      "X-File-Name": file.name,
    },
    body: await file.arrayBuffer(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload.message ?? "Upload failed.", payload.code, payload);
  return payload as { success: true; file: { key: string; url: string; mimetype: string; size: number } };
}

export function mapApiQuestion(question: ApiQuestion): Question {
  return {
    id: question.id,
    skill: question.skill,
    part: question.part,
    questionType: question.questionType,
    questionText: question.questionText,
    passageText: question.passageText,
    transcript: question.transcript,
    audioUrl: question.audioUrl,
    imageUrl: question.imageUrl,
    explanation: question.explanation ?? "",
    difficultyLevel: question.difficultyLevel,
    difficultyScore: question.difficultyScore,
    estimatedTimeSeconds: question.estimatedTimeSeconds,
    correctRate: 0,
    attemptCount: 0,
    correctCount: 0,
    isActive: question.isActive,
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
    answers: question.answers?.map((answer) => ({
      id: answer.id,
      questionId: question.id,
      answerText: answer.answerText,
      isCorrect: answer.isCorrect,
      displayOrder: answer.displayOrder,
      explanation: answer.explanation,
    })),
  } as Question & { answers?: Answer[] };
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
    id: attempt.id,
    userId: attempt.userId,
    mode: attempt.mode,
    skill: "both",
    status: attempt.status === "expired" ? "abandoned" : attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    durationSeconds: 0,
    questionIds: attempt.questionIds,
    answers: [],
    totalQuestions: attempt.totalQuestions,
    correctCount: attempt.correctCount ?? 0,
    accuracy: attempt.accuracy ?? 0,
    estimatedListeningScore: attempt.estimatedListeningScore,
    estimatedReadingScore: attempt.estimatedReadingScore,
    estimatedTotalScore: attempt.estimatedTotalScore,
    scoreConfidence: attempt.scoreConfidence,
  };
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  targetScore: number;
}

export interface ApiSubscriptionSummary {
  success: true;
  plan: PlanSlug | "free";
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
  locked_features?: Array<{ feature: string; message: string }>;
}

export interface ApiAttempt {
  id: string;
  userId: string;
  mode: AttemptMode;
  adaptive?: boolean;
  status: "in_progress" | "submitted" | "abandoned" | "expired";
  startedAt: string;
  submittedAt?: string;
  questionIds: number[];
  totalQuestions: number;
  correctCount?: number;
  accuracy?: number;
  estimatedListeningScore?: number;
  estimatedReadingScore?: number;
  estimatedTotalScore?: number;
  scoreConfidence?: number;
}

export interface ApiQuestion {
  id: number;
  skill: Skill;
  part: number;
  questionType: string;
  questionText?: string;
  passageText?: string;
  transcript?: string;
  audioUrl?: string;
  imageUrl?: string;
  explanation?: string;
  difficultyLevel: "easy" | "medium" | "hard";
  difficultyScore: number;
  estimatedTimeSeconds: number;
  isActive: boolean;
}

export interface ApiAdminQuestion extends ApiQuestion {
  explanation: string;
  answers?: Array<{
    id: number;
    questionId: number;
    answerText: string;
    isCorrect: boolean;
    displayOrder: number;
    explanation?: string;
  }>;
}
