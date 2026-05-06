const RATE_LIMIT_STORAGE_KEY = "toeic-security-rate-limits";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Record<string, RateLimitBucket>;

export type ValidationResult = {
  ok: boolean;
  message?: string;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function sanitizePlainText(value: string, maxLength = 500) {
  return value
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function validateEmail(email: string): ValidationResult {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, message: "Email is required." };
  if (normalized.length > 254) return { ok: false, message: "Email is too long." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { ok: false, message: "Please enter a valid email." };
  return { ok: true };
}

export function validatePasswordPolicy(password: string): ValidationResult {
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { ok: false, message: "Password must include both letters and numbers." };
  }
  if (password.length > 128) return { ok: false, message: "Password is too long." };
  return { ok: true };
}

export function validateAuthPayload(payload: { email: string; password: string; name?: string }, mode: "login" | "register"): ValidationResult {
  const email = validateEmail(payload.email);
  if (!email.ok) return email;

  const password = validatePasswordPolicy(payload.password);
  if (!password.ok) return password;

  if (mode === "register") {
    const cleanName = sanitizePlainText(payload.name ?? "", 80);
    if (cleanName.length < 2) return { ok: false, message: "Name must be at least 2 characters." };
  }

  return { ok: true };
}

export function checkClientRateLimit(key: string, limit: number, windowMs: number): ValidationResult {
  const now = Date.now();
  const store = readRateLimitStore();
  const bucket = store[key];

  if (!bucket || bucket.resetAt <= now) {
    store[key] = { count: 1, resetAt: now + windowMs };
    writeRateLimitStore(store);
    return { ok: true };
  }

  if (bucket.count >= limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    return { ok: false, message: `Too many attempts. Try again in ${seconds}s.` };
  }

  store[key] = { ...bucket, count: bucket.count + 1 };
  writeRateLimitStore(store);
  return { ok: true };
}

function readRateLimitStore(): RateLimitStore {
  try {
    return JSON.parse(localStorage.getItem(RATE_LIMIT_STORAGE_KEY) ?? "{}") as RateLimitStore;
  } catch {
    return {};
  }
}

function writeRateLimitStore(store: RateLimitStore) {
  localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(store));
}
