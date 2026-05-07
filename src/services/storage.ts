import { grammarPoints as seedGrammarPoints, questionGroups as seedQuestionGroups, questions as seedQuestions, topics as seedTopics } from "../data";
import type { AppState, Skill, Stat, UserAttempt, UserProfile, Weakness } from "../types";
import { calculateEstimatedToeicScore, calculateLevelDelta, updateQuestionDifficulty } from "./scoring";
import { partKey } from "./adaptive";
import { getCurrentPlan, seedPlans } from "./subscription";

const STORAGE_KEY = "toeic-adaptive-platform-state";

const defaultUser: UserProfile = {
  id: "demo-user",
  name: "Demo Learner",
  email: "learner@example.com",
  targetScore: 650,
};

function emptyStat(levelScore = 50): Stat {
  return {
    levelScore,
    totalAnswered: 0,
    totalCorrect: 0,
    accuracy: 0,
  };
}

export function createInitialState(): AppState {
  const partStats = {} as Record<string, Stat>;
  seedQuestions.forEach((question) => {
    partStats[partKey(question.skill, question.part)] = emptyStat(50);
  });

  return {
    auth: {
      isAuthenticated: false,
      onboardingCompleted: false,
    },
    user: defaultUser,
    plans: seedPlans,
    topics: seedTopics,
    grammarPoints: seedGrammarPoints,
    questionGroups: seedQuestionGroups,
    subscriptions: [],
    userDailyUsages: [],
    featureAccessLogs: [],
    paymentTransactions: [],
    attempts: [],
    bookmarks: [],
    vocabularyCollection: [],
    questions: seedQuestions,
    skillStats: {
      listening: emptyStat(50),
      reading: emptyStat(50),
    },
    partStats,
    weaknesses: [],
  };
}

