import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crown,
  Eye,
  Flag,
  Headphones,
  Lock,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Volume2,
  XCircle,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { answers, grammarPoints, questionGroups, topics } from "./data";
import { loadLanguage, saveLanguage, translations, type Language, type Translation } from "./i18n";
import {
  AppLayout,
  type AppView,
  GhostButton,
  GlassCard,
  GradientButton,
  LockedFeatureOverlay,
  MetricCard,
  UpgradePremiumModal,
} from "./components/learning-ui";
import { AdminQuestionBankPage } from "./components/admin-question-bank";
import type { AccessDecision, Answer, AppState, FeatureKey, PlanSlug, Question, Skill, UserAttempt, VocabularyCollectionItem } from "./types";
import { generateAdaptivePractice, generateStandardPractice, generateTestQuestions, partKey } from "./services/adaptive";
import {
  ApiError,
  applyDashboardToState,
  applyMetadataToState,
  applyPlansToState,
  cancelSubscriptionApi,
  clearApiToken,
  createAdminQuestionApi,
  extractAdminQuestions,
  deleteBookmarkApi,
  getAdminQuestionsApi,
  getApiToken,
  getCurrentUserApi,
  getDashboardApi,
  getLearningToolsApi,
  getMetadataApi,
  getPlansApi,
  getRecommendationsApi,
  getSubscriptionApi,
  getTestSetsApi,
  loginApi,
  logoutApi,
  mapApiAttempt,
  mapApiAdminQuestion,
  mapApiQuestion,
  mapApiReviewQuestion,
  mapApiSubmitResponse,
  mapApiUser,
  mapSubscriptionSummary,
  registerApi,
  saveBookmarkApi,
  saveVocabularyItemApi,
  setApiToken,
  startPracticeApi,
  startTestApi,
  submitAttemptApi,
  subscribeApi,
  updateAdminQuestionApi,
} from "./services/api";
import type { ApiTestSet } from "./services/api";
import type { ApiRecommendation } from "./services/api";
import { createInitialState, loadState, saveState, submitAttempt } from "./services/storage";
import { checkClientRateLimit, normalizeEmail, sanitizePlainText, validateAuthPayload } from "./services/security";
import {
  cancelSubscription,
  checkDailyTestLimit,
  checkPremiumFeature,
  expireOldSubscriptions,
  getActivePlans,
  getSubscriptionSummary,
  subscribeUser,
} from "./services/subscription";

const partNames: Record<number, string> = {
  1: "Photographs",
  2: "Question-Response",
  3: "Conversations",
  4: "Talks",
  5: "Incomplete Sentences",
  6: "Text Completion",
  7: "Reading Comprehension",
};

const mockVocabulary = [
  { word: "invoice", meaning: "hóa đơn", level: "Business" },
  { word: "confirm", meaning: "xác nhận", level: "Travel" },
  { word: "conference", meaning: "hội nghị", level: "Office" },
];

const vocabularyHints: Record<number, Array<{ word: string; meaning: string; level: string }>> = {
  9: [
    { word: "review", meaning: "xem xet / danh gia", level: "Office" },
    { word: "carefully", meaning: "mot cach can than", level: "Word form" },
  ],
  10: [
    { word: "invoice", meaning: "hoa don", level: "Business" },
    { word: "approve", meaning: "phe duyet", level: "Office" },
  ],
  11: [
    { word: "productivity", meaning: "nang suat", level: "Business" },
    { word: "install", meaning: "cai dat", level: "Technology" },
  ],
  12: [
    { word: "submit", meaning: "nop / gui", level: "Office" },
    { word: "policy", meaning: "chinh sach", level: "Business" },
  ],
  13: [
    { word: "introduce", meaning: "gioi thieu / ap dung", level: "Business" },
    { word: "remote work", meaning: "lam viec tu xa", level: "Office" },
  ],
  14: [
    { word: "registration desk", meaning: "ban dang ky", level: "Event" },
    { word: "confirmation email", meaning: "email xac nhan", level: "Email" },
  ],
  15: [
    { word: "opening session", meaning: "phien khai mac", level: "Event" },
    { word: "hall", meaning: "hoi truong", level: "Event" },
  ],
  16: [
    { word: "register", meaning: "dang ky", level: "Event" },
    { word: "regional", meaning: "thuoc khu vuc", level: "Business" },
  ],
};

const grammarFormulaHints: Record<number, { title: string; pattern: string; example: string; tip: string }> = {
  1: {
    title: "Word form",
    pattern: "Verb + adverb / adjective + noun / determiner + noun",
    example: "The manager reviewed the report carefully.",
    tip: "Xac dinh tu loai can dien bang tu dung truoc va sau cho trong.",
  },
  2: {
    title: "Time expression",
    pattern: "next/last/every + time noun",
    example: "The policy will be introduced next month.",
    tip: "Doc dau hieu thoi gian trong cau de chon thi hoac cum thoi gian phu hop.",
  },
  3: {
    title: "Deadline preposition",
    pattern: "by + deadline / before + event / at + exact time",
    example: "The invoices must be approved by the end of the week.",
    tip: "Neu noi han chot, TOEIC rat hay dung by.",
  },
  5: {
    title: "Relative clause",
    pattern: "thing + which/that + verb / person + who + verb",
    example: "The software, which was installed yesterday, improved productivity.",
    tip: "Which thay cho vat/su viec; who thay cho nguoi.",
  },
};

