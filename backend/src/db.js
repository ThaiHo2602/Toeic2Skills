import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { answers, plans, questions } from "./data.js";

let pool;
let available = false;

export function isDatabaseAvailable() {
  return available;
}

export function getPool() {
  return pool;
}

export async function initDatabase() {
  try {
    const bootstrap = await mysql.createConnection({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      multipleStatements: true,
    });
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${config.mysql.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await bootstrap.end();

    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      multipleStatements: true,
    });

    await createSchema();
    await seedDatabase();
    available = true;
    console.log(`MySQL connected: ${config.mysql.database}`);
  } catch (error) {
    available = false;
    console.warn(`MySQL unavailable, backend will use in-memory store only: ${error.message}`);
  }
}

export async function query(sql, params = []) {
  if (!available) throw new Error("Database is not available.");
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function insert(sql, params = []) {
  if (!available) throw new Error("Database is not available.");
  const [result] = await pool.execute(sql, params);
  return result;
}

export async function hydrateStoreFromDatabase(store) {
  if (!available) return;
  const [users] = await pool.query("SELECT * FROM users");
  const [planRows] = await pool.query("SELECT * FROM plans");
  const [questionRows] = await pool.query("SELECT * FROM questions");
  const [answerRows] = await pool.query("SELECT * FROM answers");
  const [subscriptionRows] = await pool.query("SELECT * FROM subscriptions");
  const [usageRows] = await pool.query("SELECT * FROM user_daily_usages");
  const [attemptRows] = await pool.query("SELECT * FROM user_attempts");

  store.users = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    passwordHash: user.password_hash,
    role: user.role,
    targetScore: user.target_score,
    createdAt: fromMysqlDate(user.created_at),
    updatedAt: fromMysqlDate(user.updated_at),
  }));

  store.plans = planRows.map((plan) => ({
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    price: plan.price,
    currency: plan.currency,
    durationDays: plan.duration_days,
    dailyTestLimit: plan.daily_test_limit,
    aiExplanationLimit: plan.ai_explanation_limit,
    hasAiFeatures: Boolean(plan.has_ai_features),
    hasWeaknessAnalysis: Boolean(plan.has_weakness_analysis),
    hasAdaptiveLearning: Boolean(plan.has_adaptive_learning),
    hasAdvancedDashboard: Boolean(plan.has_advanced_dashboard),
    isActive: Boolean(plan.is_active),
    createdAt: fromMysqlDate(plan.created_at),
    updatedAt: fromMysqlDate(plan.updated_at),
  }));

  store.questions = questionRows.map((question) => ({
    id: question.id,
    skill: question.skill,
    part: question.part,
    questionType: question.question_type,
    questionText: question.question_text,
    passageText: question.passage_text,
    transcript: question.transcript,
    audioUrl: question.audio_url,
    imageUrl: question.image_url,
    explanation: question.explanation,
    grammarFormula: parseJson(question.grammar_formula),
    vocabularyHints: parseJson(question.vocabulary_hints),
    difficultyLevel: question.difficulty_level,
    difficultyScore: question.difficulty_score,
    estimatedTimeSeconds: question.estimated_time_seconds,
    attemptCount: question.attempt_count,
    correctCount: question.correct_count,
    correctRate: Number(question.correct_rate),
    isActive: Boolean(question.is_active),
    createdAt: fromMysqlDate(question.created_at),
    updatedAt: fromMysqlDate(question.updated_at),
  }));

  store.answers = answerRows.map((answer) => ({
    id: answer.id,
    questionId: answer.question_id,
    answerText: answer.answer_text,
    isCorrect: Boolean(answer.is_correct),
    displayOrder: answer.display_order,
    explanation: answer.explanation,
    createdAt: fromMysqlDate(answer.created_at),
    updatedAt: fromMysqlDate(answer.updated_at),
  }));

  store.subscriptions = subscriptionRows.map((subscription) => ({
    id: subscription.id,
    userId: subscription.user_id,
    planId: subscription.plan_id,
    status: subscription.status,
    startedAt: fromMysqlDate(subscription.started_at),
    expiresAt: fromMysqlDate(subscription.expires_at),
    cancelledAt: fromMysqlDate(subscription.cancelled_at),
    createdAt: fromMysqlDate(subscription.created_at),
    updatedAt: fromMysqlDate(subscription.updated_at),
  }));

  store.dailyUsages = usageRows.map((usage) => ({
    id: usage.id,
    userId: usage.user_id,
    usageDate: typeof usage.usage_date === "string" ? usage.usage_date : usage.usage_date.toISOString().slice(0, 10),
    testCount: usage.test_count,
    aiExplanationCount: usage.ai_explanation_count,
    createdAt: fromMysqlDate(usage.created_at),
    updatedAt: fromMysqlDate(usage.updated_at),
  }));

  store.attempts = attemptRows.map((attempt) => ({
    id: attempt.id,
    userId: attempt.user_id,
    mode: attempt.mode,
    adaptive: Boolean(attempt.adaptive),
    status: attempt.status,
    startedAt: fromMysqlDate(attempt.started_at),
    submittedAt: fromMysqlDate(attempt.submitted_at),
    questionIds: parseJson(attempt.question_ids) ?? [],
    totalQuestions: attempt.total_questions,
    correctCount: attempt.correct_count,
    accuracy: Number(attempt.accuracy),
    estimatedListeningScore: attempt.estimated_listening_score,
    estimatedReadingScore: attempt.estimated_reading_score,
    estimatedTotalScore: attempt.estimated_total_score,
    scoreConfidence: attempt.score_confidence === null ? null : Number(attempt.score_confidence),
  }));
}

