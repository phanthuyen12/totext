import express from "express";
import fs from "node:fs";
import path from "node:path";
import { upload } from "../middleware/upload.js";
import { musicUpload } from "../middleware/musicUpload.js";
import * as jobStore from "../services/jobStore.js";
import { combineSrtFiles, parseSrtCues, segmentsToSrt } from "../services/srtService.js";
import { getDurationSeconds, hasAudioStream } from "../services/ffmpegService.js";
import { deleteJobAndFiles } from "../services/cleanupService.js";
import {
  enqueueVideoSplit, enqueueTranscribe, enqueueTts, enqueueMerge,
  transcribeQueue,
} from "../queues/index.js";

export const router = express.Router();

function deriveOverallStatus(segments) {
  if (segments.length === 0) return "processing";
  if (segments.some((s) => s.status === "failed" || s.status === "tts_failed")) {
    return "partial_failure";
  }
  const allTtsDone = segments.every((s) => s.status === "tts_done");
  if (allTtsDone) return "completed";
  const allTranscribed = segments.every((s) =>
    ["transcribed", "tts_queued", "tts_processing", "tts_done"].includes(s.status)
  );
  if (allTranscribed) return "transcribed";
  return "processing";
}

function serializeSegment(seg) {
  let cues = [];
  try {
    cues = seg.transcriptCues ? JSON.parse(seg.transcriptCues) : [];
  } catch {
    cues = [];
  }
  return {
    index: Number(seg.index),
    kind: seg.kind,
    startSec: seg.startSec ? Number(seg.startSec) : undefined,
    endSec: seg.endSec ? Number(seg.endSec) : undefined,
    status: seg.status,
    language: seg.language,
    transcriptText: seg.transcriptText || "",
    editedText: seg.editedText || "",
    cues,
    hasSrt: Boolean(seg.srtPath),
    ttsVoiceId: seg.ttsVoiceId,
    ttsStatus: seg.status?.startsWith("tts_") ? seg.status : undefined,
    ttsProgress: seg.ttsProgress || undefined,
    hasTtsAudio: Boolean(seg.ttsAudioPath),
    error: seg.error || undefined,
    updatedAt: seg.updatedAt,
  };
}

