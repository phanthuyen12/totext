import express from "express";
import cors from "cors";
import { config } from "./config/env.js";
import { connectSqlite } from "./config/sqliteClient.js";
import { router as jobsRouter } from "./routes/jobs.js";
import { router as voicesRouter } from "./routes/voices.js";
import { router as healthRouter } from "./routes/health.js";
import { startAllWorkers } from "./workers/index.js";
import { startCleanup } from "./services/cleanupService.js";

const app = express();
// Job state is live data; never let browsers/proxies revalidate a stale job
// snapshot and turn a polling request into 304 Not Modified.
app.set("etag", false);

app.use(cors({ origin: config.frontendOrigin }));
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use(express.json());

// Logs every request so we can see from the terminal whether the frontend
// actually hit the backend at all, and how long each call took.
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.use("/api/health", healthRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/voices", voicesRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.httpStatus || 500).json({ error: err.message || "Internal error" });
});

async function main() {
  connectSqlite();
  console.log(`[sqlite] connected to ${config.sqlitePath}`);
  startCleanup();

  app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
    startAllWorkers();
  });
}

main().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
