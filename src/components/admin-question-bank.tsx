import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileSpreadsheet,
  Image,
  Layers3,
  ListChecks,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  UploadCloud,
  Volume2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Translation } from "../i18n";
import type { Answer, AppState, Question, Skill } from "../types";
import {
  createAdminQuestionGroupApi,
  createAdminTestSetApi,
  getAdminQuestionGroupsApi,
  getAdminQuestionsFilteredApi,
  getAdminTestSetsApi,
  importAdminQuestionsApi,
  mapApiAdminQuestion,
  updateAdminTestSetApi,
  uploadAdminMediaApi,
} from "../services/api";
import type { AdminTestSetPayload, ApiPagination, ApiQuestionGroup, ApiTestSet } from "../services/api";
import { GhostButton, GradientButton, GlassCard, MetricCard } from "./learning-ui";

type ValidationStatus = "pass" | "warning" | "error";
type AdminTab = "questions" | "editor" | "preview" | "tools";
type ToolsTab = "import" | "testsets" | "groups";

export function AdminQuestionBankPage({
  t,
  state,
  testSets,
  onTestSetsChange,
  onSelectPart,
  onUpdateQuestion,
  onAddQuestion,
  onMergeQuestions,
}: {
  t: Translation;
  state: AppState;
  testSets: ApiTestSet[];
  onTestSetsChange: (testSets: ApiTestSet[]) => void;
  onSelectPart: (part: number) => void;
  onUpdateQuestion: (question: Question) => void;
  onAddQuestion: (question: Question) => void;
  onMergeQuestions: (questions: Question[]) => void;
}) {
  const [skill, setSkill] = useState<"all" | Skill>("all");
  const [part, setPart] = useState<"all" | number>("all");
  const [difficulty, setDifficulty] = useState<"all" | Question["difficultyLevel"]>("all");
  const [status, setStatus] = useState<"all" | "active" | "draft">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<ApiPagination<unknown> | null>(null);
  const [groups, setGroups] = useState<ApiQuestionGroup[]>([]);
  const [selectedId, setSelectedId] = useState(state.questions[0]?.id ?? 0);
  const [adminNotice, setAdminNotice] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<AdminTab>("questions");
  const [toolsTab, setToolsTab] = useState<ToolsTab>("import");
  const [draftFromEditor, setDraftFromEditor] = useState<(Question & { answers?: Answer[] }) | null>(null);

  const [groupDraft, setGroupDraft] = useState({
    title: "",
    skill: "reading" as Skill,
    part: 7,
    group_type: "reading_passage" as ApiQuestionGroup["group_type"],
    passage_text: "",
    transcript: "",
    audio_url: "",
    image_url: "",
  });

  const [testSetDraft, setTestSetDraft] = useState<AdminTestSetPayload>({
    title: "New Mini Test",
    type: "mini",
    description: "Mixed TOEIC practice test",
    duration_minutes: 15,
    difficulty_level: "medium",
    estimated_score_min: 350,
    estimated_score_max: 750,
    is_published: true,
    question_ids: [],
  });

  useEffect(() => {
    let cancelled = false;
    getAdminQuestionsFilteredApi({ skill, part, difficulty, q: query, page, perPage: 20 })
      .then((response) => {
        if (cancelled) return;
        onMergeQuestions(response.questions.data.map(mapApiAdminQuestion));
        setPagination(response.questions);
      })
      .catch((error) => console.warn("Admin filtered questions API unavailable.", error));
    return () => {
      cancelled = true;
    };
  }, [skill, part, difficulty, query, page, onMergeQuestions]);

  useEffect(() => {
    getAdminQuestionGroupsApi()
      .then((response) => setGroups(response.groups))
      .catch((error) => console.warn("Admin question groups API unavailable.", error));
    getAdminTestSetsApi()
      .then((response) => onTestSetsChange(response.test_sets.data))
      .catch((error) => console.warn("Admin test sets API unavailable.", error));
  }, [onTestSetsChange]);

  const filteredQuestions = useMemo(
    () =>
      state.questions.filter((question) => {
        if (skill !== "all" && question.skill !== skill) return false;
        if (part !== "all" && question.part !== part) return false;
        if (difficulty !== "all" && question.difficultyLevel !== difficulty) return false;
        if (status === "active" && !question.isActive) return false;
        if (status === "draft" && question.isActive) return false;
        if (query && !`${question.questionText ?? ""} ${question.explanation ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [difficulty, part, query, skill, state.questions, status],
  );

  const selectedQuestion = state.questions.find((question) => question.id === selectedId) ?? filteredQuestions[0];
  const previewQuestion = draftFromEditor && selectedQuestion?.id === draftFromEditor.id ? draftFromEditor : selectedQuestion;
  const validation = validateQuestionDraft(previewQuestion);
  const activeCount = state.questions.filter((question) => question.isActive).length;
  const avgDifficulty = Math.round(state.questions.reduce((sum, question) => sum + question.difficultyScore, 0) / Math.max(1, state.questions.length));

  function addSampleQuestion() {
    const nextId = Math.max(0, ...state.questions.map((question) => question.id)) + 1;
    const sample: Question = {
      id: nextId,
      skill: "reading",
      part: 5,
      questionType: "incomplete_sentence",
      questionText: "The marketing team will announce the new campaign ____ Friday.",
      explanation: "The preposition 'on' is used with days of the week.",
      topicId: state.topics[0]?.id,
      grammarPointId: state.grammarPoints[0]?.id,
      difficultyLevel: "medium",
      difficultyScore: 55,
      estimatedTimeSeconds: 30,
      correctRate: 0,
      attemptCount: 0,
      correctCount: 0,
      isActive: true,
      answers: createDefaultAnswers(nextId, "on"),
    } as Question & { answers: Answer[] };
    onAddQuestion(sample);
    setSelectedId(nextId);
    setMobileTab("editor");
    onSelectPart(sample.part);
  }

  async function importQuestions(file: File) {
    try {
      const response = await importAdminQuestionsApi(file);
      setAdminNotice(`Imported ${response.created_count} questions${response.errors.length ? `, ${response.errors.length} rows need review` : ""}.`);
      const refreshed = await getAdminQuestionsFilteredApi({ skill, part, difficulty, q: query, page, perPage: 20 });
      onMergeQuestions(refreshed.questions.data.map(mapApiAdminQuestion));
      setPagination(refreshed.questions);
    } catch (error) {
      console.warn("Question import failed.", error);
      setAdminNotice("Import failed. Please check CSV columns and values.");
    }
  }

  async function createGroup() {
    try {
      const response = await createAdminQuestionGroupApi({
        ...groupDraft,
        title: groupDraft.title || null,
        passage_text: groupDraft.passage_text || null,
        transcript: groupDraft.transcript || null,
        audio_url: groupDraft.audio_url || null,
        image_url: groupDraft.image_url || null,
      });
      setGroups((current) => [response.group, ...current]);
      setAdminNotice(`Created group #${response.group.id}. Select it in the editor to attach questions.`);
    } catch (error) {
      console.warn("Create question group failed.", error);
      setAdminNotice("Could not create group. Check required group fields.");
    }
  }

  async function saveTestSet() {
    if (!testSetDraft.question_ids.length) {
      setAdminNotice("Select at least one question before publishing a test set.");
      return;
    }

    try {
      const response = await createAdminTestSetApi(testSetDraft);
      const refreshed = await getAdminTestSetsApi();
      onTestSetsChange(refreshed.test_sets.data);
      setAdminNotice(`Created test set #${response.test_set.id}: ${response.test_set.title}.`);
    } catch (error) {
      console.warn("Create test set failed.", error);
      setAdminNotice("Could not create test set. Check selected questions and fields.");
    }
  }

  async function togglePublishTestSet(testSet: ApiTestSet) {
    try {
      const detailQuestionIds = testSet.questions?.map((question) => question.id);
      const payload: AdminTestSetPayload = {
        title: testSet.title,
        type: testSet.type,
        description: testSet.description ?? null,
        duration_minutes: testSet.duration_minutes,
        difficulty_level: testSet.difficulty_level,
        estimated_score_min: testSet.estimated_score_min ?? null,
        estimated_score_max: testSet.estimated_score_max ?? null,
        is_published: !testSet.is_published,
        question_ids: detailQuestionIds?.length ? detailQuestionIds : testSetDraft.question_ids,
      };
      if (!payload.question_ids.length) {
        setAdminNotice("Select questions in the builder before changing an older test set.");
        return;
      }
      await updateAdminTestSetApi(testSet.id, payload);
      const refreshed = await getAdminTestSetsApi();
      onTestSetsChange(refreshed.test_sets.data);
    } catch (error) {
      console.warn("Toggle test set publish failed.", error);
      setAdminNotice("Could not update test set publish status.");
    }
  }

  function toggleDraftQuestion(questionId: number) {
    setTestSetDraft((current) => ({
      ...current,
      question_ids: current.question_ids.includes(questionId) ? current.question_ids.filter((id) => id !== questionId) : [...current.question_ids, questionId],
    }));
  }

  function saveCurrentDraft() {
    if (!draftFromEditor) return;
    onUpdateQuestion(draftFromEditor);
    setAdminNotice("Saved question metadata and answers.");
  }

  return (
    <div className="admin-page admin-v2-page">
      <AdminHeader onNewQuestion={addSampleQuestion} onImport={() => setToolsTab("import")} onGroup={() => setToolsTab("groups")} onSave={saveCurrentDraft} />
      <AdminStatsGrid total={state.questions.length} active={activeCount} avgDifficulty={avgDifficulty} groups={groups.length} />

      <div className="admin-mobile-tabs" aria-label="Admin workspace tabs">
        {[
          ["questions", "Questions"],
          ["editor", "Editor"],
          ["preview", "Preview"],
          ["tools", "Tools"],
        ].map(([id, label]) => (
          <button key={id} className={mobileTab === id ? "active" : ""} onClick={() => setMobileTab(id as AdminTab)}>
            {label}
          </button>
        ))}
      </div>

      <div className="admin-workspace-v2">
        <QuestionLibraryPanel
          t={t}
          visible={mobileTab === "questions"}
          questions={filteredQuestions}
          selectedQuestion={selectedQuestion}
          query={query}
          skill={skill}
          part={part}
          difficulty={difficulty}
          status={status}
          pagination={pagination}
          onQueryChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          onSkillChange={(value) => {
            setSkill(value);
            setPage(1);
          }}
          onPartChange={(value) => {
            setPart(value);
            setPage(1);
          }}
          onDifficultyChange={(value) => {
            setDifficulty(value);
            setPage(1);
          }}
          onStatusChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          onSelect={(question) => {
            setSelectedId(question.id);
            setDraftFromEditor(null);
            onSelectPart(question.part);
            setMobileTab("editor");
          }}
          onPageChange={setPage}
        />

        <QuestionEditorPanel
          t={t}
          visible={mobileTab === "editor"}
          question={selectedQuestion}
          groups={groups}
          validation={validation}
          onDraftChange={setDraftFromEditor}
          onSave={(question) => {
            onUpdateQuestion(question);
            setAdminNotice("Saved question metadata and answers.");
          }}
        />

        <AdminPreviewPanel
          t={t}
          visible={mobileTab === "preview"}
          question={previewQuestion}
          validation={validation}
        />
      </div>

      <AdminToolsTabs
        activeTab={toolsTab}
        visible={mobileTab === "tools"}
        onTabChange={setToolsTab}
        onImport={importQuestions}
        questions={filteredQuestions}
        selectedQuestionIds={testSetDraft.question_ids}
        testSets={testSets}
        testSetDraft={testSetDraft}
        groupDraft={groupDraft}
        groups={groups}
        notice={adminNotice}
        onTestSetDraftChange={setTestSetDraft}
        onToggleQuestion={toggleDraftQuestion}
        onSaveTestSet={saveTestSet}
        onTogglePublish={togglePublishTestSet}
        onGroupDraftChange={setGroupDraft}
        onCreateGroup={createGroup}
      />
    </div>
  );
}

function AdminHeader({
  onNewQuestion,
  onImport,
  onGroup,
  onSave,
}: {
  onNewQuestion: () => void;
  onImport: () => void;
  onGroup: () => void;
  onSave: () => void;
}) {
  return (
    <GlassCard className="admin-v2-header">
      <div>
        <div className="admin-breadcrumb">Admin / Content Management</div>
        <h1>Admin Question Bank</h1>
        <p>Quản lý ngân hàng câu hỏi TOEIC, metadata, đáp án và nhóm câu hỏi.</p>
      </div>
      <div className="admin-header-actions">
        <GradientButton onClick={onNewQuestion}>
          <Plus size={16} /> New Question
        </GradientButton>
        <GhostButton onClick={onImport}>
          <UploadCloud size={16} /> Import CSV
        </GhostButton>
        <GhostButton onClick={onGroup}>
          <Layers3 size={16} /> Create Group
        </GhostButton>
        <GradientButton onClick={onSave}>
          <Save size={16} /> Save Changes
        </GradientButton>
      </div>
    </GlassCard>
  );
}

function AdminStatsGrid({ total, active, avgDifficulty, groups }: { total: number; active: number; avgDifficulty: number; groups: number }) {
  return (
    <div className="admin-v2-stats">
      <AdminStatCard icon={<FileSpreadsheet size={22} />} label="Total Questions" value={total.toLocaleString("vi-VN")} meta="Tất cả câu hỏi" tone="primary" />
      <AdminStatCard icon={<CheckCircle2 size={22} />} label="Active Questions" value={active.toLocaleString("vi-VN")} meta="Đang sử dụng" tone="success" />
      <AdminStatCard icon={<SlidersHorizontal size={22} />} label="Avg Difficulty" value={`${avgDifficulty} / 100`} meta="Độ khó trung bình" tone="warning" />
      <AdminStatCard icon={<Layers3 size={22} />} label="Question Groups" value={`${groups}`} meta="Nhóm câu hỏi" tone="violet" />
    </div>
  );
}

function AdminStatCard({ icon, label, value, meta, tone }: { icon: ReactNode; label: string; value: string; meta: string; tone: string }) {
  return (
    <GlassCard className="admin-v2-stat-card">
      <div className={`admin-stat-icon ${tone}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </GlassCard>
  );
}

function QuestionLibraryPanel({
  t,
  visible,
  questions,
  selectedQuestion,
  query,
  skill,
  part,
  difficulty,
  status,
  pagination,
  onQueryChange,
  onSkillChange,
  onPartChange,
  onDifficultyChange,
  onStatusChange,
  onSelect,
  onPageChange,
}: {
  t: Translation;
  visible: boolean;
  questions: Question[];
  selectedQuestion?: Question;
  query: string;
  skill: "all" | Skill;
  part: "all" | number;
  difficulty: "all" | Question["difficultyLevel"];
  status: "all" | "active" | "draft";
  pagination: ApiPagination<unknown> | null;
  onQueryChange: (value: string) => void;
  onSkillChange: (value: "all" | Skill) => void;
  onPartChange: (value: "all" | number) => void;
  onDifficultyChange: (value: "all" | Question["difficultyLevel"]) => void;
  onStatusChange: (value: "all" | "active" | "draft") => void;
  onSelect: (question: Question) => void;
  onPageChange: (value: number | ((value: number) => number)) => void;
}) {
  return (
    <GlassCard className={`question-library-panel admin-mobile-panel ${visible ? "mobile-active" : ""}`}>
      <PanelHeading title="Question Library" meta={pagination ? `${pagination.total} total` : `${questions.length} local`} />
      <QuestionFilterBar
        t={t}
        query={query}
        skill={skill}
        part={part}
        difficulty={difficulty}
        status={status}
        onQueryChange={onQueryChange}
        onSkillChange={onSkillChange}
        onPartChange={onPartChange}
        onDifficultyChange={onDifficultyChange}
        onStatusChange={onStatusChange}
      />
      <div className="admin-v2-question-list">
        {questions.map((question) => (
          <QuestionListItem key={question.id} question={question} active={selectedQuestion?.id === question.id} onClick={() => onSelect(question)} />
        ))}
      </div>
      {pagination && (
        <div className="admin-v2-pagination">
          <GhostButton disabled={pagination.current_page <= 1} onClick={() => onPageChange((value) => Math.max(1, value - 1))}>
            Prev
          </GhostButton>
          <span>
            {pagination.current_page}/{pagination.last_page}
          </span>
          <GhostButton disabled={pagination.current_page >= pagination.last_page} onClick={() => onPageChange((value) => value + 1)}>
            Next
          </GhostButton>
        </div>
      )}
    </GlassCard>
  );
}

function QuestionFilterBar({
  t,
  query,
  skill,
  part,
  difficulty,
  status,
  onQueryChange,
  onSkillChange,
  onPartChange,
  onDifficultyChange,
  onStatusChange,
}: {
  t: Translation;
  query: string;
  skill: "all" | Skill;
  part: "all" | number;
  difficulty: "all" | Question["difficultyLevel"];
  status: "all" | "active" | "draft";
  onQueryChange: (value: string) => void;
  onSkillChange: (value: "all" | Skill) => void;
  onPartChange: (value: "all" | number) => void;
  onDifficultyChange: (value: "all" | Question["difficultyLevel"]) => void;
  onStatusChange: (value: "all" | "active" | "draft") => void;
}) {
  return (
    <div className="admin-v2-filters">
      <label className="admin-v2-search">
        <Search size={16} />
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search question..." />
      </label>
      <button className="admin-filter-icon" aria-label="Filter">
        <SlidersHorizontal size={16} />
      </button>
      <label>
        <span>{t.admin.filterSkill}</span>
        <select value={skill} onChange={(event) => onSkillChange(event.target.value as "all" | Skill)}>
          <option value="all">{t.admin.all}</option>
          <option value="listening">{t.common.listening}</option>
          <option value="reading">{t.common.reading}</option>
        </select>
      </label>
      <label>
        <span>{t.admin.filterPart}</span>
        <select value={part} onChange={(event) => onPartChange(event.target.value === "all" ? "all" : Number(event.target.value))}>
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
        <select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value as "all" | Question["difficultyLevel"])}>
          <option value="all">{t.admin.all}</option>
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>
      </label>
      <label>
        <span>Status</span>
        <select value={status} onChange={(event) => onStatusChange(event.target.value as "all" | "active" | "draft")}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
        </select>
      </label>
    </div>
  );
}

function QuestionListItem({ question, active, onClick }: { question: Question; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? "admin-v2-question-item active" : "admin-v2-question-item"} onClick={onClick}>
      <div className="question-item-topline">
        <span className="pill soft">{question.skill}</span>
        <span className="pill sky">Part {question.part}</span>
        <span className={`pill ${question.difficultyLevel}`}>{question.difficultyLevel}</span>
        <span className={question.isActive ? "status-dot active" : "status-dot draft"}>{question.isActive ? "Active" : "Draft"}</span>
      </div>
      <div className="question-item-body">
        <div>
          <strong>{question.questionText || question.questionType}</strong>
          <small>
            ID: #{String(question.id).padStart(3, "0")} <b /> Score: {question.difficultyScore}
          </small>
        </div>
        {question.imageUrl && <img src={question.imageUrl} alt="" />}
      </div>
    </button>
  );
}

function QuestionEditorPanel({
  t,
  visible,
  question,
  groups,
  validation,
  onDraftChange,
  onSave,
}: {
  t: Translation;
  visible: boolean;
  question?: Question;
  groups: ApiQuestionGroup[];
  validation: ValidationItem[];
  onDraftChange: (question: Question & { answers?: Answer[] }) => void;
  onSave: (question: Question) => void;
}) {
  const [draft, setDraft] = useState<Question & { answers?: Answer[] }>(() => (question ? withEditableAnswers(question) : createBlankQuestion()));

  useEffect(() => {
    const nextDraft = question ? withEditableAnswers(question) : createBlankQuestion();
    setDraft(nextDraft);
    onDraftChange(nextDraft);
  }, [question]);

  function update<K extends keyof Question>(key: K, value: Question[K]) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      onDraftChange(next);
      return next;
    });
  }

  function updateAnswer(index: number, patch: Partial<Answer>) {
    setDraft((current) => {
      const next = {
        ...current,
        answers: (current.answers ?? createDefaultAnswers(current.id)).map((answer, answerIndex) => (answerIndex === index ? { ...answer, ...patch } : answer)),
      };
      onDraftChange(next);
      return next;
    });
  }

  function setCorrectAnswer(index: number) {
    setDraft((current) => {
      const next = {
        ...current,
        answers: (current.answers ?? createDefaultAnswers(current.id)).map((answer, answerIndex) => ({ ...answer, isCorrect: answerIndex === index })),
      };
      onDraftChange(next);
      return next;
    });
  }

  async function uploadMedia(file: File, key: "audioUrl" | "imageUrl") {
    const response = await uploadAdminMediaApi(file);
    update(key, response.file.url as Question[typeof key]);
  }

  return (
    <GlassCard className={`question-editor-panel admin-mobile-panel ${visible ? "mobile-active" : ""}`}>
      <PanelHeading title="Question Editor" meta={`ID #${draft.id}`} />
      <form
        className="admin-v2-editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
        }}
      >
        <EditorSection index={1} title="Basic Information" subtitle="Skill, part, type, difficulty" defaultOpen>
          <BasicInfoSection t={t} draft={draft} groups={groups} update={update} />
        </EditorSection>
        <EditorSection index={2} title="Content" subtitle="Question text, passage, transcript">
          <ContentSection t={t} draft={draft} update={update} />
        </EditorSection>
        <EditorSection index={3} title="Media" subtitle="Image, audio files">
          <MediaSection draft={draft} update={update} uploadMedia={uploadMedia} />
        </EditorSection>
        <EditorSection index={4} title="Answers" subtitle="4 lựa chọn và đáp án đúng" defaultOpen>
          <AnswerEditor t={t} draft={draft} updateAnswer={updateAnswer} setCorrectAnswer={setCorrectAnswer} />
        </EditorSection>
        <EditorSection index={5} title="Explanation & Formula" subtitle="Giải thích và công thức liên quan">
          <ExplanationFormulaSection t={t} draft={draft} update={update} />
        </EditorSection>
        <EditorSection index={6} title="Publishing" subtitle="Trạng thái và thông tin xuất bản">
          <PublishingSection draft={draft} update={update} validation={validation} />
        </EditorSection>
        <div className="admin-v2-sticky-save">
          <GradientButton>
            <Save size={16} /> {t.admin.saveChanges}
          </GradientButton>
        </div>
      </form>
    </GlassCard>
  );
}

function EditorSection({ index, title, subtitle, defaultOpen = false, children }: { index: number; title: string; subtitle: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="editor-section" open={defaultOpen}>
      <summary>
        <span>{index}</span>
        <div>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </div>
        <ChevronDown size={16} />
      </summary>
      <div className="editor-section-body">{children}</div>
    </details>
  );
}

function BasicInfoSection({
  t,
  draft,
  groups,
  update,
}: {
  t: Translation;
  draft: Question;
  groups: ApiQuestionGroup[];
  update: <K extends keyof Question>(key: K, value: Question[K]) => void;
}) {
  return (
    <div className="admin-v2-form-grid">
      <FormField label={t.admin.filterSkill}>
        <select value={draft.skill} onChange={(event) => update("skill", event.target.value as Skill)}>
          <option value="listening">{t.common.listening}</option>
          <option value="reading">{t.common.reading}</option>
        </select>
      </FormField>
      <FormField label={t.admin.filterPart}>
        <input type="number" min={1} max={7} value={draft.part} onChange={(event) => update("part", Number(event.target.value))} />
      </FormField>
      <FormField label="Type">
        <input value={draft.questionType} onChange={(event) => update("questionType", event.target.value)} />
      </FormField>
      <FormField label="Group (optional)">
        <select value={draft.questionGroupId ?? ""} onChange={(event) => update("questionGroupId", event.target.value ? Number(event.target.value) : undefined)}>
          <option value="">No group</option>
          {groups
            .filter((group) => group.skill === draft.skill && group.part === draft.part)
            .map((group) => (
              <option key={group.id} value={group.id}>
                #{group.id} {group.title || group.group_type}
              </option>
            ))}
        </select>
      </FormField>
      <FormField label={t.admin.filterDifficulty}>
        <select value={draft.difficultyLevel} onChange={(event) => update("difficultyLevel", event.target.value as Question["difficultyLevel"])}>
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>
      </FormField>
      <FormField label="Difficulty Score">
        <div className="input-suffix">
          <input type="number" min={1} max={100} value={draft.difficultyScore} onChange={(event) => update("difficultyScore", Number(event.target.value))} />
          <span>/ 100</span>
        </div>
      </FormField>
      <FormField label="Estimated Time (s)">
        <input type="number" min={5} max={3600} value={draft.estimatedTimeSeconds} onChange={(event) => update("estimatedTimeSeconds", Number(event.target.value))} />
      </FormField>
      <label className="admin-v2-toggle">
        <input type="checkbox" checked={draft.isActive} onChange={(event) => update("isActive", event.target.checked)} />
        <span>{draft.isActive ? "Active" : "Draft"}</span>
      </label>
    </div>
  );
}

function ContentSection({ t, draft, update }: { t: Translation; draft: Question; update: <K extends keyof Question>(key: K, value: Question[K]) => void }) {
  return (
    <div className="admin-v2-stack">
      <FormField label="Question">
        <textarea value={draft.questionText ?? ""} onChange={(event) => update("questionText", event.target.value)} />
      </FormField>
      <FormField label={t.admin.passage}>
        <textarea value={draft.passageText ?? ""} onChange={(event) => update("passageText", event.target.value)} />
      </FormField>
      <FormField label={t.admin.transcript}>
        <textarea value={draft.transcript ?? ""} onChange={(event) => update("transcript", event.target.value)} />
      </FormField>
    </div>
  );
}

function MediaSection({
  draft,
  update,
  uploadMedia,
}: {
  draft: Question;
  update: <K extends keyof Question>(key: K, value: Question[K]) => void;
  uploadMedia: (file: File, key: "audioUrl" | "imageUrl") => void;
}) {
  return (
    <div className="admin-v2-form-grid">
      <FormField label="Image URL">
        <input value={draft.imageUrl ?? ""} onChange={(event) => update("imageUrl", event.target.value)} />
        <label className="upload-dropzone">
          <Image size={18} />
          <span>Upload image</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && uploadMedia(event.target.files[0], "imageUrl")} />
        </label>
      </FormField>
      <FormField label="Audio URL">
        <input value={draft.audioUrl ?? ""} onChange={(event) => update("audioUrl", event.target.value)} />
        <label className="upload-dropzone">
          <Volume2 size={18} />
          <span>Upload audio</span>
          <input type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a" onChange={(event) => event.target.files?.[0] && uploadMedia(event.target.files[0], "audioUrl")} />
        </label>
      </FormField>
    </div>
  );
}

