-- Subscription system schema reference for Laravel migrations or Node.js migration tools.
-- The current project is React + Vite only, so this file is the backend-ready schema contract.

CREATE TABLE plans (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'VND',
  duration_days INT NULL,
  daily_test_limit INT NULL,
  ai_explanation_limit INT NULL,
  has_ai_features BOOLEAN NOT NULL DEFAULT FALSE,
  has_weakness_analysis BOOLEAN NOT NULL DEFAULT FALSE,
  has_adaptive_learning BOOLEAN NOT NULL DEFAULT FALSE,
  has_advanced_dashboard BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE subscriptions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  status ENUM('active', 'expired', 'cancelled', 'pending') NOT NULL DEFAULT 'pending',
  started_at DATETIME NOT NULL,
  expires_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT subscriptions_plan_id_fk FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE INDEX subscriptions_user_status_idx ON subscriptions(user_id, status, expires_at);

CREATE TABLE user_daily_usages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  usage_date DATE NOT NULL,
  test_count INT NOT NULL DEFAULT 0,
  ai_explanation_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY user_daily_usages_user_date_unique (user_id, usage_date)
);

CREATE TABLE feature_access_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  allowed BOOLEAN NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL
);

CREATE INDEX feature_access_logs_user_feature_idx ON feature_access_logs(user_id, feature_key, created_at);

CREATE TABLE payment_transactions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'VND',
  provider VARCHAR(50) NOT NULL,
  provider_transaction_id VARCHAR(255) NULL,
  status ENUM('pending', 'success', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT payment_transactions_plan_id_fk FOREIGN KEY (plan_id) REFERENCES plans(id)
);

INSERT INTO plans (
  name,
  slug,
  price,
  currency,
  duration_days,
  daily_test_limit,
  ai_explanation_limit,
  has_ai_features,
  has_weakness_analysis,
  has_adaptive_learning,
  has_advanced_dashboard,
  is_active,
  created_at,
  updated_at
) VALUES
('Free', 'free', 0, 'VND', NULL, 5, 0, FALSE, FALSE, FALSE, FALSE, TRUE, NOW(), NOW()),
('Premium Monthly', 'premium_monthly', 99000, 'VND', 30, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, NOW(), NOW()),
('Premium Quarterly', 'premium_quarterly', 249000, 'VND', 90, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, NOW(), NOW()),
('Premium Yearly', 'premium_yearly', 799000, 'VND', 365, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
