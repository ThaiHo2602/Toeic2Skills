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
  mysql: {
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? "root",
    password: process.env.MYSQL_PASSWORD ?? "",
    database: process.env.MYSQL_DATABASE ?? "toeic2skills",
  },
};
