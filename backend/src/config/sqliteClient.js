import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./env.js";

let db;

export function connectSqlite() {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
  db = new Database(config.sqlitePath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT,
      originalFilename TEXT,
      filePath TEXT,
      stage TEXT,
      segmentCount INTEGER,
      durationSeconds REAL,
      finalVideoStatus TEXT,
      finalVideoPath TEXT,
      error TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS segments (
      jobId TEXT NOT NULL,
      segIndex INTEGER NOT NULL,
      kind TEXT,
      sourcePath TEXT,
      startSec REAL,
      endSec REAL,
      status TEXT,
      language TEXT,
      transcriptText TEXT,
      editedText TEXT,
      srtPath TEXT,
      audioPath TEXT,
      ttsRequestId TEXT,
      ttsVoiceId TEXT,
      ttsAudioPath TEXT,
      ttsAudioUrl TEXT,
      ttsProgress TEXT,
      error TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      PRIMARY KEY (jobId, segIndex)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_createdAt ON jobs (createdAt DESC);
  `);

  addColumnIfMissing("segments", "ttsProgress", "TEXT");
  addColumnIfMissing("segments", "transcriptCues", "TEXT");

  return db;
}

function addColumnIfMissing(table, column, type) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!existing.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function getDb() {
  if (!db) throw new Error("SQLite chưa kết nối — gọi connectSqlite() trước khi dùng jobStore");
  return db;
}

export function pingSqlite() {
  try {
    getDb().prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}
