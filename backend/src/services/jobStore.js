import { getDb } from "../config/sqliteClient.js";

// Persistent domain data (jobs + segments) lives in SQLite — Redis is kept
// strictly for the BullMQ queues and the /voices response cache.
//
// better-sqlite3 is synchronous; every function below is still declared
// `async` purely so call sites (routes/workers, written against a Mongo-era
// async jobStore) don't need to change — awaiting a plain value resolves
// immediately.

const JOB_COLUMNS = [
  "id", "type", "originalFilename", "filePath", "stage", "segmentCount",
  "durationSeconds", "finalVideoStatus", "finalVideoPath", "error",
  "createdAt", "updatedAt",
];

const SEGMENT_COLUMNS = [
  "jobId", "segIndex", "kind", "sourcePath", "startSec", "endSec", "status",
  "language", "transcriptText", "editedText", "srtPath", "audioPath",
  "transcriptCues",
  "ttsRequestId", "ttsVoiceId", "ttsAudioPath", "ttsAudioUrl", "ttsProgress",
  "error", "createdAt", "updatedAt",
];

function pickColumns(obj, columns) {
  const out = {};
  for (const col of columns) {
    if (obj[col] !== undefined) out[col] = obj[col];
  }
  return out;
}

// jobs -----------------------------------------------------------------

export async function createJob(job) {
  const now = new Date().toISOString();
  const row = pickColumns(
    { ...job, createdAt: job.createdAt || now, updatedAt: now },
    JOB_COLUMNS
  );
  const cols = Object.keys(row);
  getDb()
    .prepare(`INSERT INTO jobs (${cols.join(", ")}) VALUES (${cols.map((c) => `@${c}`).join(", ")})`)
    .run(row);
  return row;
}

export async function updateJob(jobId, fields) {
  const row = pickColumns(
    { ...fields, id: jobId, updatedAt: new Date().toISOString() },
    JOB_COLUMNS
  );
  const sets = Object.keys(row)
    .filter((c) => c !== "id")
    .map((c) => `${c} = @${c}`)
    .join(", ");
  getDb().prepare(`UPDATE jobs SET ${sets} WHERE id = @id`).run(row);
}

export async function getJob(jobId) {
  return getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) || null;
}

export async function listJobs(limit = 50) {
  return getDb()
    .prepare("SELECT * FROM jobs ORDER BY createdAt DESC LIMIT ?")
    .all(limit);
}

export async function deleteJob(jobId) {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM segments WHERE jobId = ?").run(jobId);
    db.prepare("DELETE FROM jobs WHERE id = ?").run(jobId);
  })();
}

// segments ---------------------------------------------------------------

export async function createSegment(jobId, index, segment) {
  const now = new Date().toISOString();
  const row = pickColumns(
    { ...segment, jobId, segIndex: Number(index), createdAt: now, updatedAt: now },
    SEGMENT_COLUMNS
  );
  const cols = Object.keys(row);
  getDb()
    .prepare(`INSERT INTO segments (${cols.join(", ")}) VALUES (${cols.map((c) => `@${c}`).join(", ")})`)
    .run(row);
}

export async function updateSegment(jobId, index, fields) {
  const row = pickColumns(
    { ...fields, jobId, segIndex: Number(index), updatedAt: new Date().toISOString() },
    SEGMENT_COLUMNS
  );
  const sets = Object.keys(row)
    .filter((c) => c !== "jobId" && c !== "segIndex")
    .map((c) => `${c} = @${c}`)
    .join(", ");
  getDb()
    .prepare(`UPDATE segments SET ${sets} WHERE jobId = @jobId AND segIndex = @segIndex`)
    .run(row);
  // Keep the parent job's retention timer fresh while transcription or TTS is active.
  await updateJob(jobId, {});
}

function toSegmentJson(row) {
  if (!row) return null;
  const { segIndex, ...rest } = row;
  return { ...rest, index: segIndex };
}

export async function getSegment(jobId, index) {
  const row = getDb()
    .prepare("SELECT * FROM segments WHERE jobId = ? AND segIndex = ?")
    .get(jobId, Number(index));
  return toSegmentJson(row);
}

export async function getAllSegments(jobId) {
  const rows = getDb()
    .prepare("SELECT * FROM segments WHERE jobId = ? ORDER BY segIndex ASC")
    .all(jobId);
  return rows.map(toSegmentJson);
}
