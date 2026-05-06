import type { DifficultyLevel, Question, Skill, UserAttempt, UserAnswer } from "../types";

export function roundToNearest5(value: number) {
  return Math.max(5, Math.min(495, Math.round(value / 5) * 5));
}

export function estimateSectionScore(projectedCorrect: number) {
  if (projectedCorrect <= 0) return 5;
  if (projectedCorrect >= 100) return 495;
  return roundToNearest5(5 + projectedCorrect * 4.9);
}

export function calculateConfidence(questionCount: number, partCoverage: number, difficultyCoverage: number) {
  const sampleScore = Math.min(questionCount / 100, 1);
  const confidence = 0.5 * sampleScore + 0.3 * partCoverage + 0.2 * difficultyCoverage;
  return Math.round(confidence * 100);
}

export function calculateEstimatedToeicScore(attempt: UserAttempt, questions: Question[]) {
  const sectionScores = (["listening", "reading"] as Skill[]).map((skill) => {
    const sectionQuestionIds = attempt.questionIds.filter((id) => questions.find((q) => q.id === id)?.skill === skill);
    const sectionAnswers = attempt.answers.filter((answer) => sectionQuestionIds.includes(answer.questionId));
    const correct = sectionAnswers.filter((answer) => answer.isCorrect).length;
    const total = sectionQuestionIds.length;

    if (total === 0) {
      return { skill, score: undefined, confidence: 0 };
    }

    const projectedCorrect = total === 100 ? correct : (correct / total) * 100;
    const score = estimateSectionScore(projectedCorrect);
    const uniqueParts = new Set(sectionQuestionIds.map((id) => questions.find((q) => q.id === id)?.part)).size;
    const partCoverage = skill === "listening" ? Math.min(uniqueParts / 4, 1) : Math.min(uniqueParts / 3, 1);
    const difficultySpread = new Set(
      sectionQuestionIds.map((id) => questions.find((q) => q.id === id)?.difficultyLevel),
    ).size;
    const difficultyCoverage = Math.min(difficultySpread / 3, 1);
    const confidence = total === 100 ? 95 : calculateConfidence(total, partCoverage, difficultyCoverage);

    return { skill, score, confidence };
  });

  const listening = sectionScores.find((item) => item.skill === "listening");
  const reading = sectionScores.find((item) => item.skill === "reading");
  const totalScore = (listening?.score ?? 0) + (reading?.score ?? 0);
  const activeConfidences = sectionScores.filter((item) => item.score !== undefined).map((item) => item.confidence);
  const confidence =
    activeConfidences.length > 0
      ? Math.round(activeConfidences.reduce((sum, item) => sum + item, 0) / activeConfidences.length)
      : 0;

  return {
    estimatedListeningScore: listening?.score,
    estimatedReadingScore: reading?.score,
    estimatedTotalScore: totalScore > 0 ? Math.round(totalScore / 5) * 5 : undefined,
    scoreConfidence: confidence,
  };
}

export function expectedAccuracyForLevel(userLevel: number, questionDifficulty: number) {
  const gap = userLevel - questionDifficulty;
  return Math.max(0.25, Math.min(0.9, 0.65 + gap / 200));
}

export function calculateLevelDelta(currentLevel: number, answers: UserAnswer[], questions: Question[]) {
  if (answers.length === 0) return 0;
  const accuracy = answers.filter((answer) => answer.isCorrect).length / answers.length;
  const avgDifficulty =
    answers.reduce((sum, answer) => sum + (questions.find((question) => question.id === answer.questionId)?.difficultyScore ?? 50), 0) /
    answers.length;
  const expected = expectedAccuracyForLevel(currentLevel, avgDifficulty);
  const confidenceFactor = answers.length < 10 ? 0.5 : 1;
  return (accuracy - expected) * 10 * confidenceFactor;
}

export function mapDifficultyFromRate(smoothedCorrectRate: number) {
  if (smoothedCorrectRate >= 0.8) return { score: 30, level: "easy" as const };
  if (smoothedCorrectRate >= 0.5) return { score: 55, level: "medium" as const };
  return { score: 80, level: "hard" as const };
}

export function updateQuestionDifficulty(question: Question) {
  const priorWeight = 20;
  const priorCorrectRate = question.difficultyScore <= 40 ? 0.78 : question.difficultyScore <= 70 ? 0.62 : 0.42;
  const observedAttempts = question.attemptCount;
  const observedCorrectRate = question.correctCount / Math.max(1, observedAttempts);
  const smoothedCorrectRate =
    (priorCorrectRate * priorWeight + observedCorrectRate * observedAttempts) / (priorWeight + observedAttempts);

  if (observedAttempts < 30) return question;

  const mapped = mapDifficultyFromRate(smoothedCorrectRate);
  const delta = Math.max(-10, Math.min(10, mapped.score - question.difficultyScore));
  const nextScore = Math.max(1, Math.min(100, question.difficultyScore + delta));
  const nextLevel: DifficultyLevel = nextScore <= 40 ? "easy" : nextScore <= 70 ? "medium" : "hard";

  return {
    ...question,
    correctRate: Math.round(smoothedCorrectRate * 100),
    difficultyScore: nextScore,
    difficultyLevel: nextLevel,
  };
}