function App() {
  const [state, setState] = useState<AppState>(() => expireOldSubscriptions(loadState()));
  const [language, setLanguage] = useState<Language>(() => loadLanguage());
  const [view, setView] = useState<AppView>("home");
  const [selectedPart, setSelectedPart] = useState(5);
  const [activeAttempt, setActiveAttempt] = useState<UserAttempt | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealedQuestionId, setRevealedQuestionId] = useState<number | null>(null);
  const [accessModal, setAccessModal] = useState<AccessDecision | null>(null);
  const [remoteSummary, setRemoteSummary] = useState<ReturnType<typeof mapSubscriptionSummary> | null>(null);
  const [testSets, setTestSets] = useState<ApiTestSet[]>([]);
  const [recommendations, setRecommendations] = useState<ApiRecommendation[]>([]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    saveLanguage(language);
  }, [language]);

  useEffect(() => {
    if (!getApiToken()) return;
    Promise.all([
      getCurrentUserApi(),
      getSubscriptionApi(),
      getDashboardApi().catch(() => null),
      getLearningToolsApi().catch(() => null),
      getTestSetsApi().catch(() => null),
      getPlansApi().catch(() => null),
      getMetadataApi().catch(() => null),
    ])
      .then(([userResponse, subscriptionResponse, dashboardResponse, toolsResponse, testSetsResponse, plansResponse, metadataResponse]) => {
        const apiUser = mapApiUser(userResponse.user);
        setRemoteSummary(mapSubscriptionSummary(subscriptionResponse));
        if (testSetsResponse) setTestSets(testSetsResponse.test_sets);
        setState((current) => ({
          ...(metadataResponse ? applyMetadataToState(plansResponse ? applyPlansToState(dashboardResponse ? applyDashboardToState(current, dashboardResponse) : current, plansResponse) : dashboardResponse ? applyDashboardToState(current, dashboardResponse) : current, metadataResponse) : plansResponse ? applyPlansToState(dashboardResponse ? applyDashboardToState(current, dashboardResponse) : current, plansResponse) : dashboardResponse ? applyDashboardToState(current, dashboardResponse) : current),
          ...(toolsResponse ? toolsResponse : {}),
          auth: { ...current.auth, isAuthenticated: true, onboardingCompleted: apiUser.role === "admin" ? true : current.auth.onboardingCompleted },
          user: { ...current.user, ...apiUser },
        }));
      })
      .catch((error) => {
        console.warn("Saved API session is no longer valid.", error);
        clearApiToken();
      });
  }, []);

  const t = translations[language];
  const localSummary = getSubscriptionSummary(state, state.user);
  const isAdmin = state.user.role === "admin";
  const summary = remoteSummary ?? (isAdmin
    ? {
        ...localSummary,
        isPremium: true,
        plan: "premium_yearly" as const,
        planName: "Admin",
        dailyTestLimit: null,
        remainingTestsToday: null,
        features: {
          ai_explanation: true,
          weakness_analysis: true,
          adaptive_learning: true,
          advanced_dashboard: true,
          unlimited_tests: true,
          recommendations: true,
        },
      }
    : localSummary);
  const latestAttempt = state.attempts[0];
  const recentQuestionIds = state.attempts.slice(0, 5).flatMap((attempt) => attempt.answers.map((answer) => answer.questionId));
  const estimatedTotal =
    latestAttempt?.estimatedTotalScore ??
    ((state.skillStats.listening.estimatedScore ?? 250) + (state.skillStats.reading.estimatedScore ?? 250));

  useEffect(() => {
    if (!state.auth.isAuthenticated || !getApiToken() || !summary.features.recommendations) {
      setRecommendations([]);
      return;
    }

    let cancelled = false;
    getRecommendationsApi()
      .then((response) => {
        if (!cancelled) setRecommendations(response.recommendations);
      })
      .catch((error) => {
        if (!cancelled) {
          setRecommendations([]);
          console.warn("Recommendations API unavailable or locked.", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state.auth.isAuthenticated, state.user.role, summary.features.recommendations, latestAttempt?.id]);

  useEffect(() => {
    if (view !== "admin" || !state.auth.isAuthenticated) return;
    let cancelled = false;
    getAdminQuestionsApi()
      .then((response) => {
        if (cancelled) return;
        setState((current) => ({
          ...current,
          questions: mergeQuestions(current.questions, extractAdminQuestions(response).map(mapApiAdminQuestion)),
        }));
      })
      .catch((error) => {
        console.warn("Admin Question Bank API unavailable or access denied.", error);
      });
    return () => {
      cancelled = true;
    };
  }, [view, state.auth.isAuthenticated]);

  function createAttempt(mode: UserAttempt["mode"], skill: Skill | "both", selectedQuestions: Question[], part?: number): UserAttempt {
    return {
      id: crypto.randomUUID(),
      userId: state.user.id,
      mode,
      skill,
      part,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
      questionIds: selectedQuestions.map((question) => question.id),
      answers: [],
      totalQuestions: selectedQuestions.length,
      correctCount: 0,
      accuracy: 0,
    };
  }

  async function startPractice(part = selectedPart, count = 10, adaptive = false) {
    const skill: Skill = part <= 4 ? "listening" : "reading";
    try {
      const response = await startPracticeApi(part, count, adaptive);
      const backendQuestions = response.questions.map(mapApiQuestion);
      const backendAttempt = mapApiAttempt(response.attempt);
      setState({
        ...state,
        questions: mergeQuestions(state.questions, backendQuestions),
      });
      setActiveAttempt({ ...backendAttempt, skill, part });
      setCurrentIndex(0);
      setRevealedQuestionId(null);
      setView("practice");
      return;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 401)) {
        setAccessModal(apiErrorToDecision(error));
        return;
      }
      console.warn("Backend practice API unavailable, falling back to local demo.", error);
    }

    const featureGuard = adaptive ? checkPremiumFeature(state, state.user, "adaptive_learning") : undefined;
    if (featureGuard && !featureGuard.decision.success) {
      setState(featureGuard.state);
      setAccessModal(featureGuard.decision);
      return;
    }

    const limitGuard = checkDailyTestLimit(featureGuard?.state ?? state, state.user);
    if (!limitGuard.decision.success) {
      setState(limitGuard.state);
      setAccessModal(limitGuard.decision);
      return;
    }

    const selectedQuestions = adaptive
      ? generateAdaptivePractice({
          questions: limitGuard.state.questions,
          skill,
          part,
          questionCount: count,
          partStats: limitGuard.state.partStats,
          weaknesses: limitGuard.state.weaknesses,
          recentQuestionIds,
        })
      : generateStandardPractice(limitGuard.state.questions, skill, part, count);

    setState(limitGuard.state);
    setActiveAttempt(createAttempt("practice", skill, selectedQuestions, part));
    setCurrentIndex(0);
    setRevealedQuestionId(null);
    setView("practice");
  }

  async function startTest(mode: "mini_test" | "full_test" | "placement", testSetId?: number) {
    try {
      const response = await startTestApi(mode, testSetId);
      const backendQuestions = response.questions.map(mapApiQuestion);
      const backendAttempt = mapApiAttempt(response.attempt);
      setState({
        ...state,
        questions: mergeQuestions(state.questions, backendQuestions),
      });
      setActiveAttempt(backendAttempt);
      setCurrentIndex(0);
      setRevealedQuestionId(null);
      setView("practice");
      return;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 401)) {
        setAccessModal(apiErrorToDecision(error));
        return;
      }
      console.warn("Backend test API unavailable, falling back to local demo.", error);
    }

    const limitGuard = checkDailyTestLimit(state, state.user);
    if (!limitGuard.decision.success) {
      setState(limitGuard.state);
      setAccessModal(limitGuard.decision);
      return;
    }

    const selectedQuestions = generateTestQuestions(limitGuard.state.questions, mode);
    setState(limitGuard.state);
    setActiveAttempt(createAttempt(mode, "both", selectedQuestions));
    setCurrentIndex(0);
    setRevealedQuestionId(null);
    setView("practice");
  }

  function selectAnswer(question: Question, answer: Answer) {
    if (!activeAttempt) return;
    const nextAnswers = [
      ...activeAttempt.answers.filter((item) => item.questionId !== question.id),
      {
        questionId: question.id,
        selectedAnswerId: answer.id,
        isCorrect: answer.isCorrect,
        timeSpentSeconds: question.estimatedTimeSeconds,
        answeredAt: new Date().toISOString(),
      },
    ];
    setActiveAttempt({ ...activeAttempt, answers: nextAnswers });
  }

  function submitCurrentQuestion() {
    if (!activeAttempt) return;
    const questionId = activeAttempt.questionIds[currentIndex];
    setRevealedQuestionId(questionId);
  }

  function nextQuestion() {
    setRevealedQuestionId(null);
    setCurrentIndex((index) => Math.min(index + 1, (activeAttempt?.questionIds.length ?? 1) - 1));
  }

  async function finishAttempt() {
    if (!activeAttempt) return;
    try {
      const response = await submitAttemptApi(activeAttempt);
      const reviewQuestions = response.review?.map((item) => mapApiReviewQuestion(item.question)) ?? [];
      const submitted = {
        ...activeAttempt,
        ...mapApiSubmitResponse(response, activeAttempt.answers),
        lockedFeatures: response.locked_features?.map((feature) => ({
          feature: feature.feature as FeatureKey,
          message: feature.message,
        })),
      };
      setState({
        ...state,
        questions: reviewQuestions.length ? mergeQuestions(state.questions, reviewQuestions) : state.questions,
        attempts: [submitted, ...state.attempts.filter((attempt) => attempt.id !== submitted.id)],
      });
      getDashboardApi()
        .then((dashboardResponse) => setState((current) => applyDashboardToState(current, dashboardResponse)))
        .catch((error) => console.warn("Dashboard API unavailable after submit.", error));
      setActiveAttempt(null);
      setRevealedQuestionId(null);
      setView("progress");
      return;
    } catch (error) {
      console.warn("Backend submit API unavailable, falling back to local scoring.", error);
    }

    setState(submitAttempt(state, activeAttempt));
    setActiveAttempt(null);
    setRevealedQuestionId(null);
    setView("progress");
  }

  async function toggleBookmark(questionId: number) {
    const exists = state.bookmarks.some((bookmark) => bookmark.questionId === questionId);
    const nextBookmarks = exists
      ? state.bookmarks.filter((bookmark) => bookmark.questionId !== questionId)
      : [{ questionId, createdAt: new Date().toISOString() }, ...state.bookmarks];

    setState({ ...state, bookmarks: nextBookmarks });

    try {
      if (exists) {
        await deleteBookmarkApi(questionId);
      } else {
        await saveBookmarkApi(questionId);
      }
    } catch (error) {
      console.warn("Bookmark API unavailable, keeping local bookmark state.", error);
    }
  }

  async function saveVocabularyFromQuestion(question: Question, item: { word: string; meaning: string; level: string }) {
    const normalizedWord = item.word.trim().toLowerCase();
    const exists = state.vocabularyCollection.some((entry) => entry.word.toLowerCase() === normalizedWord);
    if (exists) return;

    const entry: VocabularyCollectionItem = {
      id: crypto.randomUUID(),
      userId: state.user.id,
      word: item.word.trim(),
      meaning: item.meaning.trim(),
      level: item.level,
      sourceQuestionId: question.id,
      part: question.part,
      topicId: question.topicId,
      createdAt: new Date().toISOString(),
      mastery: 0,
    };

    setState({ ...state, vocabularyCollection: [entry, ...state.vocabularyCollection] });

    try {
      const response = await saveVocabularyItemApi({
        word: item.word.trim(),
        meaning: item.meaning.trim(),
        level: item.level,
        questionId: question.id,
      });
      setState((current) => ({
        ...current,
        vocabularyCollection: current.vocabularyCollection.map((vocab) =>
          vocab.id === entry.id
            ? {
                ...vocab,
                id: String(response.item.id),
                createdAt: response.item.created_at,
              }
            : vocab,
        ),
      }));
    } catch (error) {
      console.warn("Vocabulary API unavailable, keeping local vocabulary item.", error);
    }
  }

  function checkFeature(featureKey: FeatureKey) {
    const result = checkPremiumFeature(state, state.user, featureKey);
    setState(result.state);
    if (!result.decision.success) setAccessModal(result.decision);
  }

  async function subscribe(planSlug: PlanSlug) {
    try {
      await subscribeApi(planSlug);
      const subscriptionResponse = await getSubscriptionApi();
      setRemoteSummary(mapSubscriptionSummary(subscriptionResponse));
      setAccessModal(null);
      setView("premium");
      return;
    } catch (error) {
      console.warn("Backend subscribe API unavailable, using local demo subscription.", error);
    }
    setState(subscribeUser(state, state.user, planSlug));
    setAccessModal(null);
    setView("premium");
  }

  function resetDemo() {
    clearApiToken();
    setRemoteSummary(null);
    setState(createInitialState());
    setActiveAttempt(null);
    setCurrentIndex(0);
    setRevealedQuestionId(null);
    setView("home");
  }

  async function cancelCurrentSubscription() {
    try {
      await cancelSubscriptionApi();
      const subscriptionResponse = await getSubscriptionApi();
      setRemoteSummary(mapSubscriptionSummary(subscriptionResponse));
      return;
    } catch (error) {
      console.warn("Backend cancel API unavailable, using local demo cancellation.", error);
    }
    setState(cancelSubscription(state, state.user));
  }

  async function updateAdminQuestion(question: Question) {
    try {
      const response = await updateAdminQuestionApi(question);
      const updated = mapApiAdminQuestion(response.question);
      setState((current) => ({
        ...current,
        questions: current.questions.map((item) => (item.id === updated.id ? updated : item)),
      }));
      return;
    } catch (error) {
      console.warn("Admin update API unavailable, applying local update.", error);
    }
    setState({
      ...state,
      questions: state.questions.map((item) => (item.id === question.id ? question : item)),
    });
  }

  async function addAdminQuestion(question: Question) {
    try {
      const response = await createAdminQuestionApi(question);
      const created = mapApiAdminQuestion(response.question);
      setState((current) => ({
        ...current,
        questions: [created, ...current.questions.filter((item) => item.id !== created.id)],
      }));
      setSelectedPart(created.part);
      return;
    } catch (error) {
      console.warn("Admin create API unavailable, applying local create.", error);
    }
    setState({
      ...state,
      questions: [question, ...state.questions],
    });
  }

  async function completeAuth(payload: { mode: "login" | "register"; name?: string; email: string; password: string }) {
    try {
      const response =
        payload.mode === "register"
          ? await registerApi(sanitizePlainText(payload.name ?? state.user.name, 80), payload.email, payload.password)
          : await loginApi(payload.email, payload.password);
      setApiToken(response.token);
      const apiUser = mapApiUser(response.user);
      const subscriptionResponse = await getSubscriptionApi().catch(() => null);
      if (subscriptionResponse) setRemoteSummary(mapSubscriptionSummary(subscriptionResponse));
      const dashboardResponse = await getDashboardApi().catch(() => null);
      const toolsResponse = await getLearningToolsApi().catch(() => null);
      const plansResponse = await getPlansApi().catch(() => null);
      const metadataResponse = await getMetadataApi().catch(() => null);
      const testSetsResponse = await getTestSetsApi().catch(() => null);
      if (testSetsResponse) setTestSets(testSetsResponse.test_sets);
      setState((current) => ({
        ...(metadataResponse ? applyMetadataToState(plansResponse ? applyPlansToState(dashboardResponse ? applyDashboardToState(current, dashboardResponse) : current, plansResponse) : dashboardResponse ? applyDashboardToState(current, dashboardResponse) : current, metadataResponse) : plansResponse ? applyPlansToState(dashboardResponse ? applyDashboardToState(current, dashboardResponse) : current, plansResponse) : dashboardResponse ? applyDashboardToState(current, dashboardResponse) : current),
        ...(toolsResponse ? toolsResponse : {}),
        auth: {
          ...current.auth,
          isAuthenticated: true,
          onboardingCompleted: apiUser.role === "admin" ? true : current.auth.onboardingCompleted,
        },
        user: {
          ...current.user,
          ...apiUser,
        },
      }));
      return;
    } catch (error) {
      console.warn("Backend auth API unavailable, using local demo auth.", error);
    }

    setState({
      ...state,
      auth: {
        ...state.auth,
        isAuthenticated: true,
      },
      user: {
        ...state.user,
        name: sanitizePlainText(payload.name ?? state.user.name, 80) || state.user.name,
        email: normalizeEmail(payload.email) || state.user.email,
        role: normalizeEmail(payload.email) === "admin@example.com" ? "admin" : state.user.role ?? "user",
      },
    });
  }

  async function logout() {
    try {
      await logoutApi();
    } catch (error) {
      console.warn("Backend logout API unavailable, clearing local session.", error);
    }
    resetDemo();
  }

  function completeOnboarding(targetScore: number, startPlacementAfter = false) {
    const nextState: AppState = {
      ...state,
      auth: {
        ...state.auth,
        onboardingCompleted: true,
      },
      user: {
        ...state.user,
        targetScore,
      },
    };
    setState(nextState);
    if (startPlacementAfter) {
      const limitGuard = checkDailyTestLimit(nextState, nextState.user);
      if (!limitGuard.decision.success) {
        setState(limitGuard.state);
        setAccessModal(limitGuard.decision);
        return;
      }
      const selectedQuestions = generateTestQuestions(limitGuard.state.questions, "placement");
      setState(limitGuard.state);
      setActiveAttempt(createAttempt("placement", "both", selectedQuestions));
      setCurrentIndex(0);
      setRevealedQuestionId(null);
      setView("practice");
    } else {
      setView("home");
    }
  }

  if (!state.auth.isAuthenticated) {
    return <AuthScreen t={t} language={language} onLanguageChange={setLanguage} onSubmit={completeAuth} />;
  }

  if (!state.auth.onboardingCompleted && !isAdmin) {
    return (
      <OnboardingScreen
        t={t}
        language={language}
        currentTarget={state.user.targetScore}
        onLanguageChange={setLanguage}
        onComplete={completeOnboarding}
      />
    );
  }

  return (
    <AppLayout view={view} onViewChange={setView} summary={summary} language={language} t={t} onLanguageChange={setLanguage} onLogout={logout}>
      {view === "home" && (
        <HomeDashboard
          t={t}
          state={state}
          summary={summary}
          estimatedTotal={estimatedTotal}
          latestAttempt={latestAttempt}
          selectedPart={selectedPart}
          recommendations={recommendations}
          onPartChange={setSelectedPart}
          onStartPractice={startPractice}
          onPremiumFeature={checkFeature}
          onUpgrade={() => setView("premium")}
        />
      )}

      {view === "practice" && activeAttempt && (
        <PracticeScreen
          t={t}
          attempt={activeAttempt}
          questions={state.questions}
          currentIndex={currentIndex}
          revealedQuestionId={revealedQuestionId}
          bookmarks={state.bookmarks.map((bookmark) => bookmark.questionId)}
          vocabularyCollection={state.vocabularyCollection}
          onIndexChange={(index) => {
            setCurrentIndex(index);
            setRevealedQuestionId(null);
          }}
          onSelectAnswer={selectAnswer}
          onReveal={submitCurrentQuestion}
          onNext={nextQuestion}
          onFinish={finishAttempt}
          onBookmark={toggleBookmark}
          onSaveVocabulary={saveVocabularyFromQuestion}
        />
      )}

      {view === "practice" && !activeAttempt && (
        <PracticeLanding t={t} selectedPart={selectedPart} onPartChange={setSelectedPart} onStartPractice={startPractice} />
      )}

      {view === "tests" && <TestsScreen t={t} state={state} summary={summary} testSets={testSets} onStartTest={startTest} onUpgrade={() => setView("premium")} />}

      {view === "ai" && <AICoachScreen t={t} summary={summary} onFeature={checkFeature} onUpgrade={() => setView("premium")} />}

      {view === "vocabulary" && <VocabularyScreen t={t} collection={state.vocabularyCollection} />}

      {view === "progress" && <ResultsScreen t={t} state={state} summary={summary} onUpgrade={() => setView("premium")} onToggleBookmark={toggleBookmark} />}

      {view === "premium" && (
        <PremiumScreen
          t={t}
          state={state}
          summary={summary}
          onSubscribe={subscribe}
          onCancel={cancelCurrentSubscription}
          onReset={resetDemo}
        />
      )}

      {view === "admin" && (
        <AdminQuestionBankPage
          t={t}
          state={state}
          testSets={testSets}
          onTestSetsChange={setTestSets}
          onSelectPart={setSelectedPart}
          onUpdateQuestion={updateAdminQuestion}
          onAddQuestion={addAdminQuestion}
          onMergeQuestions={(questions) => setState((current) => ({ ...current, questions: mergeQuestions(current.questions, questions) }))}
        />
      )}

      <UpgradePremiumModal decision={accessModal} state={state} t={t} onClose={() => setAccessModal(null)} onSubscribe={subscribe} />
    </AppLayout>
  );
}