export function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createInitialState();
  try {
    const parsed = JSON.parse(raw) as AppState;
    return {
      ...createInitialState(),
      ...parsed,
      auth: parsed.auth ?? createInitialState().auth,
      plans: parsed.plans?.length ? parsed.plans : seedPlans,
      topics: parsed.topics?.length ? parsed.topics : seedTopics,
      grammarPoints: parsed.grammarPoints?.length ? parsed.grammarPoints : seedGrammarPoints,
      questionGroups: parsed.questionGroups?.length ? parsed.questionGroups : seedQuestionGroups,
      subscriptions: parsed.subscriptions ?? [],
      userDailyUsages: parsed.userDailyUsages ?? [],
      featureAccessLogs: parsed.featureAccessLogs ?? [],
      paymentTransactions: parsed.paymentTransactions ?? [],
      vocabularyCollection: parsed.vocabularyCollection ?? [],
      questions: parsed.questions?.length ? parsed.questions : seedQuestions,
    };
  } catch {
    return createInitialState();
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function submitAttempt(state: AppState, attempt: UserAttempt): AppState {
  const submittedAt = new Date().toISOString();
  const correctCount = attempt.answers.filter((answer) => answer.isCorrect).length;
  const totalQuestions = attempt.questionIds.length;
  const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const score = calculateEstimatedToeicScore({ ...attempt, totalQuestions, correctCount, accuracy }, state.questions);
  const plan = getCurrentPlan(state, state.user);
  const isPremium = plan.slug !== "free";

  const submitted: UserAttempt = {
    ...attempt,
    status: "submitted",
    submittedAt,
    durationSeconds: Math.max(1, Math.round((Date.now() - new Date(attempt.startedAt).getTime()) / 1000)),
    totalQuestions,
    correctCount,
    accuracy,
    ...score,
    lockedFeatures: isPremium
      ? []
      : [
          {
            feature: "weakness_analysis",
            message: "Nâng cấp Premium để xem phân tích điểm yếu.",
          },
          {
            feature: "recommendations",
            message: "Nâng cấp Premium để nhận lộ trình ôn tập cá nhân hóa.",
          },
          {
            feature: "adaptive_learning",
            message: "Nâng cấp Premium để luyện adaptive learning.",
          },
        ],
  };

  const nextQuestions = state.questions.map((question) => {
    const answer = submitted.answers.find((item) => item.questionId === question.id);
    if (!answer) return question;
    return updateQuestionDifficulty({
      ...question,
      attemptCount: question.attemptCount + 1,
      correctCount: question.correctCount + (answer.isCorrect ? 1 : 0),
    });
  });

  const nextState = {
    ...state,
    questions: nextQuestions,
    attempts: [submitted, ...state.attempts.filter((item) => item.id !== submitted.id)],
  };

  return recomputeStats(nextState);
}

export function recomputeStats(state: AppState): AppState {
  const submittedAttempts = state.attempts.filter((attempt) => attempt.status === "submitted");
  const skillStats: Record<Skill, Stat> = {
    listening: emptyStat(state.skillStats.listening?.levelScore ?? 50),
    reading: emptyStat(state.skillStats.reading?.levelScore ?? 50),
  };
  const partStats = { ...state.partStats };
  const weaknesses: Weakness[] = [];

  (["listening", "reading"] as Skill[]).forEach((skill) => {
    const answers = submittedAttempts.flatMap((attempt) =>
      attempt.answers.filter((answer) => state.questions.find((question) => question.id === answer.questionId)?.skill === skill),
    );
    const correct = answers.filter((answer) => answer.isCorrect).length;
    const delta = calculateLevelDelta(skillStats[skill].levelScore, answers, state.questions);
    skillStats[skill] = {
      levelScore: Math.round(Math.max(1, Math.min(100, skillStats[skill].levelScore + delta))),
      totalAnswered: answers.length,
      totalCorrect: correct,
      accuracy: answers.length ? Math.round((correct / answers.length) * 100) : 0,
      estimatedScore:
        answers.length > 0 ? Math.max(5, Math.min(495, Math.round((5 + (correct / answers.length) * 490) / 5) * 5)) : undefined,
      lastPracticedAt: submittedAttempts[0]?.submittedAt,
    };
  });

  for (let part = 1; part <= 7; part += 1) {
    const skill: Skill = part <= 4 ? "listening" : "reading";
    const key = partKey(skill, part);
    const answers = submittedAttempts.flatMap((attempt) =>
      attempt.answers.filter((answer) => {
        const question = state.questions.find((item) => item.id === answer.questionId);
        return question?.skill === skill && question.part === part;
      }),
    );
    const correct = answers.filter((answer) => answer.isCorrect).length;
    const previousLevel = partStats[key]?.levelScore ?? 50;
    const delta = calculateLevelDelta(previousLevel, answers, state.questions);
    const accuracy = answers.length ? Math.round((correct / answers.length) * 100) : 0;

    partStats[key] = {
      levelScore: Math.round(Math.max(1, Math.min(100, previousLevel + delta))),
      totalAnswered: answers.length,
      totalCorrect: correct,
      accuracy,
      lastPracticedAt: submittedAttempts[0]?.submittedAt,
    };

    if (answers.length >= 2 && accuracy < 65) {
      weaknesses.push({
        id: `part-${part}`,
        weaknessType: "part",
        skill,
        part,
        severityScore: Math.min(100, 100 - accuracy),
        accuracy,
        sampleSize: answers.length,
        lastDetectedAt: submittedAttempts[0]?.submittedAt ?? new Date().toISOString(),
      });
    }
  }

  const topicBuckets = new Map<number, { skill: Skill; correct: number; total: number }>();
  const grammarBuckets = new Map<number, { skill: Skill; correct: number; total: number }>();

  submittedAttempts.flatMap((attempt) => attempt.answers).forEach((answer) => {
    const question = state.questions.find((item) => item.id === answer.questionId);
    if (!question) return;
    if (question.topicId) {
      const bucket = topicBuckets.get(question.topicId) ?? { skill: question.skill, correct: 0, total: 0 };
      bucket.total += 1;
      bucket.correct += answer.isCorrect ? 1 : 0;
      topicBuckets.set(question.topicId, bucket);
    }
    if (question.grammarPointId) {
      const bucket = grammarBuckets.get(question.grammarPointId) ?? { skill: question.skill, correct: 0, total: 0 };
      bucket.total += 1;
      bucket.correct += answer.isCorrect ? 1 : 0;
      grammarBuckets.set(question.grammarPointId, bucket);
    }
  });

  topicBuckets.forEach((bucket, topicId) => {
    const accuracy = Math.round((bucket.correct / bucket.total) * 100);
    if (bucket.total >= 2 && accuracy < 65) {
      weaknesses.push({
        id: `topic-${topicId}`,
        weaknessType: "topic",
        skill: bucket.skill,
        topicId,
        severityScore: 100 - accuracy,
        accuracy,
        sampleSize: bucket.total,
        lastDetectedAt: submittedAttempts[0]?.submittedAt ?? new Date().toISOString(),
      });
    }
  });

  grammarBuckets.forEach((bucket, grammarPointId) => {
    const accuracy = Math.round((bucket.correct / bucket.total) * 100);
    if (bucket.total >= 2 && accuracy < 70) {
      weaknesses.push({
        id: `grammar-${grammarPointId}`,
        weaknessType: "grammar",
        skill: bucket.skill,
        grammarPointId,
        severityScore: 100 - accuracy,
        accuracy,
        sampleSize: bucket.total,
        lastDetectedAt: submittedAttempts[0]?.submittedAt ?? new Date().toISOString(),
      });
    }
  });

  return {
    ...state,
    skillStats,
    partStats,
    weaknesses: weaknesses.sort((a, b) => b.severityScore - a.severityScore).slice(0, 8),
  };
}
