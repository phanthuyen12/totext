import path from "node:path";
import fs from "node:fs/promises";
import { Worker } from "bullmq";
import { createRedisConnection } from "../config/redisClient.js";
import { config } from "../config/env.js";
import * as ffmpegService from "../services/ffmpegService.js";
import * as whisperService from "../services/whisperService.js";
import * as srtService from "../services/srtService.js";
import * as translationService from "../services/translationService.js";
import * as jobStore from "../services/jobStore.js";
import { workerLockOptions } from "./workerOptions.js";

async function handleTranscribeSegment(job) {
  const { jobId, segmentIndex } = job.data;
  const segment = await jobStore.getSegment(jobId, segmentIndex);
  if (!segment) throw new Error(`Segment ${segmentIndex} of job ${jobId} not found`);

  const segDir = path.join(config.outputDir, jobId, "segments", String(segmentIndex));
  await fs.mkdir(segDir, { recursive: true });
  const audioPath = path.join(segDir, "audio.wav");

  try {
    await jobStore.updateSegment(jobId, segmentIndex, { status: "extracting_audio" });
    await ffmpegService.extractAudioWav(segment.sourcePath, audioPath);

    await jobStore.updateSegment(jobId, segmentIndex, { status: "transcribing" });
    const { language, segments } = await whisperService.transcribe(audioPath);

    // Keep the recognized source text, while using Vietnamese translations for
    // generated subtitles and dubbing whenever the source is another language.
    let translatedSegments = segments;
    if (language && !/^vi(?:[-_]|$)/i.test(language)) {
      try {
        const translatedTexts = await translationService.translateTextsToVietnamese(
          segments.map((cue) => cue.text), language
        );
        translatedSegments = segments.map((cue, index) => ({
          ...cue,
          translatedText: translatedTexts[index],
        }));
      } catch (err) {
        throw new Error(`Không dịch được phụ đề từ ${language} sang tiếng Việt; chưa thể tạo voice: ${err.message}`);
      }
    }

    const transcriptText = srtService.segmentsToPlainText(translatedSegments.map((cue) => ({ ...cue, text: cue.translatedText || cue.text })));
    const srtContent = srtService.segmentsToSrt(translatedSegments.map((cue) => ({ ...cue, text: cue.translatedText || cue.text })));
    const srtPath = path.join(segDir, "subtitle.srt");
    await fs.writeFile(srtPath, srtContent, "utf-8");

    await jobStore.updateSegment(jobId, segmentIndex, {
      audioPath,
      language,
      transcriptText,
      transcriptCues: JSON.stringify(translatedSegments.map(({ start, end, text, translatedText }) => ({
        start,
        end,
        text: translatedText || text,
        ...(translatedText ? { translatedText, originalText: text } : {}),
      }))),
      srtPath,
      status: "transcribed",
    });
  } catch (err) {
    await jobStore.updateSegment(jobId, segmentIndex, {
      status: "failed",
      error: err.message,
    });
    throw err;
  }
}

export function startTranscribeWorker() {
  const worker = new Worker(
    "transcribe-segment",
    async (job) => handleTranscribeSegment(job),
    // Process two chunks at a time; each chunk is only marked transcribed after
    // its translation has completed, so downstream TTS sees translated text.
    { connection: createRedisConnection(), concurrency: 2, ...workerLockOptions }
  );
  worker.on("failed", async (job, err) => {
    console.error(`[transcribe-worker] job ${job?.id} failed:`, err.message);
    if (!job || !((job.attemptsMade || 0) >= (job.opts?.attempts || 1) || /stalled/i.test(err.message))) return;
    await jobStore.updateSegment(job.data.jobId, job.data.segmentIndex, {
      status: "failed",
      error: err.message,
    }).catch(() => {});
  });
  return worker;
}
