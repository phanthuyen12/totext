import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config/env.js";
import * as jobStore from "./jobStore.js";
import { videoQueue, transcribeQueue, ttsQueue, mergeQueue } from "../queues/index.js";

const RETENTION_MS = 60 * 60 * 1000;
const ACTIVE_SEGMENT_STATES = new Set([
  "cut", "extracting_audio", "transcribing", "tts_queued", "tts_processing",
]);

function isActive(job, segments) {
  return ["queued", "cutting"].includes(job.stage) ||
    job.finalVideoStatus === "processing" ||
    segments.some((segment) => ACTIVE_SEGMENT_STATES.has(segment.status));
}

async function removeQueuedWork(jobId) {
  for (const queue of [videoQueue, transcribeQueue, ttsQueue, mergeQueue]) {
    const queued = await queue.getJobs(["waiting", "delayed", "failed", "prioritized"]);
    for (const item of queued) {
      if (item?.data?.jobId === jobId) await item.remove().catch(() => {});
    }
  }
}

async function removeJobFiles(jobId) {
  for (const root of [config.uploadDir, config.outputDir]) {
    const target = path.resolve(root, jobId);
    if (target.startsWith(path.resolve(root) + path.sep)) {
      await fs.rm(target, { recursive: true, force: true });
    }
  }
}

export async function deleteJobAndFiles(jobId) {
  await removeQueuedWork(jobId);
  await jobStore.deleteJob(jobId);
  await removeJobFiles(jobId);
}

/** Remove inactive jobs one hour after their last recorded activity. */
export async function cleanupExpiredJobs() {
  const cutoff = Date.now() - RETENTION_MS;
  const jobs = await jobStore.listJobs(10000);
  let removed = 0;

  for (const job of jobs) {
    const lastActivity = Date.parse(job.updatedAt || job.createdAt || "");
    if (!Number.isFinite(lastActivity) || lastActivity > cutoff) continue;
    const segments = await jobStore.getAllSegments(job.id);
    if (isActive(job, segments)) continue;
    await deleteJobAndFiles(job.id);
    removed += 1;
  }

  if (removed) console.log(`[cleanup] removed ${removed} job(s) older than one hour`);
}

export function startCleanup() {
  const run = () => cleanupExpiredJobs().catch((err) => {
    console.error("[cleanup] failed:", err.message);
  });
  run();
  const timer = setInterval(run, 5 * 60 * 1000);
  timer.unref?.();
  return timer;
}
