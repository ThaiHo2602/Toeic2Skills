-- TOEIC2Skills MySQL full schema + seed data
-- Import this file in phpMyAdmin or MySQL CLI.
-- Demo accounts:
-- learner@example.com / Password1
-- admin@example.com / Admin1234

CREATE DATABASE IF NOT EXISTS toeic2skills
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE toeic2skills;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS vocabulary_collection;
DROP TABLE IF EXISTS user_answers;
DROP TABLE IF EXISTS user_attempts;
DROP TABLE IF EXISTS feature_access_logs;
DROP TABLE IF EXISTS payment_transactions;
DROP TABLE IF EXISTS user_daily_usages;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  target_score INT NOT NULL DEFAULT 650,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE plans (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE questions (
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
  updated_at DATETIME NOT NULL,
  INDEX idx_questions_skill_part (skill, part),
  INDEX idx_questions_difficulty (difficulty_level, difficulty_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE answers (
  id INT PRIMARY KEY,
  question_id INT NOT NULL,
  answer_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  display_order TINYINT NOT NULL,
  explanation TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_answers_question (question_id),
  CONSTRAINT fk_answers_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscriptions (
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
  CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_daily_usages (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  usage_date DATE NOT NULL,
  test_count INT NOT NULL DEFAULT 0,
  ai_explanation_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_usage_user_date (user_id, usage_date),
  CONSTRAINT fk_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_transactions (
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
  updated_at DATETIME NOT NULL,
  INDEX idx_payment_user (user_id),
  CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE feature_access_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  feature_key VARCHAR(80) NOT NULL,
  allowed BOOLEAN NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_feature_logs_user_key (user_id, feature_key, created_at),
  CONSTRAINT fk_feature_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_attempts (
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
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_answers (
  id CHAR(36) PRIMARY KEY,
  user_attempt_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  question_id INT NOT NULL,
  selected_answer_id INT NULL,
  is_correct BOOLEAN NOT NULL,
  answered_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_user_answers_attempt (user_attempt_id),
  CONSTRAINT fk_user_answers_attempt FOREIGN KEY (user_attempt_id) REFERENCES user_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_answers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_answers_question FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT fk_user_answers_answer FOREIGN KEY (selected_answer_id) REFERENCES answers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vocabulary_collection (
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
  CONSTRAINT fk_vocab_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_vocab_question FOREIGN KEY (source_question_id) REFERENCES questions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO plans (
  id, name, slug, price, currency, duration_days, daily_test_limit, ai_explanation_limit,
  has_ai_features, has_weakness_analysis, has_adaptive_learning, has_advanced_dashboard,
  is_active, created_at, updated_at
) VALUES
(1, 'Free', 'free', 0, 'VND', NULL, 5, 0, false, false, false, false, true, NOW(), NOW()),
(2, 'Premium Monthly', 'premium_monthly', 99000, 'VND', 30, NULL, NULL, true, true, true, true, true, NOW(), NOW()),
(3, 'Premium Quarterly', 'premium_quarterly', 249000, 'VND', 90, NULL, NULL, true, true, true, true, true, NOW(), NOW()),
(4, 'Premium Yearly', 'premium_yearly', 799000, 'VND', 365, NULL, NULL, true, true, true, true, true, NOW(), NOW());

-- bcrypt hashes:
-- Password1 for learner@example.com
-- Admin1234 for admin@example.com
INSERT INTO users (id, name, email, password_hash, role, target_score, created_at, updated_at) VALUES
('11111111-1111-4111-8111-111111111111', 'Demo Learner', 'learner@example.com', '$2a$12$ye3mEmLQCAruFYCPegvc3OaO0iXfI6f0LdHgfuknl.12IB0KvkVle', 'user', 650, NOW(), NOW()),
('22222222-2222-4222-8222-222222222222', 'Admin', 'admin@example.com', '$2a$12$FFsjIbDG/M5BLi4ShpWUl./w04aFkvf.bhy3zz9OheIWRk3ZtDzJe', 'admin', 900, NOW(), NOW());

INSERT INTO questions (
  id, skill, part, question_type, question_text, passage_text, transcript, audio_url, image_url,
  explanation, grammar_formula, vocabulary_hints, difficulty_level, difficulty_score,
  estimated_time_seconds, attempt_count, correct_count, correct_rate, is_active, created_at, updated_at
) VALUES
(1, 'listening', 1, 'photograph', 'What is happening in the picture?', NULL, 'A woman is arranging documents on a desk.', 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg', 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80', 'The photo shows office work with papers on a desk.', NULL, NULL, 'easy', 28, 35, 0, 0, 0, true, NOW(), NOW()),
(2, 'reading', 5, 'incomplete_sentence', 'The manager reviewed the report very ____ before the meeting.', NULL, NULL, NULL, NULL, 'An adverb is needed to modify the verb reviewed.', JSON_OBJECT('title','Word form','pattern','Verb + adverb','example','The manager reviewed the report carefully.'), JSON_ARRAY(JSON_OBJECT('word','review','meaning','xem xét / đánh giá','level','Office'), JSON_OBJECT('word','carefully','meaning','một cách cẩn thận','level','Word form')), 'easy', 30, 30, 0, 0, 0, true, NOW(), NOW()),
(3, 'reading', 7, 'reading_detail', 'What should Ms. Tran bring to the registration desk?', 'Dear Ms. Tran, Thank you for registering for the Regional Sales Conference. The opening session begins at 9:00 A.M. in Hall B. Please bring your confirmation email to the registration desk.', NULL, NULL, NULL, 'The email asks her to bring the confirmation email.', JSON_OBJECT('title','Reading evidence','pattern','Question keyword -> scan passage -> match paraphrase','example','bring to the registration desk -> confirmation email'), JSON_ARRAY(JSON_OBJECT('word','registration desk','meaning','bàn đăng ký','level','Event'), JSON_OBJECT('word','confirmation email','meaning','email xác nhận','level','Email')), 'medium', 58, 60, 0, 0, 0, true, NOW(), NOW());

INSERT INTO answers (id, question_id, answer_text, is_correct, display_order, explanation, created_at, updated_at) VALUES
(101, 1, 'A woman is arranging documents on a desk.', true, 1, NULL, NOW(), NOW()),
(102, 1, 'A man is painting a wall.', false, 2, NULL, NOW(), NOW()),
(103, 1, 'People are boarding a bus.', false, 3, NULL, NOW(), NOW()),
(104, 1, 'A chef is preparing food.', false, 4, NULL, NOW(), NOW()),
(201, 2, 'careful', false, 1, NULL, NOW(), NOW()),
(202, 2, 'carefully', true, 2, NULL, NOW(), NOW()),
(203, 2, 'care', false, 3, NULL, NOW(), NOW()),
(204, 2, 'caring', false, 4, NULL, NOW(), NOW()),
(301, 3, 'Her confirmation email', true, 1, NULL, NOW(), NOW()),
(302, 3, 'A printed invoice', false, 2, NULL, NOW(), NOW()),
(303, 3, 'A sales report', false, 3, NULL, NOW(), NOW()),
(304, 3, 'Her passport', false, 4, NULL, NOW(), NOW());