// GET /api/jobs - list recent jobs (job history, newest first)
router.get("/", async (req, res, next) => {
  try {
    const jobDocs = await jobStore.listJobs(50);
    const results = await Promise.all(
      jobDocs.map(async (job) => {
        const segs = await jobStore.getAllSegments(job.id);
        return {
          id: job.id,
          type: job.type,
          originalFilename: job.originalFilename,
          stage: job.stage,
          status: deriveOverallStatus(segs),
          segmentCount: segs.length,
          createdAt: job.createdAt,
        };
      })
    );
    res.json({ jobs: results });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/video - upload a long video, triggers split + transcribe pipeline
router.post("/video", upload.single("video"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Thiếu file video (field 'video')" });
    const jobId = req.jobId;

    await jobStore.createJob({
      id: jobId,
      type: "video",
      originalFilename: req.file.originalname,
      filePath: req.file.path,
      stage: "queued",
      createdAt: new Date().toISOString(),
    });

    await enqueueVideoSplit({ jobId, filePath: req.file.path });

    res.status(202).json({ jobId });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/voice-to-text - upload a single audio/video clip, transcribe directly (no cutting)
router.post("/voice-to-text", upload.single("audio"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Thiếu file âm thanh (field 'audio')" });
    const jobId = req.jobId;

    await jobStore.createJob({
      id: jobId,
      type: "audio",
      originalFilename: req.file.originalname,
      filePath: req.file.path,
      stage: "ready",
      segmentCount: 1,
      createdAt: new Date().toISOString(),
    });

    await jobStore.createSegment(jobId, 0, {
      jobId,
      index: 0,
      kind: "audio-standalone",
      sourcePath: req.file.path,
      status: "cut",
    });

    await enqueueTranscribe({ jobId, segmentIndex: 0 });

    res.status(202).json({ jobId });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:jobId - job + all segments summary
router.get("/:jobId", async (req, res, next) => {
  try {
    const job = await jobStore.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const segments = await jobStore.getAllSegments(req.params.jobId);
    for (const segment of segments) {
      if (segment.kind !== "video-chunk" || segment.transcriptCues || !segment.srtPath || !fs.existsSync(segment.srtPath)) continue;
      const cues = parseSrtCues(fs.readFileSync(segment.srtPath, "utf8"));
      segment.transcriptCues = JSON.stringify(cues);
      await jobStore.updateSegment(job.id, segment.index, { transcriptCues: segment.transcriptCues });
    }
    res.json({
      id: job.id,
      type: job.type,
      originalFilename: job.originalFilename,
      stage: job.stage,
      status: deriveOverallStatus(segments),
      segmentCount: segments.length,
      durationSeconds: job.durationSeconds ? Number(job.durationSeconds) : undefined,
      error: job.error || undefined,
      createdAt: job.createdAt,
      finalVideoStatus: job.finalVideoStatus,
      hasFinalVideo: Boolean(job.finalVideoPath),
      segments: segments.map(serializeSegment),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:jobId/srt - download one subtitle file for the full video timeline
router.get("/:jobId/srt", async (req, res, next) => {
  try {
    const job = await jobStore.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.type !== "video") return res.status(400).json({ error: "Job này không phải video" });

    const segments = await jobStore.getAllSegments(req.params.jobId);
    if (!segments.length || segments.some((segment) => !segment.srtPath || !fs.existsSync(segment.srtPath))) {
      return res.status(409).json({ error: "Transcript của một số đoạn vẫn đang xử lý" });
    }

    const parts = [];
    let offsetSeconds = 0;
    for (const segment of segments) {
      parts.push({
        content: fs.readFileSync(segment.srtPath, "utf8"),
        offsetSeconds,
      });
      // Use each cut file's real duration so offsets match the final concatenated
      // video even when stream-copy cuts snap to different keyframes.
      offsetSeconds += await getDurationSeconds(segment.sourcePath);
    }
    const combined = combineSrtFiles(parts);
    res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${req.params.jobId}.srt"`);
    res.send(combined);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/jobs/:jobId - remove the job, its segments, any still-queued work and its files
router.delete("/:jobId", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const job = await jobStore.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    await deleteJobAndFiles(jobId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/jobs/:jobId/segments/:index - edit transcript text before sending to TTS
router.patch("/:jobId/segments/:index", async (req, res, next) => {
  try {
    const { jobId, index } = req.params;
    const segment = await jobStore.getSegment(jobId, index);
    if (!segment) return res.status(404).json({ error: "Segment not found" });

    const { text, cues } = req.body;
    if (Array.isArray(cues)) {
      const normalized = cues.map((cue) => ({
        start: Number(cue.start),
        end: Number(cue.end),
        text: typeof cue.text === "string" ? cue.text : "",
      })).filter((cue) => cue.text.trim());
      const segmentDuration = Number(segment.endSec) - Number(segment.startSec);
      if (normalized.some((cue) => !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || (Number.isFinite(segmentDuration) && cue.end > segmentDuration + 0.1))) {
        return res.status(400).json({ error: "Mốc thời gian SRT không hợp lệ" });
      }
      await jobStore.updateSegment(jobId, index, {
        transcriptCues: JSON.stringify(normalized),
        editedText: normalized.map((cue) => cue.text).join(" ").replace(/\s+/g, " ").trim(),
      });
      if (segment.srtPath) fs.writeFileSync(segment.srtPath, segmentsToSrt(normalized), "utf8");
    } else if (typeof text === "string") {
      await jobStore.updateSegment(jobId, index, { editedText: text });
    } else {
      return res.status(400).json({ error: "Thiếu field 'text' hoặc 'cues'" });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:jobId/segments/:index/retry-transcription
router.post("/:jobId/segments/:index/retry-transcription", async (req, res, next) => {
  try {
    const { jobId, index } = req.params;
    const segment = await jobStore.getSegment(jobId, index);
    if (!segment) return res.status(404).json({ error: "Segment not found" });

    const queued = await transcribeQueue.getJobs(["active", "waiting", "delayed", "prioritized"]);
    const alreadyQueued = queued.some((item) =>
      item?.data?.jobId === jobId && Number(item.data.segmentIndex) === Number(index)
    );
    if (alreadyQueued) return res.status(409).json({ error: "Đoạn này vẫn đang được xử lý" });
    if (!["failed", "transcribing", "extracting_audio"].includes(segment.status)) {
      return res.status(409).json({ error: "Đoạn này chưa ở trạng thái có thể chạy lại" });
    }

    await jobStore.updateSegment(jobId, Number(index), {
      status: "cut",
      error: "",
      audioPath: "",
      srtPath: "",
      transcriptText: "",
      language: "",
    });
    await enqueueTranscribe({ jobId, segmentIndex: Number(index) });
    res.status(202).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:jobId/segments/:index/tts - generate speech for this segment via Resona
router.post("/:jobId/segments/:index/tts", async (req, res, next) => {
  try {
    const { jobId, index } = req.params;
    const segment = await jobStore.getSegment(jobId, index);
    if (!segment) return res.status(404).json({ error: "Segment not found" });

    const { voiceId, language } = req.body;
    console.log(`[jobs] POST tts jobId=${jobId} segment=${index} voiceId=${voiceId} language=${language}`);
    if (!voiceId) return res.status(400).json({ error: "Thiếu field 'voiceId'" });

    // guard against duplicate submits (double-click, slow UI refresh, etc.) piling
    // up identical jobs in the queue — reject instead of silently re-enqueueing
    if (segment.status === "tts_queued" || segment.status === "tts_processing") {
      return res.status(409).json({ error: "Đoạn này đang tạo giọng nói, vui lòng đợi" });
    }

    await jobStore.updateSegment(jobId, Number(index), { status: "tts_queued", ttsVoiceId: voiceId, error: "" });
    await enqueueTts({ jobId, segmentIndex: Number(index), voiceId, language: language || segment.language || "vi" });
    res.status(202).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:jobId/segments/tts-all - bulk-generate voice for every segment that
// still needs it, with one voice. Jobs are queued, not fired at once — the tts-segment
// worker runs with concurrency 1, so Resona only gets hit one segment at a time.
router.post("/:jobId/segments/tts-all", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { voiceId, language } = req.body;
    if (!voiceId) return res.status(400).json({ error: "Thiếu field 'voiceId'" });

    const segments = await jobStore.getAllSegments(jobId);
    const pending = segments.filter((s) =>
      ["transcribed", "tts_failed"].includes(s.status)
    );

    for (const seg of pending) {
      // explicit `language` forces that normalization for every segment; otherwise
      // each segment keeps its own auto-detected language
      await jobStore.updateSegment(jobId, seg.index, { status: "tts_queued", ttsVoiceId: voiceId, error: "" });
      await enqueueTts({
        jobId,
        segmentIndex: seg.index,
        voiceId,
        language: language || seg.language || "vi",
      });
    }

    res.status(202).json({ ok: true, queued: pending.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:jobId/merge - mux each segment's video with its generated voice and
// concatenate into one final dubbed video. Requires every segment to be tts_done.
router.post("/:jobId/merge", async (req, res, next) => {
  try {
    const job = await jobStore.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.type !== "video") return res.status(400).json({ error: "Chỉ job video mới ghép được nhạc nền" });
    req.jobId = req.params.jobId;
    next();
  } catch (err) {
    next(err);
  }
}, (req, res, next) => {
  musicUpload.single("music")(req, res, next);
}, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const job = await jobStore.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.type !== "video") return res.status(400).json({ error: "Chỉ job video mới ghép được nhạc nền" });
    const segments = await jobStore.getAllSegments(jobId);
    if (segments.length === 0) return res.status(400).json({ error: "Job chưa có đoạn nào" });

    if (req.file && !(await hasAudioStream(req.file.path))) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "File MP4/MOV đã chọn không có luồng âm thanh" });
    }

    const notReady = segments.find((s) => s.status !== "tts_done");
    if (notReady) {
      return res.status(400).json({
        error: `Đoạn ${notReady.index + 1} chưa có giọng nói, không thể ghép video`,
      });
    }

    await jobStore.updateJob(jobId, { finalVideoStatus: "processing" });
    await enqueueMerge({ jobId, musicPath: req.file?.path });
    res.status(202).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:jobId/final-video - download/stream the final dubbed video
router.get("/:jobId/final-video", async (req, res, next) => {
  try {
    const job = await jobStore.getJob(req.params.jobId);
    if (!job?.finalVideoPath || !fs.existsSync(job.finalVideoPath)) {
      return res.status(404).json({ error: "Final video not ready yet" });
    }
    res.sendFile(job.finalVideoPath);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:jobId/segments/:index/srt - download the SRT subtitle for a segment
router.get("/:jobId/segments/:index/srt", async (req, res, next) => {
  try {
    const { jobId, index } = req.params;
    const segment = await jobStore.getSegment(jobId, index);
    if (!segment?.srtPath || !fs.existsSync(segment.srtPath)) {
      return res.status(404).json({ error: "SRT not ready yet" });
    }
    res.download(segment.srtPath, `segment-${index}.srt`);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:jobId/segments/:index/video - stream the cut video chunk
router.get("/:jobId/segments/:index/video", async (req, res, next) => {
  try {
    const { jobId, index } = req.params;
    const segment = await jobStore.getSegment(jobId, index);
    if (segment?.kind !== "video-chunk" || !fs.existsSync(segment.sourcePath)) {
      return res.status(404).json({ error: "Video chunk not found" });
    }
    res.sendFile(segment.sourcePath);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:jobId/segments/:index/tts-audio - download the Resona-generated audio
router.get("/:jobId/segments/:index/tts-audio", async (req, res, next) => {
  try {
    const { jobId, index } = req.params;
    const segment = await jobStore.getSegment(jobId, index);
    if (!segment?.ttsAudioPath || !fs.existsSync(segment.ttsAudioPath)) {
      return res.status(404).json({ error: "TTS audio not ready yet" });
    }
    const ext = path.extname(segment.ttsAudioPath) || ".mp3";
    res.download(segment.ttsAudioPath, `segment-${index}-tts${ext}`);
  } catch (err) {
    next(err);
  }
});
