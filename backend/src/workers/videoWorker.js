import path from "node:path";
import { Worker } from "bullmq";
import { createRedisConnection } from "../config/redisClient.js";
import { config } from "../config/env.js";
import * as ffmpegService from "../services/ffmpegService.js";
import * as jobStore from "../services/jobStore.js";
import { enqueueTranscribe } from "../queues/index.js";
import { workerLockOptions } from "./workerOptions.js";

async function handleCutVideo(job) {
  const { jobId, filePath } = job.data;

  await jobStore.updateJob(jobId, { stage: "cutting" });

  try {
    const durationSeconds = await ffmpegService.getDurationSeconds(filePath);
    const outDir = path.join(config.outputDir, jobId, "chunks");
    const chunkPaths = await ffmpegService.splitVideoIntoSegments(
      filePath,
      outDir,
      config.segmentSeconds
    );

    let startSec = 0;
    for (let i = 0; i < chunkPaths.length; i++) {
      const chunkDuration = await ffmpegService.getDurationSeconds(chunkPaths[i]);
      const endSec = Math.min(durationSeconds, startSec + chunkDuration);
      await jobStore.createSegment(jobId, i, {
        jobId,
        index: i,
        kind: "video-chunk",
        sourcePath: chunkPaths[i],
        startSec,
        endSec,
        status: "cut",
      });
      await enqueueTranscribe({ jobId, segmentIndex: i });
      startSec = endSec;
    }

    await jobStore.updateJob(jobId, {
      stage: "ready",
      segmentCount: chunkPaths.length,
      durationSeconds,
    });
  } catch (err) {
    await jobStore.updateJob(jobId, { stage: "failed", error: err.message });
    throw err;
  }
}

export function startVideoWorker() {
  const worker = new Worker(
    "video-split",
    async (job) => handleCutVideo(job),
    { connection: createRedisConnection(), concurrency: 1, ...workerLockOptions }
  );
  worker.on("failed", async (job, err) => {
    console.error(`[video-worker] job ${job?.id} failed:`, err.message);
    if (job && ((job.attemptsMade || 0) >= (job.opts?.attempts || 1) || /stalled/i.test(err.message))) {
      await jobStore.updateJob(job.data.jobId, { stage: "failed", error: err.message }).catch(() => {});
    }
  });
  return worker;
}