function AnswerEditor({
  t,
  draft,
  updateAnswer,
  setCorrectAnswer,
}: {
  t: Translation;
  draft: Question & { answers?: Answer[] };
  updateAnswer: (index: number, patch: Partial<Answer>) => void;
  setCorrectAnswer: (index: number) => void;
}) {
  return (
    <div className="answer-editor-v2">
      {(draft.answers ?? createDefaultAnswers(draft.id)).map((answer, index) => (
        <AnswerOptionEditor key={`${answer.id}-${index}`} answer={answer} index={index} onTextChange={(value) => updateAnswer(index, { answerText: value })} onCorrect={() => setCorrectAnswer(index)} />
      ))}
      <small>{t.admin.correct}: chọn đúng 1 đáp án.</small>
    </div>
  );
}

function AnswerOptionEditor({ answer, index, onTextChange, onCorrect }: { answer: Answer; index: number; onTextChange: (value: string) => void; onCorrect: () => void }) {
  return (
    <div className={answer.isCorrect ? "answer-option-editor correct" : "answer-option-editor"}>
      <label>
        <input type="radio" checked={answer.isCorrect} onChange={onCorrect} />
        <span>{String.fromCharCode(65 + index)}</span>
      </label>
      <input value={answer.answerText} onChange={(event) => onTextChange(event.target.value)} placeholder={`Answer ${String.fromCharCode(65 + index)}`} />
      {answer.isCorrect && <Check size={16} />}
    </div>
  );
}

