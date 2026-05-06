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
import type { AccessDecision, Answer, AppState, FeatureKey, PlanSlug, Question, Skill, UserAttempt, VocabularyCollectionItem } from "./types";
import { generateAdaptivePractice, generateStandardPractice, generateTestQuestions, partKey } from "./services/adaptive";
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

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    saveLanguage(language);
  }, [language]);

  const t = translations[language];
  const summary = getSubscriptionSummary(state, state.user);
  const latestAttempt = state.attempts[0];
  const recentQuestionIds = state.attempts.slice(0, 5).flatMap((attempt) => attempt.answers.map((answer) => answer.questionId));
  const estimatedTotal =
    latestAttempt?.estimatedTotalScore ??
    ((state.skillStats.listening.estimatedScore ?? 250) + (state.skillStats.reading.estimatedScore ?? 250));

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

  function startPractice(part = selectedPart, count = 10, adaptive = false) {
    const skill: Skill = part <= 4 ? "listening" : "reading";
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

  function startTest(mode: "mini_test" | "full_test" | "placement") {
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

  function finishAttempt() {
    if (!activeAttempt) return;
    setState(submitAttempt(state, activeAttempt));
    setActiveAttempt(null);
    setRevealedQuestionId(null);
    setView("progress");
  }

  function toggleBookmark(questionId: number) {
    const exists = state.bookmarks.some((bookmark) => bookmark.questionId === questionId);
    setState({
      ...state,
      bookmarks: exists
        ? state.bookmarks.filter((bookmark) => bookmark.questionId !== questionId)
        : [{ questionId, createdAt: new Date().toISOString() }, ...state.bookmarks],
    });
  }

  function saveVocabularyFromQuestion(question: Question, item: { word: string; meaning: string; level: string }) {
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

    setState({
      ...state,
      vocabularyCollection: [entry, ...state.vocabularyCollection],
    });
  }

  function checkFeature(featureKey: FeatureKey) {
    const result = checkPremiumFeature(state, state.user, featureKey);
    setState(result.state);
    if (!result.decision.success) setAccessModal(result.decision);
  }

  function subscribe(planSlug: PlanSlug) {
    setState(subscribeUser(state, state.user, planSlug));
    setAccessModal(null);
    setView("premium");
  }

  function resetDemo() {
    setState(createInitialState());
    setActiveAttempt(null);
    setCurrentIndex(0);
    setRevealedQuestionId(null);
    setView("home");
  }

  function completeAuth(payload: { name?: string; email: string }) {
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
      },
    });
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

  if (!state.auth.onboardingCompleted) {
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
    <AppLayout view={view} onViewChange={setView} summary={summary} language={language} t={t} onLanguageChange={setLanguage}>
      {view === "home" && (
        <HomeDashboard
          t={t}
          state={state}
          summary={summary}
          estimatedTotal={estimatedTotal}
          latestAttempt={latestAttempt}
          selectedPart={selectedPart}
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

      {view === "tests" && <TestsScreen t={t} state={state} summary={summary} onStartTest={startTest} onUpgrade={() => setView("premium")} />}

      {view === "ai" && <AICoachScreen t={t} summary={summary} onFeature={checkFeature} onUpgrade={() => setView("premium")} />}

      {view === "vocabulary" && <VocabularyScreen t={t} collection={state.vocabularyCollection} />}

      {view === "progress" && <ResultsScreen t={t} state={state} summary={summary} onUpgrade={() => setView("premium")} />}

      {view === "premium" && (
        <PremiumScreen
          t={t}
          state={state}
          summary={summary}
          onSubscribe={subscribe}
          onCancel={() => setState(cancelSubscription(state, state.user))}
          onReset={resetDemo}
        />
      )}

      {view === "admin" && (
        <AdminQuestionBankScreen
          t={t}
          state={state}
          onSelectPart={setSelectedPart}
          onUpdateQuestion={(question) =>
            setState({
              ...state,
              questions: state.questions.map((item) => (item.id === question.id ? question : item)),
            })
          }
          onAddQuestion={(question) =>
            setState({
              ...state,
              questions: [question, ...state.questions],
            })
          }
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
  onSubmit: (payload: { name?: string; email: string }) => void;
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
            onSubmit({ name: mode === "register" ? sanitizePlainText(name, 80) : undefined, email: normalizeEmail(email) });
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
      <RecommendedPracticeCard t={t} selectedPart={selectedPart} onStartPractice={onStartPractice} />
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
  onStartPractice,
}: {
  t: Translation;
  selectedPart: number;
  onStartPractice: (part: number, count: number, adaptive?: boolean) => void;
}) {
  return (
    <GlassCard className="recommend-card">
      <div className="card-heading">
        <h2>{t.dashboard.recommended}</h2>
        <span>{t.dashboard.aiReady}</span>
      </div>
      <div className="recommend-box">
        <strong>Part {selectedPart} - {partNames[selectedPart]}</strong>
        <p>20 {t.common.questions} · {t.dashboard.calibrated}</p>
        <span className="difficulty medium">Medium</span>
        <GradientButton onClick={() => onStartPractice(selectedPart, 10, false)}>
          {t.common.startPractice} <ArrowRight size={16} />
        </GradientButton>
      </div>
      <button className="compact-row" onClick={() => onStartPractice(5, 10, false)}>
        Vocabulary - Email <ChevronRight size={16} />
      </button>
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
  const options = answers.filter((answer) => answer.questionId === question.id).sort((a, b) => a.displayOrder - b.displayOrder);
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
  onStartTest,
  onUpgrade,
}: {
  t: Translation;
  state: AppState;
  summary: ReturnType<typeof getSubscriptionSummary>;
  onStartTest: (mode: "mini_test" | "full_test" | "placement") => void;
  onUpgrade: () => void;
}) {
  const tests = [
    { title: t.tests.miniMixed, type: "mini_test" as const, questions: 14, time: "15 min", difficulty: "Medium", score: t.tests.estimated },
    { title: t.tests.fullSimulation, type: "full_test" as const, questions: state.questions.length, time: "120 min", difficulty: "Hard", score: "10-990" },
    { title: t.tests.placement, type: "placement" as const, questions: 14, time: "12 min", difficulty: "Adaptive", score: t.tests.baseline },
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
            <span className="difficulty medium">{test.difficulty}</span>
            <h2>{test.title}</h2>
            <p>{test.questions} {t.common.questions} · {test.time} · {test.score}</p>
            <GradientButton onClick={() => onStartTest(test.type)} disabled={outOfFreeTests}>
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

function ResultsScreen({ t, state, summary, onUpgrade }: { t: Translation; state: AppState; summary: ReturnType<typeof getSubscriptionSummary>; onUpgrade: () => void }) {
  const latest = state.attempts[0];
  if (!latest) {
    return (
      <GlassCard className="page-hero">
        <span className="eyebrow">{t.results.progress}</span>
        <h1>{t.results.noResult}</h1>
        <p>{t.results.noResultHint}</p>
      </GlassCard>
    );
  }

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
      <GlassCard className="locked-parent analysis-card">
        <div className={summary.features.weakness_analysis ? "" : "blurred"}>
          <h2>{t.results.weaknessAnalysis}</h2>
          <p>{t.results.weaknessCopy}</p>
        </div>
        {!summary.features.weakness_analysis && <LockedFeatureOverlay title={t.locked.title} description={t.locked.description} upgradeLabel={t.common.upgrade} onUpgrade={onUpgrade} />}
      </GlassCard>
      <RecentTestsTable t={t} attempts={state.attempts} />
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

function AdminQuestionBankScreen({
  t,
  state,
  onSelectPart,
  onUpdateQuestion,
  onAddQuestion,
}: {
  t: Translation;
  state: AppState;
  onSelectPart: (part: number) => void;
  onUpdateQuestion: (question: Question) => void;
  onAddQuestion: (question: Question) => void;
}) {
  const [skill, setSkill] = useState<"all" | Skill>("all");
  const [part, setPart] = useState<"all" | number>("all");
  const [difficulty, setDifficulty] = useState<"all" | Question["difficultyLevel"]>("all");
  const [selectedId, setSelectedId] = useState(state.questions[0]?.id ?? 0);

  const filteredQuestions = state.questions.filter((question) => {
    if (skill !== "all" && question.skill !== skill) return false;
    if (part !== "all" && question.part !== part) return false;
    if (difficulty !== "all" && question.difficultyLevel !== difficulty) return false;
    return true;
  });

  const selectedQuestion = state.questions.find((question) => question.id === selectedId) ?? filteredQuestions[0];
  const activeCount = state.questions.filter((question) => question.isActive).length;
  const avgDifficulty = Math.round(
    state.questions.reduce((sum, question) => sum + question.difficultyScore, 0) / Math.max(1, state.questions.length),
  );

  function addSampleQuestion() {
    const nextId = Math.max(...state.questions.map((question) => question.id)) + 1;
    const sample: Question = {
      id: nextId,
      skill: "reading",
      part: 5,
      questionType: "incomplete_sentence",
      questionText: "The marketing team will announce the new campaign ____ Friday.",
      explanation: "The preposition 'on' is used with days of the week.",
      topicId: topics[0]?.id,
      grammarPointId: grammarPoints[2]?.id,
      difficultyLevel: "medium",
      difficultyScore: 55,
      estimatedTimeSeconds: 30,
      correctRate: 0,
      attemptCount: 0,
      correctCount: 0,
      isActive: true,
    };
    onAddQuestion(sample);
    setSelectedId(nextId);
    onSelectPart(sample.part);
  }

  return (
    <div className="admin-page">
      <GlassCard className="page-hero admin-hero">
        <span className="eyebrow">{t.nav.admin}</span>
        <h1>{t.admin.title}</h1>
        <p>{t.admin.subtitle}</p>
      </GlassCard>

      <div className="admin-metrics">
        <MetricCard label={t.admin.totalQuestions} value={`${state.questions.length}`} meta="Question rows" />
        <MetricCard label={t.admin.activeQuestions} value={`${activeCount}`} meta={`${state.questions.length - activeCount} inactive`} tone="green" />
        <MetricCard label={t.admin.avgDifficulty} value={`${avgDifficulty}/100`} meta="Difficulty score" tone="sky" />
      </div>

      <GlassCard className="admin-toolbar">
        <label>
          <span>{t.admin.filterSkill}</span>
          <select value={skill} onChange={(event) => setSkill(event.target.value as "all" | Skill)}>
            <option value="all">{t.admin.all}</option>
            <option value="listening">{t.common.listening}</option>
            <option value="reading">{t.common.reading}</option>
          </select>
        </label>
        <label>
          <span>{t.admin.filterPart}</span>
          <select value={part} onChange={(event) => setPart(event.target.value === "all" ? "all" : Number(event.target.value))}>
            <option value="all">{t.admin.all}</option>
            {[1, 2, 3, 4, 5, 6, 7].map((item) => (
              <option key={item} value={item}>
                Part {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t.admin.filterDifficulty}</span>
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as "all" | Question["difficultyLevel"])}>
            <option value="all">{t.admin.all}</option>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </label>
        <GradientButton onClick={addSampleQuestion}>{t.admin.addSample}</GradientButton>
      </GlassCard>

      <div className="admin-grid">
        <GlassCard className="admin-list-card">
          <div className="card-heading">
            <h2>{t.admin.questionList}</h2>
            <span>{filteredQuestions.length}</span>
          </div>
          <div className="admin-question-list">
            {filteredQuestions.map((question) => (
              <button
                key={question.id}
                className={selectedQuestion?.id === question.id ? "admin-question-row active" : "admin-question-row"}
                onClick={() => {
                  setSelectedId(question.id);
                  onSelectPart(question.part);
                }}
              >
                <span>
                  {question.skill} · Part {question.part}
                </span>
                <strong>{question.questionText}</strong>
                <small>
                  {question.difficultyLevel} · {question.difficultyScore}/100 · {question.isActive ? t.admin.active : t.admin.inactive}
                </small>
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="admin-editor-card">
          <div className="card-heading">
            <h2>{t.admin.editor}</h2>
            {selectedQuestion && <span>ID {selectedQuestion.id}</span>}
          </div>
          {selectedQuestion ? (
            <QuestionMetadataEditor t={t} question={selectedQuestion} onSave={onUpdateQuestion} />
          ) : (
            <p>{t.admin.noSelection}</p>
          )}
        </GlassCard>

        <GlassCard className="admin-preview-card">
          <div className="card-heading">
            <h2>{t.admin.preview}</h2>
            {selectedQuestion && <span>{selectedQuestion.questionType}</span>}
          </div>
          {selectedQuestion && <AdminQuestionPreview t={t} question={selectedQuestion} />}
        </GlassCard>

        <GlassCard className="admin-import-card">
          <div className="card-heading">
            <h2>{t.admin.importTitle}</h2>
            <span>CSV/XLSX</span>
          </div>
          <p>{t.admin.importHint}</p>
          <pre>{t.admin.csvColumns}</pre>
        </GlassCard>
      </div>
    </div>
  );
}

function QuestionMetadataEditor({
  t,
  question,
  onSave,
}: {
  t: Translation;
  question: Question;
  onSave: (question: Question) => void;
}) {
  const [draft, setDraft] = useState<Question>(question);

  useEffect(() => {
    setDraft(question);
  }, [question]);

  function update<K extends keyof Question>(key: K, value: Question[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      className="admin-editor-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <label>
        <span>Question</span>
        <textarea value={draft.questionText ?? ""} onChange={(event) => update("questionText", event.target.value)} />
      </label>
      <div className="admin-form-grid">
        <label>
          <span>{t.admin.filterSkill}</span>
          <select value={draft.skill} onChange={(event) => update("skill", event.target.value as Skill)}>
            <option value="listening">{t.common.listening}</option>
            <option value="reading">{t.common.reading}</option>
          </select>
        </label>
        <label>
          <span>{t.admin.filterPart}</span>
          <input type="number" min={1} max={7} value={draft.part} onChange={(event) => update("part", Number(event.target.value))} />
        </label>
        <label>
          <span>{t.admin.filterDifficulty}</span>
          <select value={draft.difficultyLevel} onChange={(event) => update("difficultyLevel", event.target.value as Question["difficultyLevel"])}>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </label>
        <label>
          <span>Score</span>
          <input
            type="number"
            min={1}
            max={100}
            value={draft.difficultyScore}
            onChange={(event) => update("difficultyScore", Number(event.target.value))}
          />
        </label>
      </div>
      <label>
        <span>{t.admin.explanation}</span>
        <textarea value={draft.explanation} onChange={(event) => update("explanation", event.target.value)} />
      </label>
      <label className="admin-checkbox">
        <input type="checkbox" checked={draft.isActive} onChange={(event) => update("isActive", event.target.checked)} />
        <span>{draft.isActive ? t.admin.active : t.admin.inactive}</span>
      </label>
      <GradientButton>{t.admin.saveChanges}</GradientButton>
    </form>
  );
}

function AdminQuestionPreview({ t, question }: { t: Translation; question: Question }) {
  const questionAnswers = answers.filter((answer) => answer.questionId === question.id).sort((a, b) => a.displayOrder - b.displayOrder);
  return (
    <div className="admin-preview">
      <div className="admin-preview-meta">
        <span>{question.skill}</span>
        <span>Part {question.part}</span>
        <span>{question.difficultyLevel}</span>
      </div>
      <h3>{question.questionText}</h3>
      {question.imageUrl && <img src={question.imageUrl} alt="Question media" />}
      {question.passageText && <p>{question.passageText}</p>}
      <div className="admin-answer-list">
        {questionAnswers.length === 0 && <p>{t.admin.answers}: mock answers are stored separately in this MVP.</p>}
        {questionAnswers.map((answer) => (
          <div key={answer.id} className={answer.isCorrect ? "admin-answer correct" : "admin-answer"}>
            <span>{String.fromCharCode(64 + answer.displayOrder)}</span>
            <strong>{answer.answerText}</strong>
            {answer.isCorrect && <small>{t.admin.correct}</small>}
          </div>
        ))}
      </div>
      <div className="explanation-panel">
        <strong>{t.admin.explanation}</strong>
        <p>{question.explanation}</p>
      </div>
    </div>
  );
}

function weaknessLabel(weakness: { weaknessType: string; part?: number; topicId?: number; grammarPointId?: number }) {
  if (weakness.weaknessType === "part") return `Part ${weakness.part}`;
  if (weakness.weaknessType === "topic") return topics.find((topic) => topic.id === weakness.topicId)?.name ?? "Topic";
  return grammarPoints.find((grammar) => grammar.id === weakness.grammarPointId)?.name ?? "Grammar";
}

export default App;
