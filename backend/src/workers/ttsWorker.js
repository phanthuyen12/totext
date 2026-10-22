import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { Worker } from "bullmq";
import { createRedisConnection } from "../config/redisClient.js";
import { config } from "../config/env.js";
import * as resonaService from "../services/resonaService.js";
import * as mergeService from "../services/mergeService.js";
import * as jobStore from "../services/jobStore.js";
import { splitTextForTts } from "../services/textSplitter.js";
import { workerLockOptions } from "./workerOptions.js";

const QUALITY_RETRIES = 6;

/** Resona sometimes rejects every take of a chunk ("quality_check_failed"); a fresh request usually passes. */
async function synthesizeChunk(args) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await synthesizeChunkOnce(args);
    } catch (err) {
      const retryable = /quality[\s_-]*check[\s_-]*failed|pronunciation|none of the generated takes passed/i
        .test(`${err.code || ""} ${err.message || ""}`);
      if (!retryable || attempt >= QUALITY_RETRIES) throw err;
      console.warn(`[tts-worker] quality check failed, retry ${attempt}/${QUALITY_RETRIES - 1}`);
    }
  }
}

/** Submits one chunk of text to Resona, polls until done, downloads the audio. */
async function synthesizeChunkOnce({ text, voiceId, language, destPath }) {
  const submitted = await resonaService.textToSpeech({ text, voiceId, language });
  const result = await resonaService.pollUntilDone(
    () => resonaService.getTextToSpeechResult(submitted.request_id),
    { intervalMs: 3000, timeoutMs: 600000 }
  );

  if (result.status !== "completed") {
    const err = new Error(`${result.error_code || "unknown"}: ${result.error || "generation failed"}`);
    err.requestId = submitted.request_id;
    throw err;
  }

  const audioUrl = result.audio_urls[0];
  const ext = path.extname(new URL(audioUrl).pathname) || ".mp3";
  const filePath = destPath + ext;
  await resonaService.downloadToFile(audioUrl, filePath);
  return { filePath, audioUrl, requestId: submitted.request_id };
}

function readTranscriptCues(segment) {
  try {
    const cues = segment.transcriptCues ? JSON.parse(segment.transcriptCues) : [];
    if (!Array.isArray(cues)) return [];
    const duration = Number(segment.endSec) - Number(segment.startSec);
    return cues
      .filter((cue) => Number.isFinite(Number(cue.start)) && Number.isFinite(Number(cue.end)) &&
        Number(cue.start) >= 0 && Number(cue.end) > Number(cue.start) && String(cue.text || "").trim() &&
        (!Number.isFinite(duration) || Number(cue.start) < duration))
      .map((cue) => ({ ...cue, end: Number.isFinite(duration) ? Math.min(Number(cue.end), duration) : Number(cue.end) }))
      .filter((cue) => cue.end > Number(cue.start));
  } catch {
    return [];
  }
}

async function synthesizeCue({ cue, cueIndex, voiceId, language, cueDir }) {
  const text = String(cue.translatedText || cue.text).trim();
  const cueHash = createHash("sha1").update(`${voiceId}\n${language}\n${text}`).digest("hex");
  const finalCuePath = path.join(cueDir, `cue-${cueHash}.wav`);
  try {
    await fs.access(finalCuePath);
    return { filePath: finalCuePath, audioUrls: [] };
  } catch {}

  const pieces = splitTextForTts(text);
  const files = [];
  const audioUrls = [];
  for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex++) {
    const generated = await synthesizeChunk({
      text: pieces[pieceIndex],
      voiceId,
      language,
      destPath: path.join(cueDir, `cue-${cueIndex}-${cueHash}-part-${pieceIndex}`),
    });
    files.push(generated.filePath);
    audioUrls.push(generated.audioUrl);
  }

  const rawPath = path.join(cueDir, `cue-${cueHash}-raw.wav`);
  await mergeService.concatAudioFiles(files, rawPath);
  await fs.rename(rawPath, finalCuePath);
  await Promise.all(files.map((file) => fs.unlink(file).catch(() => {})));
  return { filePath: finalCuePath, audioUrls };
}

