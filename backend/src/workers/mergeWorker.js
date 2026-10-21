import path from "node:path";
import fs from "node:fs/promises";
import { Worker } from "bullmq";
import { createRedisConnection } from "../config/redisClient.js";
import { config } from "../config/env.js";
import * as mergeService from "../services/mergeService.js";
import * as jobStore from "../services/jobStore.js";
import { workerLockOptions } from "./workerOptions.js";

async function handleMergeVideo(job) {
  const { jobId, musicPath } = job.data;
  const segments = await jobStore.getAllSegments(jobId);

  const notReady = segments.find((s) => s.status !== "tts_done" || !s.ttsAudioPath);
  if (notReady) {
    const err = new Error(`Đoạn ${notReady.index + 1} chưa có giọng nói (${notReady.status})`);
    await jobStore.updateJob(jobId, { finalVideoStatus: "failed", error: err.message });
    throw err;
  }

  try {
    await jobStore.updateJob(jobId, { finalVideoStatus: "processing", error: "" });

    const dubbedDir = path.join(config.outputDir, jobId, "dubbed");
    const dubbedPaths = [];
    // one segment at a time — ffmpeg re-encoding is CPU heavy, avoid overloading the box
    for (const seg of segments) {
      const outPath = path.join(dubbedDir, `segment-${String(seg.index).padStart(3, "0")}.mp4`);
      await mergeService.muxVideoWithVoice(seg.sourcePath, seg.ttsAudioPath, outPath);
      dubbedPaths.push(outPath);
    }

    const concatenatedPath = path.join(config.outputDir, jobId, "final-dubbed-base.mp4");
    await mergeService.concatVideos(dubbedPaths, concatenatedPath);

    const finalPath = path.join(config.outputDir, jobId, "final-dubbed.mp4");
    if (musicPath) {
      await mergeService.addBackgroundMusic(concatenatedPath, musicPath, finalPath);
      await fs.unlink(concatenatedPath).catch(() => {});
    } else {
      await fs.rename(concatenatedPath, finalPath);
    }

    await jobStore.updateJob(jobId, { finalVideoStatus: "done", finalVideoPath: finalPath });
  } catch (err) {
    await jobStore.updateJob(jobId, { finalVideoStatus: "failed", error: err.message });
    throw err;
  }
}

export function startMergeWorker() {
  const worker = new Worker(
    "merge-video",
    async (job) => handleMergeVideo(job),
    { connection: createRedisConnection(), concurrency: 1, ...workerLockOptions }
  );
  worker.on("failed", async (job, err) => {
    console.error(`[merge-worker] job ${job?.id} failed:`, err.message);
    if (job && ((job.attemptsMade || 0) >= (job.opts?.attempts || 1) || /stalled/i.test(err.message))) {
      await jobStore.updateJob(job.data.jobId, { finalVideoStatus: "failed", error: err.message }).catch(() => {});
    }
  });
  return worker;
}
