import "dotenv/config";
import path from "node:path";

const root = process.cwd();

export const config = {
  port: Number(process.env.PORT || 4000),
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",

  sqlitePath: path.resolve(root, process.env.SQLITE_PATH || "storage/voicetext.sqlite3"),

  resonaApiBase: process.env.RESONA_API_BASE || "https://resona.live",
  resonaApiKey: process.env.RESONA_API_KEY || "",
  resonaRequestTimeoutMs: Number(process.env.RESONA_REQUEST_TIMEOUT_MS || 120000),

  segmentSeconds: Number(process.env.SEGMENT_SECONDS || 60),

  whisperPython: process.env.WHISPER_PYTHON || "python3",
  whisperModel: process.env.WHISPER_MODEL || "small",
  whisperDevice: process.env.WHISPER_DEVICE || "cpu",
  whisperComputeType: process.env.WHISPER_COMPUTE_TYPE || "int8",

  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || "storage/uploads"),
  outputDir: path.resolve(root, process.env.OUTPUT_DIR || "storage/outputs"),

  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
};