function ExplanationFormulaSection({ t, draft, update }: { t: Translation; draft: Question; update: <K extends keyof Question>(key: K, value: Question[K]) => void }) {
  return (
    <div className="admin-v2-stack">
      <FormField label={t.admin.explanation}>
        <textarea value={draft.explanation} onChange={(event) => update("explanation", event.target.value)} />
      </FormField>
      <div className="formula-placeholder">
        <strong>Formula Hint</strong>
        <p>Backend đã có cột `grammar_formula`/`vocabulary_hints`; UI này giữ chỗ để mở editor chi tiết ở bước sau.</p>
      </div>
    </div>
  );
}

function PublishingSection({ draft, update, validation }: { draft: Question; update: <K extends keyof Question>(key: K, value: Question[K]) => void; validation: ValidationItem[] }) {
  return (
    <div className="publishing-grid">
      <label className="admin-v2-toggle">
        <input type="checkbox" checked={draft.isActive} onChange={(event) => update("isActive", event.target.checked)} />
        <span>{draft.isActive ? "Active question" : "Draft question"}</span>
      </label>
      <div className="mini-validation">
        {validation.slice(0, 4).map((item) => (
          <ValidationRow key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

function AdminPreviewPanel({ t, visible, question, validation }: { t: Translation; visible: boolean; question?: Question & { answers?: Answer[] }; validation: ValidationItem[] }) {
  const questionAnswers = (question?.answers ?? []).sort((a, b) => a.displayOrder - b.displayOrder);
  const correctAnswer = questionAnswers.find((answer) => answer.isCorrect);

  return (
    <aside className={`admin-preview-column admin-mobile-panel ${visible ? "mobile-active" : ""}`}>
      <GlassCard className="admin-preview-card-v2">
        <PanelHeading title="Live Preview" meta={question ? `ID #${String(question.id).padStart(3, "0")}` : ""} />
        {question ? (
          <div className="admin-preview-v2">
            <div className="admin-preview-meta">
              <span>{question.skill}</span>
              <span>Part {question.part}</span>
              <span>{question.difficultyLevel}</span>
            </div>
            <h3>{question.questionText || question.questionType}</h3>
            {question.audioUrl && (
              <div className="fake-audio-player">
                <button type="button">▶</button>
                <span>0:00 / 0:28</span>
                <i />
                <Volume2 size={16} />
              </div>
            )}
            {question.imageUrl && <img className="admin-preview-image" src={question.imageUrl} alt="Question media" />}
            {question.passageText && <details className="preview-disclosure"><summary>Passage</summary><p>{question.passageText}</p></details>}
            <div className="admin-answer-list">
              {questionAnswers.map((answer, index) => (
                <div key={answer.id} className={answer.isCorrect ? "admin-answer correct" : "admin-answer"}>
                  <span>{String.fromCharCode(65 + index)}</span>
                  <strong>{answer.answerText || `Answer ${String.fromCharCode(65 + index)}`}</strong>
                  {answer.isCorrect && <Check size={16} />}
                </div>
              ))}
            </div>
            <div className="explanation-panel">
              <strong>{t.admin.explanation}</strong>
              <p>{question.explanation || "Add a concise explanation for learners."}</p>
            </div>
            <div className="formula-card">
              <strong>Formula Hint</strong>
              <p>{question.skill === "reading" ? "Keyword → grammar role → eliminate distractors." : "Intent → context → avoid repeated-word traps."}</p>
            </div>
          </div>
        ) : (
          <p>No question selected.</p>
        )}
      </GlassCard>
      <ValidationChecklist validation={validation} />
      <QuickInfoCard question={question} correctAnswer={correctAnswer} />
    </aside>
  );
}

function ValidationChecklist({ validation }: { validation: ValidationItem[] }) {
  return (
    <GlassCard className="validation-card">
      <PanelHeading title="Validation Checklist" />
      <div className="validation-list">
        {validation.map((item) => (
          <ValidationRow key={item.key} item={item} />
        ))}
      </div>
    </GlassCard>
  );
}

function QuickInfoCard({ question, correctAnswer }: { question?: Question; correctAnswer?: Answer }) {
  return (
    <GlassCard className="quick-info-card">
      <PanelHeading title="Quick Info" />
      <dl>
        <div><dt>Correct Answer</dt><dd>{correctAnswer ? String.fromCharCode(64 + correctAnswer.displayOrder) : "-"}</dd></div>
        <div><dt>Question ID</dt><dd>{question ? `#${String(question.id).padStart(3, "0")}` : "-"}</dd></div>
        <div><dt>Status</dt><dd>{question?.isActive ? "Active" : "Draft"}</dd></div>
        <div><dt>Score</dt><dd>{question?.difficultyScore ?? "-"}/100</dd></div>
      </dl>
    </GlassCard>
  );
}

function AdminToolsTabs({
  activeTab,
  visible,
  onTabChange,
  onImport,
  questions,
  selectedQuestionIds,
  testSets,
  testSetDraft,
  groupDraft,
  groups,
  notice,
  onTestSetDraftChange,
  onToggleQuestion,
  onSaveTestSet,
  onTogglePublish,
  onGroupDraftChange,
  onCreateGroup,
}: {
  activeTab: ToolsTab;
  visible: boolean;
  onTabChange: (tab: ToolsTab) => void;
  onImport: (file: File) => void;
  questions: Question[];
  selectedQuestionIds: number[];
  testSets: ApiTestSet[];
  testSetDraft: AdminTestSetPayload;
  groupDraft: { title: string; skill: Skill; part: number; group_type: ApiQuestionGroup["group_type"]; passage_text: string; transcript: string; audio_url: string; image_url: string };
  groups: ApiQuestionGroup[];
  notice: string | null;
  onTestSetDraftChange: Dispatch<SetStateAction<AdminTestSetPayload>>;
  onToggleQuestion: (questionId: number) => void;
  onSaveTestSet: () => void;
  onTogglePublish: (testSet: ApiTestSet) => void;
  onGroupDraftChange: Dispatch<SetStateAction<{ title: string; skill: Skill; part: number; group_type: ApiQuestionGroup["group_type"]; passage_text: string; transcript: string; audio_url: string; image_url: string }>>;
  onCreateGroup: () => void;
}) {
  return (
    <GlassCard className={`admin-tools-tabs admin-mobile-panel ${visible ? "mobile-active" : ""}`}>
      <div className="admin-tools-tabbar">
        <button className={activeTab === "import" ? "active" : ""} onClick={() => onTabChange("import")}>Bulk Import</button>
        <button className={activeTab === "testsets" ? "active" : ""} onClick={() => onTabChange("testsets")}>Test Set Builder</button>
        <button className={activeTab === "groups" ? "active" : ""} onClick={() => onTabChange("groups")}>Question Groups</button>
      </div>
      {notice && <p className="form-success">{notice}</p>}
      {activeTab === "import" && <BulkImportPanel onImport={onImport} />}
      {activeTab === "testsets" && (
        <TestSetBuilderPanel
          questions={questions}
          selectedQuestionIds={selectedQuestionIds}
          testSets={testSets}
          draft={testSetDraft}
          onDraftChange={onTestSetDraftChange}
          onToggleQuestion={onToggleQuestion}
          onSave={onSaveTestSet}
          onTogglePublish={onTogglePublish}
        />
      )}
      {activeTab === "groups" && <QuestionGroupsPanel draft={groupDraft} groups={groups} onDraftChange={onGroupDraftChange} onCreate={onCreateGroup} />}
    </GlassCard>
  );
}

function BulkImportPanel({ onImport }: { onImport: (file: File) => void }) {
  return (
    <div className="admin-tool-grid">
      <label className="bulk-dropzone">
        <UploadCloud size={34} />
        <strong>Kéo & thả file CSV/Excel vào đây</strong>
        <span>hoặc chọn file từ máy tính · .csv, .xlsx, .xls</span>
        <input type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && onImport(event.target.files[0])} />
      </label>
      <div className="tool-mini-card">
        <strong>CSV Template</strong>
        <p>Tải template chuẩn để import câu hỏi hàng loạt.</p>
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent("skill,part,question_type,question_text,passage_text,transcript,audio_url,image_url,difficulty_level,difficulty_score,estimated_time_seconds,explanation,option_A,option_B,option_C,option_D,correct_option\nreading,5,incomplete_sentence,The team will ____ the proposal tomorrow.,,,,,easy,30,30,A base verb follows will.,review,reviewed,reviewing,reviews,A")}`} download="toeic-question-import-template.csv">
          Download Template
        </a>
      </div>
      <div className="tool-mini-card">
        <strong>Import History</strong>
        <p>toeic_questions_2024_05_20.csv</p>
        <small>1,200 rows · success</small>
      </div>
      <div className="tool-mini-card">
        <strong>Tips</strong>
        <ul>
          <li>File phải đúng định dạng CSV.</li>
          <li>Mỗi câu hỏi cần có 4 đáp án.</li>
          <li>Phải có đúng 1 đáp án đúng.</li>
        </ul>
      </div>
    </div>
  );
}

function TestSetBuilderPanel({
  questions,
  selectedQuestionIds,
  testSets,
  draft,
  onDraftChange,
  onToggleQuestion,
  onSave,
  onTogglePublish,
}: {
  questions: Question[];
  selectedQuestionIds: number[];
  testSets: ApiTestSet[];
  draft: AdminTestSetPayload;
  onDraftChange: Dispatch<SetStateAction<AdminTestSetPayload>>;
  onToggleQuestion: (questionId: number) => void;
  onSave: () => void;
  onTogglePublish: (testSet: ApiTestSet) => void;
}) {
  return (
    <div className="testset-builder-layout">
      <div className="admin-v2-form-grid">
        <FormField label="Title"><input value={draft.title} onChange={(event) => onDraftChange((current) => ({ ...current, title: event.target.value }))} /></FormField>
        <FormField label="Type">
          <select value={draft.type} onChange={(event) => onDraftChange((current) => ({ ...current, type: event.target.value as ApiTestSet["type"] }))}>
            <option value="mini">Mini Test</option>
            <option value="full">Full Test</option>
            <option value="placement">Placement</option>
          </select>
        </FormField>
        <FormField label="Duration"><input type="number" min={1} max={240} value={draft.duration_minutes} onChange={(event) => onDraftChange((current) => ({ ...current, duration_minutes: Number(event.target.value) }))} /></FormField>
        <FormField label="Difficulty">
          <select value={draft.difficulty_level} onChange={(event) => onDraftChange((current) => ({ ...current, difficulty_level: event.target.value as Question["difficultyLevel"] }))}>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </FormField>
        <FormField label="Min score"><input type="number" min={10} max={990} value={draft.estimated_score_min ?? ""} onChange={(event) => onDraftChange((current) => ({ ...current, estimated_score_min: event.target.value ? Number(event.target.value) : null }))} /></FormField>
        <FormField label="Max score"><input type="number" min={10} max={990} value={draft.estimated_score_max ?? ""} onChange={(event) => onDraftChange((current) => ({ ...current, estimated_score_max: event.target.value ? Number(event.target.value) : null }))} /></FormField>
      </div>
      <FormField label="Description">
        <textarea value={draft.description ?? ""} onChange={(event) => onDraftChange((current) => ({ ...current, description: event.target.value }))} />
      </FormField>
      <label className="admin-v2-toggle">
        <input type="checkbox" checked={draft.is_published} onChange={(event) => onDraftChange((current) => ({ ...current, is_published: event.target.checked }))} />
        <span>Published and visible on Tests screen</span>
      </label>
      <div className="testset-question-picker">
        {questions.slice(0, 36).map((question) => (
          <button type="button" key={`testset-${question.id}`} className={selectedQuestionIds.includes(question.id) ? "picker-question selected" : "picker-question"} onClick={() => onToggleQuestion(question.id)}>
            <span>Part {question.part} · {question.skill}</span>
            <strong>{question.questionText}</strong>
          </button>
        ))}
      </div>
      <GradientButton onClick={onSave}>Publish Test Set</GradientButton>
      <div className="tool-existing-list">
        {testSets.slice(0, 6).map((testSet) => (
          <div className="admin-v2-existing-row" key={testSet.id}>
            <span>#{testSet.id} · {testSet.type} · {testSet.duration_minutes} min</span>
            <strong>{testSet.title}</strong>
            <small>{testSet.questions_count ?? testSet.listening_question_count + testSet.reading_question_count} questions · {testSet.is_published ? "published" : "draft"}</small>
            <GhostButton onClick={() => onTogglePublish(testSet)}>{testSet.is_published ? "Unpublish" : "Publish"}</GhostButton>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuestionGroupsPanel({
  draft,
  groups,
  onDraftChange,
  onCreate,
}: {
  draft: { title: string; skill: Skill; part: number; group_type: ApiQuestionGroup["group_type"]; passage_text: string; transcript: string; audio_url: string; image_url: string };
  groups: ApiQuestionGroup[];
  onDraftChange: Dispatch<SetStateAction<{ title: string; skill: Skill; part: number; group_type: ApiQuestionGroup["group_type"]; passage_text: string; transcript: string; audio_url: string; image_url: string }>>;
  onCreate: () => void;
}) {
  return (
    <div className="groups-panel-layout">
      <div className="admin-v2-form-grid">
        <FormField label="Title"><input value={draft.title} onChange={(event) => onDraftChange((current) => ({ ...current, title: event.target.value }))} /></FormField>
        <FormField label="Skill">
          <select value={draft.skill} onChange={(event) => onDraftChange((current) => ({ ...current, skill: event.target.value as Skill }))}>
            <option value="listening">Listening</option>
            <option value="reading">Reading</option>
          </select>
        </FormField>
        <FormField label="Part"><input type="number" min={1} max={7} value={draft.part} onChange={(event) => onDraftChange((current) => ({ ...current, part: Number(event.target.value) }))} /></FormField>
        <FormField label="Type">
          <select value={draft.group_type} onChange={(event) => onDraftChange((current) => ({ ...current, group_type: event.target.value as ApiQuestionGroup["group_type"] }))}>
            <option value="conversation">conversation</option>
            <option value="talk">talk</option>
            <option value="text_completion">text_completion</option>
            <option value="reading_passage">reading_passage</option>
          </select>
        </FormField>
      </div>
      <FormField label="Shared passage"><textarea value={draft.passage_text} onChange={(event) => onDraftChange((current) => ({ ...current, passage_text: event.target.value }))} /></FormField>
      <FormField label="Shared transcript"><textarea value={draft.transcript} onChange={(event) => onDraftChange((current) => ({ ...current, transcript: event.target.value }))} /></FormField>
      <GradientButton onClick={onCreate}>Create Group</GradientButton>
      <div className="tool-existing-list">
        {groups.slice(0, 8).map((group) => (
          <div className="admin-v2-existing-row" key={group.id}>
            <span>#{group.id} · {group.skill} · Part {group.part}</span>
            <strong>{group.title || group.group_type}</strong>
            <small>{group.questions_count ?? 0} questions</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="admin-panel-heading">
      <h2>{title}</h2>
      {meta && <span>{meta}</span>}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="admin-v2-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ValidationRow({ item }: { item: ValidationItem }) {
  const Icon = item.status === "pass" ? CheckCircle2 : item.status === "warning" ? AlertTriangle : XCircle;
  return (
    <div className={`validation-row ${item.status}`} title={item.message}>
      <Icon size={16} />
      <span>{item.label}</span>
    </div>
  );
}

interface ValidationItem {
  key: string;
  label: string;
  status: ValidationStatus;
  message: string;
}

function validateQuestionDraft(question?: Question & { answers?: Answer[] }): ValidationItem[] {
  if (!question) return [];
  const draftAnswers = question.answers ?? [];
  const correctCount = draftAnswers.filter((answer) => answer.isCorrect).length;
  const orders = draftAnswers.map((answer) => answer.displayOrder);
  const skillPartValid = question.skill === "listening" ? question.part >= 1 && question.part <= 4 : question.part >= 5 && question.part <= 7;

  return [
    { key: "skill_part", label: "Skill matches Part", status: skillPartValid ? "pass" : "error", message: "Listening uses Part 1-4, Reading uses Part 5-7." },
    { key: "correct_answer", label: "Exactly 1 correct answer", status: correctCount === 1 ? "pass" : "error", message: `${correctCount} correct answers selected.` },
    { key: "answer_count", label: "4 answer options", status: draftAnswers.length >= 4 ? "pass" : "warning", message: "TOEIC questions usually need 4 options, Part 2 may use 3." },
    { key: "order_unique", label: "Answer order unique", status: new Set(orders).size === orders.length ? "pass" : "error", message: "Display order cannot be duplicated." },
    { key: "explanation", label: "Has explanation", status: question.explanation?.trim() ? "pass" : "warning", message: "Add a learner-friendly explanation." },
    { key: "listening_media", label: "Has transcript/audio", status: question.skill !== "listening" || question.transcript || question.audioUrl ? "pass" : "warning", message: "Listening questions should include transcript or audio." },
    { key: "passage", label: "Has passage if Part 6/7", status: ![6, 7].includes(question.part) || question.passageText || question.questionGroupId ? "pass" : "warning", message: "Part 6/7 should have passage context." },
    { key: "question_text", label: "Has question text if Part 5", status: question.part !== 5 || Boolean(question.questionText?.trim()) ? "pass" : "error", message: "Part 5 needs question text." },
    { key: "difficulty", label: "Has difficulty score", status: question.difficultyScore >= 1 && question.difficultyScore <= 100 ? "pass" : "error", message: "Difficulty score must be 1-100." },
    { key: "time", label: "Content length OK", status: question.estimatedTimeSeconds >= 5 && question.estimatedTimeSeconds <= 3600 ? "pass" : "warning", message: "Estimated time should be realistic." },
  ];
}

function createBlankQuestion(): Question & { answers?: Answer[] } {
  return {
    id: 0,
    skill: "reading",
    part: 5,
    questionType: "incomplete_sentence",
    questionText: "",
    explanation: "",
    difficultyLevel: "medium",
    difficultyScore: 55,
    estimatedTimeSeconds: 30,
    correctRate: 0,
    attemptCount: 0,
    correctCount: 0,
    isActive: true,
    answers: createDefaultAnswers(0),
  };
}

function createDefaultAnswers(questionId: number, correctText = ""): Answer[] {
  return [0, 1, 2, 3].map((index) => ({
    id: -(questionId * 10 + index + 1),
    questionId,
    answerText: index === 0 ? correctText : "",
    isCorrect: index === 0,
    displayOrder: index + 1,
  }));
}

function withEditableAnswers(question: Question): Question & { answers?: Answer[] } {
  const existingAnswers = question.answers ?? [];
  return {
    ...question,
    answers: existingAnswers.length ? [...existingAnswers].sort((a, b) => a.displayOrder - b.displayOrder) : createDefaultAnswers(question.id),
  };
}
