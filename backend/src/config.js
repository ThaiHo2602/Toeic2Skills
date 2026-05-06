import "dotenv/config";

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8000),
  frontendOrigins: (process.env.FRONTEND_ORIGINS ?? "http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  cookieName: process.env.SESSION_COOKIE_NAME ?? "toeic2skills_session",
  cookieSecret: process.env.COOKIE_SECRET ?? "dev-only-change-me",
  isProduction: process.env.NODE_ENV === "production",
};
