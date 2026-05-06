import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { config } from "./config.js";
import { apiRateLimit, errorHandler, notFound } from "./middleware.js";
import { router } from "./routes.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.frontendOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("CORS origin denied."));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(config.cookieSecret));
  app.use("/uploads", express.static(path.resolve("uploads"), { fallthrough: false, immutable: true, maxAge: "7d" }));
  app.use("/api", apiRateLimit, router);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