async function handleTtsSegment(job) {
  const { jobId, segmentIndex, voiceId, language } = job.data;
  console.log(`[tts-worker] start job=${job.id} jobId=${jobId} segment=${segmentIndex} voiceId=${voiceId} language=${language}`);
  const segment = await jobStore.getSegment(jobId, segmentIndex);
  if (!segment) throw new Error(`Segment ${segmentIndex} of job ${jobId} not found`);

  const cues = readTranscriptCues(segment).map((cue) => ({
    ...cue,
    text: cue.translatedText || cue.text,
  }));
  const ttsLanguage = cues.some((cue) => cue.translatedText) ? "vi" : language;
  const text = (cues.length
    ? cues.map((cue) => cue.text.trim()).join(" ")
    : segment.editedText || segment.transcriptText || "").trim();
  if (!text) {
    const err = new Error("Segment has no transcript text to send to TTS");
    await jobStore.updateSegment(jobId, segmentIndex, {
      status: "tts_failed",
      error: err.message,
    });
    throw err;
  }

  // Resona caps each request at 2000 voice credits (~2000 chars) — a segment's
  // transcript may exceed that, so split it into smaller
  // requests, synthesize them one at a time, then stitch the audio back together.
  const chunks = splitTextForTts(text);
  const segDir = path.join(config.outputDir, jobId, "segments", String(segmentIndex));

  try {
    await jobStore.updateSegment(jobId, segmentIndex, {
      status: "tts_processing",
      ttsVoiceId: voiceId,
      error: "",
    });

    if (segment.kind === "video-chunk" && cues.length > 0) {
      const cueDir = path.join(segDir, "tts-cues");
      await fs.mkdir(cueDir, { recursive: true });
      const cueAudioPaths = [];
      const audioUrls = [];
      let lastRequestId = "";

      for (let i = 0; i < cues.length; i++) {
        const generated = await synthesizeCue({
          cue: cues[i],
          cueIndex: i,
          voiceId,
          language: ttsLanguage,
          cueDir,
        });
        cueAudioPaths.push(generated.filePath);
        audioUrls.push(...generated.audioUrls);
        await jobStore.updateSegment(jobId, segmentIndex, {
          ttsProgress: `${i + 1}/${cues.length}`,
        });
      }

      const segmentDuration = Math.max(0, Number(segment.endSec) - Number(segment.startSec));
      const finalPath = path.join(segDir, "tts-audio.wav");
      await mergeService.createTimedAudioTrack(cueAudioPaths, cues, segmentDuration, finalPath);
      await jobStore.updateSegment(jobId, segmentIndex, {
        status: "tts_done",
        ttsAudioPath: finalPath,
        ttsAudioUrl: audioUrls.join(" | "),
        ttsProgress: "",
        error: "",
      });
      console.log(`[tts-worker] done job=${job.id} jobId=${jobId} segment=${segmentIndex} with ${cues.length} SRT cues -> ${finalPath}`);
      return;
    }

    const chunkFiles = [];
    const chunkUrls = [];
    let lastRequestId = "";

    for (let i = 0; i < chunks.length; i++) {
      const { filePath, audioUrl, requestId } = await synthesizeChunk({
        text: chunks[i],
        voiceId,
        language: ttsLanguage,
        destPath: path.join(segDir, `tts-chunk-${i}`),
      });
      chunkFiles.push(filePath);
      chunkUrls.push(audioUrl);
      lastRequestId = requestId;
      await jobStore.updateSegment(jobId, segmentIndex, {
        ttsRequestId: lastRequestId,
        ttsProgress: chunks.length > 1 ? `${i + 1}/${chunks.length}` : "",
      });
    }

    const finalPath = path.join(segDir, "tts-audio.wav");
    await mergeService.concatAudioFiles(chunkFiles, finalPath);

    if (chunkFiles.length > 1) {
      await Promise.all(chunkFiles.map((f) => fs.unlink(f).catch(() => {})));
    }

    await jobStore.updateSegment(jobId, segmentIndex, {
      status: "tts_done",
      ttsAudioPath: finalPath,
      ttsAudioUrl: chunkUrls.join(" | "),
      ttsProgress: "",
      error: "",
    });
    console.log(`[tts-worker] done job=${job.id} jobId=${jobId} segment=${segmentIndex} -> ${finalPath}`);
  } catch (err) {
    console.error(`[tts-worker] failed job=${job.id} jobId=${jobId} segment=${segmentIndex}:`, err.message);
    await jobStore.updateSegment(jobId, segmentIndex, {
      status: "tts_failed",
      error: err.message,
    });
    throw err;
  }
}

export function startTtsWorker() {
  const worker = new Worker(
    "tts-segment",
    async (job) => handleTtsSegment(job),
    // Limit Resona load while allowing two translated chunks to generate voice
    // concurrently.
    { connection: createRedisConnection(), concurrency: 2, ...workerLockOptions }
  );
  worker.on("failed", async (job, err) => {
    console.error(`[tts-worker] job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}):`, err.message);
    if (!job) return;
    // Out of retries. The in-process try/catch in handleTtsSegment normally
    // already wrote tts_failed, but if this process died mid-attempt (crash,
    // `node --watch` restart, OOM) that catch never ran — the segment would
    // be left stuck at tts_processing forever, with no way to retry from the
    // UI (the route rejects re-submitting while status is tts_processing).
    // Force it to tts_failed here once retries are exhausted so it unblocks.
    if ((job.attemptsMade || 0) >= (job.opts?.attempts || 1) || /stalled/i.test(err.message)) {
      const { jobId, segmentIndex } = job.data;
      const segment = await jobStore.getSegment(jobId, segmentIndex).catch(() => null);
      if (segment && segment.status === "tts_processing") {
        await jobStore.updateSegment(jobId, segmentIndex, {
          status: "tts_failed",
          error: err.message,
        });
      }
    }
  });
  return worker;
}