function AuthScreen({
  t,
  language,
  onLanguageChange,
  onSubmit,
}: {
  t: Translation;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onSubmit: (payload: { mode: "login" | "register"; name?: string; email: string; password: string }) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("Nguyễn Văn A");
  const [email, setEmail] = useState("learner@example.com");
  const [password, setPassword] = useState("Password1");
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <main className="auth-shell">
      <section className="auth-visual glass-card">
        <div className="orb-logo auth-logo" />
        <span className="eyebrow">TOEIC AI Lab</span>
        <h1>{t.auth.welcome}</h1>
        <p>{t.auth.subtitle}</p>
        <div className="auth-proof-grid">
          <MetricCard label="Listening" value="495" meta="Score ceiling" tone="sky" />
          <MetricCard label="Reading" value="495" meta="Score ceiling" tone="indigo" />
        </div>
      </section>

      <section className="auth-card glass-card">
        <div className="auth-card-top">
          <div className="auth-tabs">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
              {t.auth.login}
            </button>
            <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
              {t.auth.register}
            </button>
          </div>
          <div className="language-toggle" aria-label="Language selector">
            <button className={language === "vi" ? "active" : ""} onClick={() => onLanguageChange("vi")}>
              VI
            </button>
            <button className={language === "en" ? "active" : ""} onClick={() => onLanguageChange("en")}>
              EN
            </button>
          </div>
        </div>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            const validation = validateAuthPayload({ name, email, password }, mode);
            if (!validation.ok) {
              setFormError(validation.message ?? "Invalid credentials.");
              return;
            }

            const rateLimit = checkClientRateLimit(`auth:${mode}:${normalizeEmail(email)}`, mode === "login" ? 5 : 3, 60_000);
            if (!rateLimit.ok) {
              setFormError(rateLimit.message ?? "Too many attempts.");
              return;
            }

            setFormError(null);
            onSubmit({ mode, name: mode === "register" ? sanitizePlainText(name, 80) : undefined, email: normalizeEmail(email), password });
          }}
        >
          {mode === "register" && (
            <label>
              <span>{t.auth.name}</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          )}
          <label>
            <span>{t.auth.email}</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            <span>{t.auth.password}</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
          </label>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <GradientButton>{t.auth.continue}</GradientButton>
          <p>{t.auth.demoHint}</p>
        </form>
      </section>
    </main>
  );
}

