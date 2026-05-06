import type { Question, Skill, Stat, Weakness } from "../types";

export function partKey(skill: Skill, part: number) {
  return `${skill}-${part}`;
}

function inRange(question: Question, range: [number, number]) {
  return question.difficultyScore >= range[0] && question.difficultyScore <= range[1];
}

function scoreCandidate(question: Question, weaknesses: Weakness[], recentQuestionIds: Set<number>) {
  let score = 0;
  if (!recentQuestionIds.has(question.id)) score += 50;
  if (question.attemptCount >= 30) score += 12;
  if (weaknesses.some((weakness) => weakness.part === question.part)) score += 18;
  if (question.topicId && weaknesses.some((weakness) => weakness.topicId === question.topicId)) score += 15;
  if (question.grammarPointId && weaknesses.some((weakness) => weakness.grammarPointId === question.grammarPointId)) score += 15;
  score += Math.max(0, 10 - Math.abs(55 - question.difficultyScore) / 10);
  return score;
}

function pickQuestions(
  pool: Question[],
  range: [number, number],
  count: number,
  weaknesses: Weakness[],
  recentQuestionIds: Set<number>,
) {
  const ranked = pool
    .filter((question) => inRange(question, range))
    .sort((a, b) => scoreCandidate(b, weaknesses, recentQuestionIds) - scoreCandidate(a, weaknesses, recentQuestionIds));
  return ranked.slice(0, count);
}

export function generateAdaptivePractice({
  questions,
  skill,
  part,
  questionCount,
  partStats,
  weaknesses,
  recentQuestionIds,
}: {
  questions: Question[];
  skill: Skill;
  part: number;
  questionCount: number;
  partStats: Record<string, Stat>;
  weaknesses: Weakness[];
  recentQuestionIds: number[];
}) {
  const userLevel = partStats[partKey(skill, part)]?.levelScore ?? 50;
  const recentSet = new Set(recentQuestionIds);
  const pool = questions.filter((question) => question.isActive && question.skill === skill && question.part === part);

  const easyCount = Math.round(questionCount * 0.25);
  const fitCount = Math.round(questionCount * 0.6);
  const hardCount = questionCount - easyCount - fitCount;

  const easyRange: [number, number] = [Math.max(1, userLevel - 25), Math.max(1, userLevel - 10)];
  const fitRange: [number, number] = [Math.max(1, userLevel - 10), Math.min(100, userLevel + 10)];
  const hardRange: [number, number] = [Math.min(100, userLevel + 10), Math.min(100, userLevel + 25)];

  let selected = [
    ...pickQuestions(pool, fitRange, fitCount, weaknesses, recentSet),
    ...pickQuestions(pool, easyRange, easyCount, weaknesses, recentSet),
    ...pickQuestions(pool, hardRange, hardCount, weaknesses, recentSet),
  ];

  const selectedIds = new Set(selected.map((question) => question.id));
  const fallback = pool
    .filter((question) => !selectedIds.has(question.id))
    .sort((a, b) => scoreCandidate(b, weaknesses, recentSet) - scoreCandidate(a, weaknesses, recentSet));

  selected = [...selected, ...fallback].slice(0, questionCount);
  return selected.sort((a, b) => (a.questionGroupId ?? a.id) - (b.questionGroupId ?? b.id));
}

export function generateStandardPractice(questions: Question[], skill: Skill, part: number, questionCount: number) {
  return questions
    .filter((question) => question.isActive && question.skill === skill && question.part === part)
    .sort((a, b) => a.difficultyScore - b.difficultyScore)
    .slice(0, questionCount);
}

export function generateTestQuestions(questions: Question[], mode: "mini_test" | "full_test" | "placement") {
  const perPart = mode === "full_test" ? 4 : mode === "placement" ? 2 : 1;
  return [1, 2, 3, 4, 5, 6, 7].flatMap((part) =>
    questions
      .filter((question) => question.part === part && question.isActive)
      .sort((a, b) => a.difficultyScore - b.difficultyScore)
      .slice(0, perPart),
  );
}