async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('user','admin') NOT NULL DEFAULT 'user',
      target_score INT NOT NULL DEFAULT 650,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      slug VARCHAR(60) NOT NULL UNIQUE,
      price INT NOT NULL,
      currency VARCHAR(10) NOT NULL,
      duration_days INT NULL,
      daily_test_limit INT NULL,
      ai_explanation_limit INT NULL,
      has_ai_features BOOLEAN NOT NULL DEFAULT false,
      has_weakness_analysis BOOLEAN NOT NULL DEFAULT false,
      has_adaptive_learning BOOLEAN NOT NULL DEFAULT false,
      has_advanced_dashboard BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INT PRIMARY KEY,
      skill ENUM('listening','reading') NOT NULL,
      part TINYINT NOT NULL,
      question_type VARCHAR(80) NOT NULL,
      question_text TEXT NULL,
      passage_text LONGTEXT NULL,
      transcript LONGTEXT NULL,
      audio_url VARCHAR(500) NULL,
      image_url VARCHAR(500) NULL,
      explanation LONGTEXT NOT NULL,
      grammar_formula JSON NULL,
      vocabulary_hints JSON NULL,
      difficulty_level ENUM('easy','medium','hard') NOT NULL,
      difficulty_score TINYINT NOT NULL,
      estimated_time_seconds INT NOT NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      correct_count INT NOT NULL DEFAULT 0,
      correct_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INT PRIMARY KEY,
      question_id INT NOT NULL,
      answer_text TEXT NOT NULL,
      is_correct BOOLEAN NOT NULL DEFAULT false,
      display_order TINYINT NOT NULL,
      explanation TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      CONSTRAINT fk_answers_question FOREIGN KEY (question_id) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      plan_id INT NOT NULL,
      status ENUM('active','expired','cancelled','pending') NOT NULL,
      started_at DATETIME NOT NULL,
      expires_at DATETIME NULL,
      cancelled_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_subscriptions_user_status (user_id, status),
      CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
    );

    CREATE TABLE IF NOT EXISTS user_daily_usages (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      usage_date DATE NOT NULL,
      test_count INT NOT NULL DEFAULT 0,
      ai_explanation_count INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uq_usage_user_date (user_id, usage_date),
      CONSTRAINT fk_usage_user FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      plan_id INT NOT NULL,
      amount INT NOT NULL,
      currency VARCHAR(10) NOT NULL,
      provider VARCHAR(40) NOT NULL,
      provider_transaction_id VARCHAR(120) NOT NULL,
      status ENUM('pending','success','failed','refunded') NOT NULL,
      paid_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feature_access_logs (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      feature_key VARCHAR(80) NOT NULL,
      allowed BOOLEAN NOT NULL,
      reason VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_attempts (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      mode ENUM('practice','mini_test','full_test','placement') NOT NULL,
      adaptive BOOLEAN NOT NULL DEFAULT false,
      status ENUM('in_progress','submitted','abandoned','expired') NOT NULL,
      started_at DATETIME NOT NULL,
      submitted_at DATETIME NULL,
      question_ids JSON NOT NULL,
      total_questions INT NOT NULL,
      correct_count INT NOT NULL DEFAULT 0,
      accuracy DECIMAL(5,2) NOT NULL DEFAULT 0,
      estimated_listening_score INT NULL,
      estimated_reading_score INT NULL,
      estimated_total_score INT NULL,
      score_confidence DECIMAL(5,2) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_attempts_user_status (user_id, status),
      CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_answers (
      id CHAR(36) PRIMARY KEY,
      user_attempt_id CHAR(36) NOT NULL,
      user_id CHAR(36) NOT NULL,
      question_id INT NOT NULL,
      selected_answer_id INT NULL,
      is_correct BOOLEAN NOT NULL,
      answered_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      CONSTRAINT fk_user_answers_attempt FOREIGN KEY (user_attempt_id) REFERENCES user_attempts(id)
    );

    CREATE TABLE IF NOT EXISTS vocabulary_collection (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      word VARCHAR(180) NOT NULL,
      meaning VARCHAR(500) NOT NULL,
      level VARCHAR(80) NOT NULL,
      source_question_id INT NULL,
      part TINYINT NULL,
      mastery TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uq_vocab_user_word (user_id, word),
      CONSTRAINT fk_vocab_user FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

async function seedDatabase() {
  const timestamp = toMysqlDate(new Date());
  for (const plan of plans) {
    await pool.execute(
      `INSERT INTO plans (
        id, name, slug, price, currency, duration_days, daily_test_limit, ai_explanation_limit,
        has_ai_features, has_weakness_analysis, has_adaptive_learning, has_advanced_dashboard,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE name=VALUES(name), price=VALUES(price), updated_at=VALUES(updated_at)`,
      [
        plan.id,
        plan.name,
        plan.slug,
        plan.price,
        plan.currency,
        plan.durationDays,
        plan.dailyTestLimit,
        plan.aiExplanationLimit,
        plan.hasAiFeatures,
        plan.hasWeaknessAnalysis,
        plan.hasAdaptiveLearning,
        plan.hasAdvancedDashboard,
        plan.isActive,
        timestamp,
        timestamp,
      ],
    );
  }

  for (const question of questions) {
    await pool.execute(
      `INSERT INTO questions (
        id, skill, part, question_type, question_text, passage_text, transcript, audio_url, image_url,
        explanation, grammar_formula, vocabulary_hints, difficulty_level, difficulty_score,
        estimated_time_seconds, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE question_text=VALUES(question_text), explanation=VALUES(explanation), updated_at=VALUES(updated_at)`,
      [
        question.id,
        question.skill,
        question.part,
        question.questionType,
        question.questionText ?? null,
        question.passageText ?? null,
        question.transcript ?? null,
        question.audioUrl ?? null,
        question.imageUrl ?? null,
        question.explanation,
        question.grammarFormula ? JSON.stringify(question.grammarFormula) : null,
        question.vocabularyHints ? JSON.stringify(question.vocabularyHints) : null,
        question.difficultyLevel,
        question.difficultyScore,
        question.estimatedTimeSeconds,
        question.isActive,
        timestamp,
        timestamp,
      ],
    );
  }

  for (const answer of answers) {
    await pool.execute(
      `INSERT INTO answers (id, question_id, answer_text, is_correct, display_order, explanation, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE answer_text=VALUES(answer_text), is_correct=VALUES(is_correct), updated_at=VALUES(updated_at)`,
      [answer.id, answer.questionId, answer.answerText, answer.isCorrect, answer.displayOrder, answer.explanation ?? null, timestamp, timestamp],
    );
  }

  await seedUser("Demo Learner", "learner@example.com", "Password1", "user", 650);
  await seedUser("Admin", "admin@example.com", "Admin1234", "admin", 900);
}

async function seedUser(name, email, password, role, targetScore) {
  const existing = await pool.execute("SELECT id FROM users WHERE email = ?", [email]);
  if (existing[0].length) return;
  const timestamp = toMysqlDate(new Date());
  await pool.execute(
    `INSERT INTO users (id, name, email, password_hash, role, target_score, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), name, email, await bcrypt.hash(password, 12), role, targetScore, timestamp, timestamp],
  );
}

export function toMysqlDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

export function fromMysqlDate(value) {
  return value ? new Date(value).toISOString() : null;
}

function parseJson(value) {
  if (!value) return undefined;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