function OnboardingScreen({
  t,
  language,
  currentTarget,
  onLanguageChange,
  onComplete,
}: {
  t: Translation;
  language: Language;
  currentTarget: number;
  onLanguageChange: (language: Language) => void;
  onComplete: (targetScore: number, startPlacementAfter?: boolean) => void;
}) {
  const [targetScore, setTargetScore] = useState(currentTarget);
  const presets = [450, 550, 650, 750, 850, 900];

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card glass-card">
        <div className="onboarding-top">
          <span className="eyebrow">Onboarding</span>
          <div className="language-toggle" aria-label="Language selector">
            <button className={language === "vi" ? "active" : ""} onClick={() => onLanguageChange("vi")}>
              VI
            </button>
            <button className={language === "en" ? "active" : ""} onClick={() => onLanguageChange("en")}>
              EN
            </button>
          </div>
        </div>
        <h1>{t.auth.onboardingTitle}</h1>
        <p>{t.auth.onboardingSubtitle}</p>
        <div className="target-score-panel">
          <label>
            <span>{t.auth.targetScore}</span>
            <input
              type="number"
              min={10}
              max={990}
              step={5}
              value={targetScore}
              onChange={(event) => setTargetScore(Number(event.target.value))}
            />
          </label>
          <div className="target-presets">
            {presets.map((score) => (
              <button key={score} className={targetScore === score ? "active" : ""} onClick={() => setTargetScore(score)}>
                {score}
              </button>
            ))}
          </div>
        </div>
        <p className="placement-note">{t.auth.placementNote}</p>
        <div className="onboarding-actions">
          <GradientButton onClick={() => onComplete(targetScore, true)}>
            {t.auth.startPlacement} <ArrowRight size={16} />
          </GradientButton>
          <GhostButton onClick={() => onComplete(targetScore, false)}>{t.auth.skipToDashboard}</GhostButton>
        </div>
      </section>
    </main>
  );
}

function HomeDashboard({
  t,
  state,
  summary,
  estimatedTotal,
  latestAttempt,
  selectedPart,
  recommendations,
  onPartChange,
  onStartPractice,
  onPremiumFeature,
  onUpgrade,
}: {
  t: Translation;
  state: AppState;
  summary: ReturnType<typeof getSubscriptionSummary>;
  estimatedTotal: number;
  latestAttempt?: UserAttempt;
  selectedPart: number;
  recommendations: ApiRecommendation[];
  onPartChange: (part: number) => void;
  onStartPractice: (part: number, count: number, adaptive?: boolean) => void;
  onPremiumFeature: (feature: FeatureKey) => void;
  onUpgrade: () => void;
}) {
  return (
    <div className="dashboard-grid">
      <ScoreHeroCard t={t} state={state} estimatedTotal={estimatedTotal} latestAttempt={latestAttempt} />
      <StudyStreakCard t={t} totalAnswered={state.skillStats.listening.totalAnswered + state.skillStats.reading.totalAnswered} />
      <SkillsBreakdownCard t={t} state={state} selectedPart={selectedPart} onPartChange={onPartChange} />
      <WeakAreasCard t={t} state={state} summary={summary} onPremiumFeature={onPremiumFeature} onUpgrade={onUpgrade} />
      <RecommendedPracticeCard t={t} selectedPart={selectedPart} recommendations={recommendations} canUseAdaptive={summary.features.adaptive_learning} onStartPractice={onStartPractice} />
      <AICoachCard t={t} summary={summary} onPremiumFeature={onPremiumFeature} onUpgrade={onUpgrade} />
      <RecentTestsTable t={t} attempts={state.attempts} />
      <PremiumCard t={t} onUpgrade={onUpgrade} />
    </div>
  );
}

function ScoreHeroCard({
  t,
  state,
  estimatedTotal,
  latestAttempt,
}: {
  t: Translation;
  state: AppState;
  estimatedTotal: number;
  latestAttempt?: UserAttempt;
}) {
  const progress = Math.min(100, Math.round((estimatedTotal / 990) * 100));
  return (
    <GlassCard className="score-hero-card">
      <div>
        <span className="eyebrow">{t.dashboard.scoreTitle}</span>
        <div className="score-line">
          <strong className="score-number">{estimatedTotal}</strong>
          <span>/990</span>
        </div>
        <p>{t.dashboard.estimatedScore}</p>
        <div className="progress-track">
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="hero-badges">
          <span>{t.dashboard.improving}</span>
          <span className="gain">+120</span>
          <small>{t.dashboard.fromLastTest}</small>
        </div>
      </div>
      <div className="score-orbit" aria-label="Score progress chart">
        <div className="orbit-ring">
          <svg viewBox="0 0 120 60" role="img" aria-label="Mini score trend">
            <path d="M5 48 C20 20 30 52 45 28 C60 4 70 46 84 22 C96 2 106 20 116 8" />
          </svg>
        </div>
      </div>
      <div className="section-scores">
        <SectionScore icon={Headphones} label={t.common.listening} value={latestAttempt?.estimatedListeningScore ?? state.skillStats.listening.estimatedScore ?? 250} tone="blue" />
        <SectionScore icon={BookIcon} label={t.common.reading} value={latestAttempt?.estimatedReadingScore ?? state.skillStats.reading.estimatedScore ?? 250} tone="violet" />
      </div>
    </GlassCard>
  );
}

function BookIcon({ size = 22 }: { size?: number }) {
  return <BookOpen size={size} />;
}

function SectionScore({ icon: Icon, label, value, tone }: { icon: ComponentType<{ size?: number }>; label: string; value: number; tone: string }) {
  return (
    <div className={`section-score ${tone}`}>
      <Icon size={24} />
      <div>
        <span>{label}</span>
        <strong>
          {value} <small>/495</small>
        </strong>
        <div className="mini-track">
          <i style={{ width: `${Math.min(100, (value / 495) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function StudyStreakCard({ t, totalAnswered }: { t: Translation; totalAnswered: number }) {
  return (
    <GlassCard className="streak-card">
      <div className="card-heading">
        <h2>{t.dashboard.streak}</h2>
        <Sparkles size={18} />
      </div>
      <div className="streak-number">
        <strong>{totalAnswered > 0 ? 12 : 0}</strong>
        <span>{t.dashboard.days}</span>
      </div>
      <div className="week-row" aria-label="Weekly streak">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => (
          <div key={day}>
            <span className={index < 6 && totalAnswered > 0 ? "day-dot done" : "day-dot"}>{index < 6 && totalAnswered > 0 ? <Check size={13} /> : ""}</span>
            <small>{day}</small>
          </div>
        ))}
      </div>
      <p>{t.dashboard.keepGoing}</p>
    </GlassCard>
  );
}

function SkillsBreakdownCard({
  t,
  state,
  selectedPart,
  onPartChange,
}: {
  t: Translation;
  state: AppState;
  selectedPart: number;
  onPartChange: (part: number) => void;
}) {
  return (
    <GlassCard className="skills-card">
      <div className="card-heading">
        <h2>{t.dashboard.skillsBreakdown}</h2>
        <span>{t.common.part} 1-7</span>
      </div>
      <div className="skill-bars">
        {[1, 2, 3, 4, 5, 6, 7].map((part) => {
          const skill: Skill = part <= 4 ? "listening" : "reading";
          const stat = state.partStats[partKey(skill, part)] ?? { accuracy: 0, levelScore: 50, totalAnswered: 0, totalCorrect: 0 };
          const value = stat.accuracy || Math.max(50, Math.round(stat.levelScore));
          return (
            <button key={part} className={selectedPart === part ? "skill-row active" : "skill-row"} onClick={() => onPartChange(part)}>
              <span>Part {part}</span>
              <div className="skill-track">
                <i style={{ width: `${value}%` }} />
              </div>
              <strong>{value}%</strong>
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
}

function WeakAreasCard({
  t,
  state,
  summary,
  onPremiumFeature,
  onUpgrade,
}: {
  t: Translation;
  state: AppState;
  summary: ReturnType<typeof getSubscriptionSummary>;
  onPremiumFeature: (feature: FeatureKey) => void;
  onUpgrade: () => void;
}) {
  const weakAreas =
    state.weaknesses.length > 0
      ? state.weaknesses.slice(0, 3).map((weakness) => ({ label: weaknessLabel(weakness), value: weakness.accuracy }))
      : [
          { label: "Part 3 - Conversations", value: 65 },
          { label: "Part 7 - Reading Comprehension", value: 62 },
          { label: "Vocabulary - Business", value: 60 },
        ];

  return (
    <GlassCard className="weak-card locked-parent">
      <div className="card-heading">
        <h2>{t.dashboard.weakAreas}</h2>
        <span>{t.dashboard.weakHint}</span>
      </div>
      <div className={summary.features.weakness_analysis ? "weak-content" : "weak-content blurred"}>
        {weakAreas.map((item) => (
          <div className="weak-progress" key={item.label}>
            <div>
              <span>{item.label}</span>
              <strong>{item.value}%</strong>
            </div>
            <div className="danger-track">
              <i style={{ width: `${item.value}%` }} />
            </div>
          </div>
        ))}
      </div>
      {!summary.features.weakness_analysis && (
        <LockedFeatureOverlay
          title="Unlock weakness analysis"
          description={t.locked.weaknessDescription}
          upgradeLabel={t.common.upgrade}
          maybeLaterLabel={t.common.maybeLater}
          onUpgrade={onUpgrade}
          onLater={() => onPremiumFeature("weakness_analysis")}
        />
      )}
    </GlassCard>
  );
}

function RecommendedPracticeCard({
  t,
  selectedPart,
  recommendations,
  canUseAdaptive,
  onStartPractice,
}: {
  t: Translation;
  selectedPart: number;
  recommendations: ApiRecommendation[];
  canUseAdaptive: boolean;
  onStartPractice: (part: number, count: number, adaptive?: boolean) => void;
}) {
  const primary = recommendations[0];
  const fallbackTitle = `Part ${selectedPart} - ${partNames[selectedPart]}`;
  const primaryPart = primary?.part ?? selectedPart;
  const primaryCount = primary?.question_count ?? 10;
  const difficultyLabel = primary
    ? primary.severity_score >= 70
      ? "Hard"
      : primary.severity_score >= 45
        ? "Medium"
        : "Easy"
    : "Medium";
  const shouldUseAdaptive = Boolean(primary && canUseAdaptive);

  return (
    <GlassCard className="recommend-card">
      <div className="card-heading">
        <h2>{t.dashboard.recommended}</h2>
        <span>{recommendations.length ? "API ready" : t.dashboard.aiReady}</span>
      </div>
      <div className="recommend-box">
        <strong>{primary?.title ?? fallbackTitle}</strong>
        <p>{primary ? primary.reason : `20 ${t.common.questions} · ${t.dashboard.calibrated}`}</p>
        <span className={`difficulty ${difficultyLabel.toLowerCase()}`}>{difficultyLabel}</span>
        <GradientButton onClick={() => onStartPractice(primaryPart, primaryCount, shouldUseAdaptive)}>
          {t.common.startPractice} <ArrowRight size={16} />
        </GradientButton>
      </div>
      <div className="recommendation-stack">
        {(recommendations.length ? recommendations.slice(1, 4) : [{ title: "Vocabulary - Email", part: 5, question_count: 10, reason: "Build TOEIC business vocabulary." }]).map((item) => (
          <button className="compact-row" key={`${item.title}-${item.part}`} onClick={() => onStartPractice(item.part, item.question_count, Boolean(canUseAdaptive && recommendations.length))}>
            <span>
              <strong>{item.title}</strong>
              <small>Part {item.part} · {item.question_count} questions</small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </GlassCard>
  );
}

function AICoachCard({
  t,
  summary,
  onPremiumFeature,
  onUpgrade,
}: {
  t: Translation;
  summary: ReturnType<typeof getSubscriptionSummary>;
  onPremiumFeature: (feature: FeatureKey) => void;
  onUpgrade: () => void;
}) {
  return (
    <GlassCard className="ai-card locked-parent">
      <div className="card-heading">
        <h2>{t.dashboard.aiCoach}</h2>
        <span>NEW</span>
      </div>
      <div className={summary.features.ai_explanation ? "ai-content" : "ai-content blurred"}>
        <div>
          <p>{t.dashboard.aiGreeting}</p>
          <div className="ai-actions">
            <GhostButton onClick={() => onPremiumFeature("ai_explanation")}>{t.dashboard.chatAi}</GhostButton>
            <GhostButton onClick={() => onPremiumFeature("ai_explanation")}>{t.dashboard.explainQuestion}</GhostButton>
            <GhostButton onClick={() => onPremiumFeature("recommendations")}>{t.dashboard.recommendPlan}</GhostButton>
          </div>
        </div>
        <div className="robot-orb">
          <Bot size={46} />
        </div>
      </div>
      {!summary.features.ai_explanation && (
        <LockedFeatureOverlay
          title={t.locked.aiTitle}
          description={t.locked.aiDescription}
          upgradeLabel={t.common.upgrade}
          maybeLaterLabel={t.common.maybeLater}
          onUpgrade={onUpgrade}
          onLater={() => onPremiumFeature("ai_explanation")}
        />
      )}
    </GlassCard>
  );
}

function RecentTestsTable({ t, attempts }: { t: Translation; attempts: UserAttempt[] }) {
  const rows = attempts.length
    ? attempts.slice(0, 4)
    : [
        { id: "mock-1", mode: "full_test", estimatedTotalScore: 750, estimatedListeningScore: 380, estimatedReadingScore: 370, submittedAt: new Date().toISOString() },
        { id: "mock-2", mode: "mini_test", estimatedTotalScore: 640, estimatedListeningScore: 0, estimatedReadingScore: 320, submittedAt: new Date().toISOString() },
      ];

  return (
    <GlassCard className="recent-card">
      <div className="card-heading">
        <h2>{t.dashboard.recentTests}</h2>
        <GhostButton>{t.dashboard.viewAll}</GhostButton>
      </div>
      <div className="recent-table">
        <div className="recent-head">
          <span>{t.dashboard.testType}</span>
          <span>{t.dashboard.score}</span>
          <span>{t.common.listening}</span>
          <span>{t.common.reading}</span>
          <span>{t.dashboard.date}</span>
          <span />
        </div>
        {rows.map((row) => (
          <div className="recent-row" key={row.id}>
            <span>{row.mode === "full_test" ? "Full Test" : "Mini Test"}</span>
            <strong>{row.estimatedTotalScore ?? "-"}</strong>
            <span>{row.estimatedListeningScore || "-"}</span>
            <span>{row.estimatedReadingScore || "-"}</span>
            <span>{row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : "-"}</span>
            <button aria-label="Open result">
              <ChevronRight size={16} />
            </button>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function PremiumCard({ t, onUpgrade }: { t: Translation; onUpgrade: () => void }) {
  return (
    <GlassCard className="premium-card">
      <span className="eyebrow">{t.dashboard.unlockPotential}</span>
      <h2>{t.dashboard.goPremium}</h2>
      <ul>
        {t.dashboard.premiumBenefits.map((item) => (
          <li key={item}>
            <Check size={14} /> {item}
          </li>
        ))}
      </ul>
      <GradientButton onClick={onUpgrade}>
        {t.common.upgrade} <ArrowRight size={16} />
      </GradientButton>
    </GlassCard>
  );
}

function PracticeLanding({
  t,
  selectedPart,
  onPartChange,
  onStartPractice,
}: {
  t: Translation;
  selectedPart: number;
  onPartChange: (part: number) => void;
  onStartPractice: (part: number, count: number, adaptive?: boolean) => void;
}) {
  return (
    <div className="practice-landing">
      <GlassCard className="page-hero">
        <span className="eyebrow">{t.practice.studio}</span>
        <h1>{t.practice.landingTitle}</h1>
        <p>{t.practice.landingDescription}</p>
      </GlassCard>
      <div className="part-select-grid">
        {[1, 2, 3, 4, 5, 6, 7].map((part) => (
          <button key={part} className={selectedPart === part ? "part-card selected" : "part-card"} onClick={() => onPartChange(part)}>
            <span>{t.common.part} {part}</span>
            <strong>{partNames[part]}</strong>
            <small>{part <= 4 ? t.common.listening : t.common.reading}</small>
          </button>
        ))}
      </div>
      <div className="landing-actions">
        <GradientButton onClick={() => onStartPractice(selectedPart, 10, false)}>{t.common.startStandardPractice}</GradientButton>
        <GhostButton onClick={() => onStartPractice(selectedPart, 10, true)}>{t.common.startAdaptivePractice}</GhostButton>
      </div>
    </div>
  );
}

function PracticeScreen({
  t,
  attempt,
  questions,
  currentIndex,
  revealedQuestionId,
  bookmarks,
  vocabularyCollection,
  onIndexChange,
  onSelectAnswer,
  onReveal,
  onNext,
  onFinish,
  onBookmark,
  onSaveVocabulary,
}: {
  t: Translation;
  attempt: UserAttempt;
  questions: Question[];
  currentIndex: number;
  revealedQuestionId: number | null;
  bookmarks: number[];
  vocabularyCollection: VocabularyCollectionItem[];
  onIndexChange: (index: number) => void;
  onSelectAnswer: (question: Question, answer: Answer) => void;
  onReveal: () => void;
  onNext: () => void;
  onFinish: () => void;
  onBookmark: (questionId: number) => void;
  onSaveVocabulary: (question: Question, item: { word: string; meaning: string; level: string }) => void;
}) {
  const question = questions.find((item) => item.id === attempt.questionIds[currentIndex]);
  if (!question) return null;
  const group = question.questionGroupId ? questionGroups.find((item) => item.id === question.questionGroupId) : undefined;
  const selected = attempt.answers.find((answer) => answer.questionId === question.id);
  const revealed = revealedQuestionId === question.id;
  const isReadingPassage = question.skill === "reading" && (question.passageText || group?.passageText);

  return (
    <div className="practice-screen">
      <GlassCard className="practice-header">
        <div>
          <span className="eyebrow">{t.common.part} {question.part} · {partNames[question.part]}</span>
          <h1>{question.skill === "listening" ? t.practice.listeningPractice : t.practice.readingPractice}</h1>
        </div>
        <div className="practice-meta">
          <span>{question.difficultyLevel}</span>
          <span>
            {currentIndex + 1}/{attempt.questionIds.length}
          </span>
          <span>
            <Clock3 size={14} /> {question.estimatedTimeSeconds}s
          </span>
        </div>
        <div className="progress-track">
          <i style={{ width: `${((currentIndex + 1) / attempt.questionIds.length) * 100}%` }} />
        </div>
      </GlassCard>

      <div className={isReadingPassage ? "practice-two-col" : "practice-one-col"}>
        {isReadingPassage && (
          <GlassCard className="passage-panel">
            <h2>{t.practice.passage}</h2>
            <p>{question.passageText ?? group?.passageText}</p>
          </GlassCard>
        )}
        <PracticeQuestionCard
          question={question}
          group={group}
          selectedAnswerId={selected?.selectedAnswerId}
          revealed={revealed}
          isBookmarked={bookmarks.includes(question.id)}
          showStudyTools={attempt.mode === "practice"}
          savedVocabularyWords={vocabularyCollection.map((item) => item.word.toLowerCase())}
          onSelectAnswer={onSelectAnswer}
          onBookmark={onBookmark}
          onSaveVocabulary={onSaveVocabulary}
          t={t}
        />
      </div>

      <div className="question-nav-modern">
        {attempt.questionIds.map((id, index) => (
          <button key={id} className={index === currentIndex ? "active" : ""} onClick={() => onIndexChange(index)}>
            {index + 1}
          </button>
        ))}
      </div>

      <div className="practice-actions">
        <GhostButton onClick={() => onBookmark(question.id)}>
          <Bookmark size={16} /> {t.common.bookmark}
        </GhostButton>
        <GhostButton>
          <Flag size={16} /> {t.common.reportIssue}
        </GhostButton>
        {!revealed ? (
          <GradientButton onClick={onReveal} disabled={!selected}>
            {t.common.submit}
          </GradientButton>
        ) : currentIndex < attempt.questionIds.length - 1 ? (
          <GradientButton onClick={onNext}>{t.common.nextQuestion}</GradientButton>
        ) : (
          <GradientButton onClick={onFinish}>{t.common.finishAttempt}</GradientButton>
        )}
      </div>
    </div>
  );
}

function PracticeQuestionCard({
  t,
  question,
  group,
  selectedAnswerId,
  revealed,
  isBookmarked,
  showStudyTools,
  savedVocabularyWords,
  onSelectAnswer,
  onBookmark,
  onSaveVocabulary,
}: {
  t: Translation;
  question: Question;
  group?: (typeof questionGroups)[number];
  selectedAnswerId?: number;
  revealed: boolean;
  isBookmarked: boolean;
  showStudyTools: boolean;
  savedVocabularyWords: string[];
  onSelectAnswer: (question: Question, answer: Answer) => void;
  onBookmark: (questionId: number) => void;
  onSaveVocabulary: (question: Question, item: { word: string; meaning: string; level: string }) => void;
}) {
  const [formulaOpen, setFormulaOpen] = useState(false);
  const options = ((question as Question & { answers?: Answer[] }).answers ?? answers.filter((answer) => answer.questionId === question.id)).sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
  const selected = options.find((answer) => answer.id === selectedAnswerId);
  const formula = getReadingFormula(question);
  const vocabularyItems = getVocabularyHints(question, group);

  useEffect(() => {
    setFormulaOpen(false);
  }, [question.id]);

  return (
    <GlassCard className="question-panel">
      <div className="question-title-row">
        <div>
          <span className="eyebrow">{question.questionType.replace(/_/g, " ")}</span>
          <h2>{question.questionText}</h2>
        </div>
        <button className="round-action" onClick={() => onBookmark(question.id)} aria-label="Bookmark question">
          <Bookmark size={18} fill={isBookmarked ? "currentColor" : "none"} />
        </button>
      </div>

      {question.imageUrl && <img className="question-image-modern" src={question.imageUrl} alt="TOEIC prompt" />}
      {(question.audioUrl || group?.audioUrl) && <AudioPlayer src={question.audioUrl ?? group?.audioUrl ?? ""} />}
      {!question.passageText && !group?.passageText && question.skill === "reading" && <p className="inline-prompt">{question.questionText}</p>}

      {showStudyTools && question.skill === "reading" && (
        <div className="study-tools-panel">
          <div className="study-tools-heading">
            <div>
              <span>Practice tools</span>
              <strong>Tu vung & cong thuc</strong>
            </div>
            {formula && (
              <GhostButton className="compact-tool-button" onClick={() => setFormulaOpen((open) => !open)}>
                <Eye size={15} /> {formulaOpen ? "An cong thuc" : "Hien thi cong thuc"}
              </GhostButton>
            )}
          </div>

          {vocabularyItems.length > 0 && (
            <div className="vocab-chip-grid">
              {vocabularyItems.map((item) => {
                const saved = savedVocabularyWords.includes(item.word.toLowerCase());
                return (
                  <button
                    key={item.word}
                    className={saved ? "vocab-save-chip saved" : "vocab-save-chip"}
                    onClick={() => onSaveVocabulary(question, item)}
                    disabled={saved}
                  >
                    <span>{item.word}</span>
                    <small>{saved ? "Da luu" : item.meaning}</small>
                  </button>
                );
              })}
            </div>
          )}

          {formula && formulaOpen && (
            <div className="formula-card">
              <span>{formula.title}</span>
              <strong>{formula.pattern}</strong>
              <p>{formula.example}</p>
              <small>{formula.tip}</small>
            </div>
          )}
        </div>
      )}

      <div className="answer-options">
        {options.map((answer) => (
          <AnswerOption
            key={answer.id}
            answer={answer}
            selected={selectedAnswerId === answer.id}
            revealed={revealed}
            onClick={() => onSelectAnswer(question, answer)}
          />
        ))}
      </div>

      {revealed && (
        <div className="explanation-panel">
          <strong>{selected?.isCorrect ? t.common.correctAnswer : t.common.reviewAnswer}</strong>
          <p>{question.explanation}</p>
          {(question.transcript || group?.transcript) && (
            <details open>
              <summary>{t.common.transcript}</summary>
              <p>{question.transcript ?? group?.transcript}</p>
            </details>
          )}
        </div>
      )}
    </GlassCard>
  );
}

function AnswerOption({
  answer,
  selected,
  revealed,
  onClick,
}: {
  answer: Answer;
  selected: boolean;
  revealed: boolean;
  onClick: () => void;
}) {
  const stateClass = revealed && answer.isCorrect ? "correct" : revealed && selected && !answer.isCorrect ? "wrong" : selected ? "selected" : "";
  return (
    <button className={`answer-option ${stateClass}`} onClick={onClick} disabled={revealed}>
      <span>{String.fromCharCode(64 + answer.displayOrder)}</span>
      <strong>{answer.answerText}</strong>
      {revealed && answer.isCorrect && <CheckCircle2 size={18} />}
      {revealed && selected && !answer.isCorrect && <XCircle size={18} />}
      {!revealed && selected && <Check size={18} />}
    </button>
  );
}

function AudioPlayer({ src }: { src: string }) {
  return (
    <div className="audio-player">
      <button aria-label="Play audio">
        <Play size={20} fill="currentColor" />
      </button>
      <div>
        <div className="audio-track">
          <i />
        </div>
        <audio controls src={src} />
      </div>
      <button aria-label="Replay 5 seconds">
        <RotateCcw size={18} />
      </button>
      <Volume2 size={18} />
    </div>
  );
}

function getVocabularyHints(question: Question, group?: (typeof questionGroups)[number]) {
  if (vocabularyHints[question.id]) return vocabularyHints[question.id];

  const sourceText = [question.questionText, question.passageText, group?.passageText]
    .filter(Boolean)
    .join(" ")
    .replace(/[^\w\s-]/g, " ");

  return sourceText
    .split(/\s+/)
    .filter((word) => word.length >= 7)
    .slice(0, 3)
    .map((word) => ({
      word,
      meaning: "them vao bo suu tap",
      level: topics.find((topic) => topic.id === question.topicId)?.name ?? "TOEIC",
    }));
}

function getReadingFormula(question: Question) {
  if (question.skill !== "reading") return undefined;
  if (question.grammarPointId && grammarFormulaHints[question.grammarPointId]) return grammarFormulaHints[question.grammarPointId];
  if (question.part === 7) {
    return {
      title: "Reading evidence",
      pattern: "Question keyword -> scan passage -> match paraphrase -> eliminate distractors",
      example: "bring to the registration desk -> confirmation email",
      tip: "Part 7 thuong bay bang tu dong nghia, khong chi copy dung mot cum tu.",
    };
  }
  if (question.part === 6) {
    return {
      title: "Text completion",
      pattern: "Sentence grammar + passage context + connector logic",
      example: "Employees should submit their weekly plans.",
      tip: "Doc cau truoc/sau vi Part 6 hay can ngu canh hon Part 5.",
    };
  }
  return undefined;
}

function TestsScreen({
  t,
  state,
  summary,
  testSets,
  onStartTest,
  onUpgrade,
}: {
  t: Translation;
  state: AppState;
  summary: ReturnType<typeof getSubscriptionSummary>;
  testSets: ApiTestSet[];
  onStartTest: (mode: "mini_test" | "full_test" | "placement", testSetId?: number) => void;
  onUpgrade: () => void;
}) {
  const remoteTests = testSets.map((testSet) => ({
    id: testSet.id,
    title: testSet.title,
    type: (testSet.type === "mini" ? "mini_test" : testSet.type === "full" ? "full_test" : "placement") as "mini_test" | "full_test" | "placement",
    questions: testSet.listening_question_count + testSet.reading_question_count,
    time: `${testSet.duration_minutes} min`,
    difficulty: testSet.difficulty_level,
    score: testSet.estimated_score_min && testSet.estimated_score_max ? `${testSet.estimated_score_min}-${testSet.estimated_score_max}` : t.tests.estimated,
    description: testSet.description,
  }));
  const tests = remoteTests.length
    ? remoteTests
    : [
        { title: t.tests.miniMixed, type: "mini_test" as const, questions: 14, time: "15 min", difficulty: "medium", score: t.tests.estimated, description: null },
        { title: t.tests.fullSimulation, type: "full_test" as const, questions: state.questions.length, time: "120 min", difficulty: "hard", score: "10-990", description: null },
        { title: t.tests.placement, type: "placement" as const, questions: 14, time: "12 min", difficulty: "medium", score: t.tests.baseline, description: null },
      ];
  const outOfFreeTests = !summary.isPremium && summary.remainingTestsToday === 0;

  return (
    <div className="tests-page">
      <GlassCard className="page-hero">
        <span className="eyebrow">{t.tests.title}</span>
        <h1>{t.tests.hero}</h1>
        <p>{t.tests.remaining}: {summary.remainingTestsToday ?? t.common.unlimited}/{summary.dailyTestLimit ?? "∞"}</p>
      </GlassCard>
      <div className="tabs-row">
        <button className="active">{t.tests.mini}</button>
        <button>{t.tests.full}</button>
        <button>{t.tests.history}</button>
      </div>
      <div className="test-card-grid">
        {tests.map((test) => (
          <GlassCard className="test-card" key={test.title}>
            <span className={`difficulty ${test.difficulty}`}>{test.difficulty}</span>
            <h2>{test.title}</h2>
            {test.description && <p>{test.description}</p>}
            <p>{test.questions} {t.common.questions} · {test.time} · {test.score}</p>
            <GradientButton onClick={() => onStartTest(test.type, "id" in test ? test.id : undefined)} disabled={outOfFreeTests}>
              {t.common.startTest} <ArrowRight size={16} />
            </GradientButton>
            {outOfFreeTests && <GhostButton onClick={onUpgrade}>{t.common.upgrade}</GhostButton>}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function AICoachScreen({
  t,
  summary,
  onFeature,
  onUpgrade,
}: {
  t: Translation;
  summary: ReturnType<typeof getSubscriptionSummary>;
  onFeature: (feature: FeatureKey) => void;
  onUpgrade: () => void;
}) {
  return (
    <GlassCard className="ai-full locked-parent">
      <div className={summary.features.ai_explanation ? "ai-full-content" : "ai-full-content blurred"}>
        <Bot size={64} />
        <h1>{t.ai.title}</h1>
        <p>{t.ai.description}</p>
        <div className="ai-command-grid">
          {[t.dashboard.chatAi, t.dashboard.explainQuestion, t.dashboard.recommendPlan, t.ai.whyWrong].map((item) => (
            <GhostButton key={item} onClick={() => onFeature("ai_explanation")}>{item}</GhostButton>
          ))}
        </div>
      </div>
      {!summary.features.ai_explanation && <LockedFeatureOverlay title={t.locked.title} description={t.locked.description} upgradeLabel={t.common.upgrade} onUpgrade={onUpgrade} />}
    </GlassCard>
  );
}

function VocabularyScreen({ t, collection }: { t: Translation; collection: VocabularyCollectionItem[] }) {
  const visibleItems: Array<Pick<VocabularyCollectionItem, "id" | "word" | "meaning" | "level" | "part">> = collection.length ? collection : mockVocabulary.map((item, index) => ({
    id: `mock-${index}`,
    word: item.word,
    meaning: item.meaning,
    level: item.level,
  }));

  return (
    <div className="vocab-page">
      <GlassCard className="page-hero">
        <span className="eyebrow">{t.vocabulary.title}</span>
        <h1>{t.vocabulary.hero}</h1>
        <p>{collection.length ? `${collection.length} tu da luu tu cac phien luyen tap.` : "Hay luu tu moi trong practice mode de tao bo suu tap rieng."}</p>
      </GlassCard>
      <div className="vocab-grid">
        {visibleItems.map((item) => (
          <GlassCard className="vocab-card" key={item.word}>
            <span>{item.level}</span>
            <strong>{item.word}</strong>
            <p>{item.meaning}</p>
            {"part" in item && item.part && <small>Part {item.part}</small>}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function ResultsScreen({
  t,
  state,
  summary,
  onUpgrade,
  onToggleBookmark,
}: {
  t: Translation;
  state: AppState;
  summary: ReturnType<typeof getSubscriptionSummary>;
  onUpgrade: () => void;
  onToggleBookmark: (questionId: number) => void;
}) {
  const latest = state.attempts[0];
  const [selectedIndex, setSelectedIndex] = useState(0);
  if (!latest) {
    return (
      <GlassCard className="page-hero">
        <span className="eyebrow">{t.results.progress}</span>
        <h1>{t.results.noResult}</h1>
        <p>{t.results.noResultHint}</p>
      </GlassCard>
    );
  }

  const questionMap = new Map(state.questions.map((question) => [question.id, question]));
  const reviewItems = latest.questionIds
    .map((questionId) => {
      const question = questionMap.get(questionId);
      if (!question) return null;
      const questionAnswers = question.answers?.length ? question.answers : answers.filter((answer) => answer.questionId === question.id);
      const userAnswer = latest.answers.find((answer) => answer.questionId === question.id);
      const selectedAnswer = questionAnswers.find((answer) => answer.id === userAnswer?.selectedAnswerId);
      const correctAnswer = questionAnswers.find((answer) => answer.isCorrect);
      return { question, questionAnswers, userAnswer, selectedAnswer, correctAnswer };
    })
    .filter(Boolean) as ResultReviewItem[];
  const activeItem = reviewItems[Math.min(selectedIndex, Math.max(0, reviewItems.length - 1))];
  const bookmarkedIds = state.bookmarks.map((bookmark) => bookmark.questionId);
  const lockedFeatures = latest.lockedFeatures?.length
    ? latest.lockedFeatures
    : [
        { feature: "weakness_analysis" as FeatureKey, message: "Nang cap Premium de xem phan tich diem yeu." },
        { feature: "recommendations" as FeatureKey, message: "Nang cap Premium de nhan lo trinh on tap ca nhan hoa." },
        { feature: "ai_explanation" as FeatureKey, message: "Nang cap Premium de mo giai thich AI theo tung cau." },
      ];

  return (
    <div className="results-page">
      <ResultSummary t={t} attempt={latest} />
      <GlassCard className="breakdown-card">
        <h2>{t.results.breakdown}</h2>
        <div className="result-metrics">
          <MetricCard label={t.results.accuracy} value={`${latest.accuracy}%`} meta={`${latest.correctCount}/${latest.totalQuestions} correct`} />
          <MetricCard label={t.results.timeSpent} value={`${Math.round(latest.durationSeconds / 60)}m`} meta={t.results.sessionDuration} tone="sky" />
          <MetricCard label={t.results.confidence} value={`${latest.scoreConfidence ?? 0}%`} meta={t.results.scoreReliability} tone="green" />
        </div>
      </GlassCard>
      <ResultReviewPanel
        items={reviewItems}
        activeItem={activeItem}
        selectedIndex={selectedIndex}
        bookmarkedIds={bookmarkedIds}
        onSelect={setSelectedIndex}
        onToggleBookmark={onToggleBookmark}
      />
      <ResultInsightsPanel t={t} state={state} summary={summary} lockedFeatures={lockedFeatures} onUpgrade={onUpgrade} />
      <RecentTestsTable t={t} attempts={state.attempts} />
    </div>
  );
}

type ResultReviewItem = {
  question: Question;
  questionAnswers: Answer[];
  userAnswer?: {
    questionId: number;
    selectedAnswerId?: number;
    isCorrect: boolean;
    timeSpentSeconds: number;
    answeredAt: string;
  };
  selectedAnswer?: Answer;
  correctAnswer?: Answer;
};

function ResultReviewPanel({
  items,
  activeItem,
  selectedIndex,
  bookmarkedIds,
  onSelect,
  onToggleBookmark,
}: {
  items: ResultReviewItem[];
  activeItem?: ResultReviewItem;
  selectedIndex: number;
  bookmarkedIds: number[];
  onSelect: (index: number) => void;
  onToggleBookmark: (questionId: number) => void;
}) {
  if (!items.length || !activeItem) {
    return (
      <GlassCard className="result-review-empty">
        <h2>Review answers</h2>
        <p>Submit an online attempt to see answer explanations, transcript, and corrected options here.</p>
      </GlassCard>
    );
  }

  const { question } = activeItem;
  const isBookmarked = bookmarkedIds.includes(question.id);

  return (
    <GlassCard className="result-review-shell">
      <div className="result-review-header">
        <div>
          <span className="eyebrow">Answer review</span>
          <h2>Review question {selectedIndex + 1}/{items.length}</h2>
        </div>
        <GhostButton onClick={() => onToggleBookmark(question.id)}>
          <Bookmark size={16} fill={isBookmarked ? "currentColor" : "none"} />
          {isBookmarked ? "Saved" : "Save"}
        </GhostButton>
      </div>
      <div className="result-review-grid">
        <div className="review-question-list" aria-label="Question review list">
          {items.map((item, index) => (
            <button
              className={["review-question-row", item.userAnswer?.isCorrect ? "correct" : "wrong", index === selectedIndex ? "active" : ""].filter(Boolean).join(" ")}
              key={item.question.id}
              onClick={() => onSelect(index)}
            >
              {item.userAnswer?.isCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              <span>
                <strong>Q{index + 1}. Part {item.question.part}</strong>
                <small>{item.question.questionText || partNames[item.question.part]}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="review-detail-card">
          <div className="review-badges">
            <span>{question.skill}</span>
            <span>Part {question.part}</span>
            <span>{question.difficultyLevel}</span>
            <span>{activeItem.userAnswer?.isCorrect ? "Correct" : "Needs review"}</span>
          </div>
          <h3>{question.questionText || partNames[question.part]}</h3>
          {(question.audioUrl || question.imageUrl) && (
            <div className="review-media">
              {question.audioUrl && (
                <div>
                  <span><Volume2 size={15} /> Audio</span>
                  <audio controls src={question.audioUrl} />
                </div>
              )}
              {question.imageUrl && <img src={question.imageUrl} alt="Question visual" />}
            </div>
          )}
          {question.passageText && (
            <details className="review-context" open>
              <summary><BookOpen size={16} /> Passage</summary>
              <p>{question.passageText}</p>
            </details>
          )}
          {question.transcript && (
            <details className="review-context">
              <summary><Headphones size={16} /> Transcript</summary>
              <p>{question.transcript}</p>
            </details>
          )}
          <div className="review-answer-grid">
            {activeItem.questionAnswers.map((answer) => {
              const isSelected = answer.id === activeItem.userAnswer?.selectedAnswerId;
              const isCorrect = answer.isCorrect;
              const className = ["review-answer-option", isCorrect ? "correct" : "", isSelected && !isCorrect ? "wrong" : "", isSelected ? "selected" : ""].filter(Boolean).join(" ");
              return (
                <div className={className} key={answer.id}>
                  <strong>{String.fromCharCode(64 + answer.displayOrder)}</strong>
                  <span>{answer.answerText}</span>
                  {isCorrect && <em>Correct answer</em>}
                  {isSelected && !isCorrect && <em>Your answer</em>}
                </div>
              );
            })}
          </div>
          <div className="review-explanation-grid">
            <div>
              <span className="eyebrow">Explanation</span>
              <p>{question.explanation || "No explanation has been added for this question yet."}</p>
            </div>
            <div>
              <span className="eyebrow">Your answer</span>
              <p>{activeItem.selectedAnswer?.answerText ?? "No answer selected."}</p>
              <span className="eyebrow">Correct answer</span>
              <p>{activeItem.correctAnswer?.answerText ?? "Not available."}</p>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function ResultInsightsPanel({
  t,
  state,
  summary,
  lockedFeatures,
  onUpgrade,
}: {
  t: Translation;
  state: AppState;
  summary: ReturnType<typeof getSubscriptionSummary>;
  lockedFeatures: Array<{ feature: FeatureKey; message: string }>;
  onUpgrade: () => void;
}) {
  const weaknessRows = state.weaknesses.slice(0, 3);

  if (summary.features.weakness_analysis) {
    return (
      <GlassCard className="analysis-card result-insights-card">
        <div className="card-heading">
          <h2>{t.results.weaknessAnalysis}</h2>
          <Sparkles size={20} />
        </div>
        <p>{t.results.weaknessCopy}</p>
        <div className="result-insight-list">
          {weaknessRows.length ? (
            weaknessRows.map((weakness) => (
              <div key={weakness.id}>
                <strong>{weaknessLabel(weakness)}</strong>
                <span>{weakness.accuracy}% accuracy · {weakness.sampleSize} answers</span>
              </div>
            ))
          ) : (
            <div>
              <strong>No major weakness detected</strong>
              <span>Keep practicing to build more reliable analytics.</span>
            </div>
          )}
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="locked-insights-grid">
      {lockedFeatures.map((item) => (
        <GlassCard className="locked-parent result-locked-card" key={item.feature}>
          <div className="blurred">
            <span className="eyebrow">{item.feature.replace(/_/g, " ")}</span>
            <h3>{t.results.weaknessAnalysis}</h3>
            <p>{item.message}</p>
          </div>
          <LockedFeatureOverlay title={t.locked.title} description={item.message} upgradeLabel={t.common.upgrade} onUpgrade={onUpgrade} />
        </GlassCard>
      ))}
    </div>
  );
}

function ResultSummary({ t, attempt }: { t: Translation; attempt: UserAttempt }) {
  return (
    <GlassCard className="result-summary-card">
      <span className="eyebrow">{t.results.latest}</span>
      <h1>{attempt.estimatedTotalScore ?? attempt.accuracy}</h1>
      <p>{t.results.estimatedTotal} · {attempt.accuracy}% {t.results.accuracy.toLowerCase()} · {attempt.correctCount}/{attempt.totalQuestions} correct</p>
      <div className="result-score-grid">
        <span>{t.common.listening} {attempt.estimatedListeningScore ?? "-"}</span>
        <span>{t.common.reading} {attempt.estimatedReadingScore ?? "-"}</span>
      </div>
    </GlassCard>
  );
}

function PremiumScreen({
  t,
  state,
  summary,
  onSubscribe,
  onCancel,
  onReset,
}: {
  t: Translation;
  state: AppState;
  summary: ReturnType<typeof getSubscriptionSummary>;
  onSubscribe: (planSlug: PlanSlug) => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  return (
    <div className="premium-page">
      <GlassCard className="page-hero">
        <span className="eyebrow">{summary.isPremium ? t.premium.active : t.common.premium}</span>
        <h1>{t.premium.title}</h1>
        <p>{t.premium.description}</p>
      </GlassCard>
      <div className="pricing-grid">
        {getActivePlans(state).map((plan) => (
          <GlassCard className={plan.slug === "premium_quarterly" ? "pricing-card best" : "pricing-card"} key={plan.id}>
            {plan.slug === "premium_quarterly" && <span className="best-label">{t.premium.bestValue}</span>}
            <h2>{plan.name}</h2>
            <strong>{plan.price === 0 ? "0" : plan.price.toLocaleString("vi-VN")}đ</strong>
            <p>{plan.dailyTestLimit === null ? t.premium.unlimitedTests : `${plan.dailyTestLimit} tests/day`}</p>
            <ul>
              <li>{t.premium.aiExplanations}: {plan.hasAiFeatures ? t.common.yes : t.common.no}</li>
              <li>{t.results.weaknessAnalysis}: {plan.hasWeaknessAnalysis ? t.common.yes : t.common.no}</li>
              <li>{t.premium.adaptiveStudyPlan}: {plan.hasAdaptiveLearning ? t.common.yes : t.common.no}</li>
            </ul>
            {plan.slug !== "free" && <GradientButton onClick={() => onSubscribe(plan.slug)}>{t.premium.mockSubscribe}</GradientButton>}
          </GlassCard>
        ))}
      </div>
      <div className="premium-actions">
        {summary.isPremium && <GhostButton onClick={onCancel}>{t.premium.cancel}</GhostButton>}
        <GhostButton onClick={onReset}>{t.premium.reset}</GhostButton>
      </div>
    </div>
  );
}

function weaknessLabel(weakness: { weaknessType: string; part?: number; topicId?: number; grammarPointId?: number }) {
  if (weakness.weaknessType === "part") return `Part ${weakness.part}`;
  if (weakness.weaknessType === "topic") return topics.find((topic) => topic.id === weakness.topicId)?.name ?? "Topic";
  return grammarPoints.find((grammar) => grammar.id === weakness.grammarPointId)?.name ?? "Grammar";
}

function mergeQuestions(existing: Question[], incoming: Question[]) {
  const incomingIds = new Set(incoming.map((question) => question.id));
  return [...incoming, ...existing.filter((question) => !incomingIds.has(question.id))];
}

function apiErrorToDecision(error: ApiError): AccessDecision {
  return {
    success: false,
    code: error.code === "DAILY_TEST_LIMIT_REACHED" ? "DAILY_TEST_LIMIT_REACHED" : "PREMIUM_REQUIRED",
    message: error.message,
    upgradeRequired: error.status === 403,
  };
}

export default App;
