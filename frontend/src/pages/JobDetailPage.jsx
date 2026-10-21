import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getJob,
  listVoices,
  generateAllSegmentsTts,
  mergeJobVideo,
  uploadJobMusic,
  deleteJobMusic,
  finalVideoUrl,
  fullVideoSrtUrl,
} from "../api/client.js";
import SegmentCard from "../components/SegmentCard.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import Stepper from "../components/Stepper.jsx";
import ProgressBar from "../components/ProgressBar.jsx";

function buildSteps(job) {
  const stage = job.stage;
  const hasFailedSegment = job.segments.some((s) => s.status === "failed");
  const hasTtsFailed = job.segments.some((s) => s.status === "tts_failed");
  const transcribedCount = job.segments.filter((s) =>
    ["transcribed", "tts_queued", "tts_processing", "tts_done", "tts_failed"].includes(s.status)
  ).length;
  const allTranscribed = job.segments.length > 0 && transcribedCount === job.segments.length;
  const ttsDoneCount = job.segments.filter((s) => s.status === "tts_done").length;
  const anyTtsStarted = job.segments.some((s) =>
    ["tts_queued", "tts_processing", "tts_done", "tts_failed"].includes(s.status)
  );
  const allTtsDone = job.segments.length > 0 && ttsDoneCount === job.segments.length;

  const cutState = stage === "failed" ? "error" : stage === "ready" ? "done" : "active";

  const transcribeState = hasFailedSegment
    ? "error"
    : allTranscribed
    ? "done"
    : stage === "ready"
    ? "active"
    : "pending";

  const ttsState = hasTtsFailed
    ? "error"
    : allTtsDone
    ? "done"
    : anyTtsStarted
    ? "active"
    : "pending";

  const mergeState =
    job.finalVideoStatus === "failed"
      ? "error"
      : job.finalVideoStatus === "done"
      ? "done"
      : job.finalVideoStatus === "processing"
      ? "active"
      : "pending";

  const doneState = mergeState === "done" ? "done" : "pending";

  return [
    { label: "Tải lên", state: "done" },
    { label: "Cắt đoạn", state: cutState },
    { label: "Nhận diện giọng nói", state: transcribeState },
    { label: "Tạo giọng nói", state: ttsState },
    { label: "Ghép video", state: mergeState },
    { label: "Hoàn tất", state: doneState },
  ];
}

function formatTimelineTime(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours ? `${pad(hours)}:${pad(minutes)}:${pad(remainder)}` : `${pad(minutes)}:${pad(remainder)}`;
}

function SegmentTimeline({ segments }) {
  return (
    <section className="card p-3 mt-4">
      <div className="d-flex justify-content-between align-items-baseline gap-2 mb-2">
        <strong>Timeline từng đoạn</strong>
        <span className="text-muted small">Chọn đoạn để tới transcript, SRT và voice tương ứng</span>
      </div>
      <div className="d-flex gap-2 overflow-auto pb-2">
        {segments.map((segment) => (
          <button
            key={segment.index}
            type="button"
            className="btn btn-outline-secondary text-start flex-shrink-0"
            style={{ minWidth: 132 }}
            onClick={() => document.getElementById(`segment-${segment.index}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <span className="d-block small text-uppercase">Đoạn {segment.index + 1}</span>
            <span className="d-block fw-semibold">
              {formatTimelineTime(segment.startSec)}–{formatTimelineTime(segment.endSec)}
            </span>
            <span className="d-block mt-1"><StatusBadge status={segment.status} /></span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function JobDetailPage() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [voices, setVoices] = useState([]);
  const [error, setError] = useState("");
  const [bulkVoiceId, setBulkVoiceId] = useState("");
  const [bulkLanguage, setBulkLanguage] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [mergeSubmitting, setMergeSubmitting] = useState(false);
  const [musicUploading, setMusicUploading] = useState(false);
  const [musicUploadPercent, setMusicUploadPercent] = useState(0);
  const [musicUploadError, setMusicUploadError] = useState("");
  const [autoRunStage, setAutoRunStage] = useState("");
  const [autoRunError, setAutoRunError] = useState("");
  const [voicesError, setVoicesError] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    listVoices({ page_size: 100 })
      .then((data) => setVoices(data.voices || []))
      .catch((err) => {
        setVoices([]);
        setVoicesError(err.response?.data?.error || err.message);
      });
  }, []);

  const cancelledRef = useRef(false);

  function isBusy(data) {
    const anySegmentActive = data.segments.some((s) =>
      ["cut", "extracting_audio", "transcribing", "tts_queued", "tts_processing"].includes(s.status)
    );
    return (
      anySegmentActive ||
      data.stage === "cutting" ||
      data.stage === "queued" ||
      data.finalVideoStatus === "processing"
    );
  }

  // Single polling loop reused by: initial mount, and every action that kicks off
  // background work (generate one/all voices, merge). Re-entrant: calling kickPoll()
  // while a poll is already scheduled just cancels the pending timer and fetches
  // immediately instead of waiting — so the UI reflects "processing" right away
  // instead of silently relying on the next 2s tick (which, if the loop had already
  // decided nothing was busy and stopped, would otherwise never come).
  async function kickPoll() {
    clearTimeout(timerRef.current);
    try {
      const data = await getJob(jobId);
      if (cancelledRef.current) return data;
      setJob(data);
      if (isBusy(data)) {
        timerRef.current = setTimeout(kickPoll, 2000);
      }
      return data;
    } catch (err) {
      if (!cancelledRef.current) setError(err.response?.data?.error || err.message);
      throw err;
    }
  }

  useEffect(() => {
    cancelledRef.current = false;
    kickPoll();
    return () => {
      cancelledRef.current = true;
      clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function handleBulkGenerate() {
    if (!bulkVoiceId) return alert("Chọn một giọng nói trước");
    setBulkSubmitting(true);
    try {
      await generateAllSegmentsTts(jobId, bulkVoiceId, bulkLanguage || undefined);
      await kickPoll();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setBulkSubmitting(false);
    }
  }

  async function handleMerge() {
    setMergeSubmitting(true);
    try {
      await mergeJobVideo(jobId);
      await kickPoll();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setMergeSubmitting(false);
    }
  }

  async function handleMusicSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMusicUploading(true);
    setMusicUploadPercent(0);
    setMusicUploadError("");
    try {
      const result = await uploadJobMusic(jobId, file, setMusicUploadPercent);
      setJob((current) => current && ({
        ...current,
        hasBackgroundMusic: true,
        backgroundMusicName: result.filename,
      }));
      await kickPoll();
    } catch (err) {
      setMusicUploadError(err.response?.data?.error || err.message);
    } finally {
      event.target.value = "";
      setMusicUploading(false);
      setMusicUploadPercent(0);
    }
  }

  async function handleRemoveMusic() {
    try {
      await deleteJobMusic(jobId);
      setJob((current) => current && ({ ...current, hasBackgroundMusic: false, backgroundMusicName: undefined }));
      setMusicUploadError("");
    } catch (err) {
      setMusicUploadError(err.response?.data?.error || err.message);
    }
  }

  async function handleDoAll() {
    if (!bulkVoiceId) {
      setAutoRunError("Chọn giọng nói trước khi chạy tự động.");
      return;
    }
    if (!allTranscribed) {
      setAutoRunError("Đợi nhận diện transcript tất cả đoạn xong rồi hãy chạy tự động.");
      return;
    }

    clearTimeout(timerRef.current);
    setAutoRunError("");
    setAutoRunStage("voices");
    try {
      let snapshot = await getJob(jobId);
      setJob(snapshot);
      if (snapshot.segments.some((segment) => segment.status === "failed")) {
        throw new Error("Có đoạn nhận diện transcript bị lỗi. Hãy xử lý các đoạn lỗi rồi chạy lại.");
      }

      if (!snapshot.segments.every((segment) => segment.status === "tts_done")) {
        await generateAllSegmentsTts(jobId, bulkVoiceId, bulkLanguage || undefined);
        while (!cancelledRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          snapshot = await getJob(jobId);
          setJob(snapshot);
          const failed = snapshot.segments.find((segment) => segment.status === "tts_failed");
          if (failed) throw new Error(`Tạo voice đoạn ${failed.index + 1} thất bại: ${failed.error || "lỗi không xác định"}`);
          if (snapshot.segments.every((segment) => segment.status === "tts_done")) break;
        }
      }

      if (cancelledRef.current) return;
      setAutoRunStage("merge");
      await mergeJobVideo(jobId);
      while (!cancelledRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        snapshot = await getJob(jobId);
        setJob(snapshot);
        if (snapshot.finalVideoStatus === "failed") {
          throw new Error(snapshot.error || "Ghép video thất bại");
        }
        if (snapshot.finalVideoStatus === "done") break;
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setAutoRunError(err.response?.data?.error || err.message);
      }
    } finally {
      if (!cancelledRef.current) setAutoRunStage("");
    }
  }

  if (error) {
    return (
      <div className="container py-4" style={{ maxWidth: 1240 }}>
        <div className="alert alert-danger">Lỗi: {error}</div>
        <Link to="/" className="btn btn-outline-dark">
          ← Về trang chủ
        </Link>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="container py-5 text-center text-secondary" style={{ maxWidth: 920 }}>
        <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Đang tải job…
      </div>
    );
  }

  const transcribedCount = job.segments.filter((s) =>
    ["transcribed", "tts_queued", "tts_processing", "tts_done", "tts_failed"].includes(s.status)
  ).length;
  const ttsDoneCount = job.segments.filter((s) => s.status === "tts_done").length;
  const pendingVoiceCount = job.segments.filter((s) =>
    ["transcribed", "tts_failed"].includes(s.status)
  ).length;
  const allTtsDone = job.segments.length > 0 && ttsDoneCount === job.segments.length;
  const allTranscribed = job.segments.length > 0 && transcribedCount === job.segments.length;
  const isVideoJob = job.type === "video";

  return (
    <div className="container py-4" style={{ maxWidth: 1240 }}>
      <Link to="/" className="text-muted text-decoration-none d-inline-block mb-3">
        ← Về trang chủ
      </Link>

      <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
        <div>
          <h1 className="h4 mb-1">{job.originalFilename}</h1>
          <p className="text-muted mb-0">
            {job.segmentCount || 0} đoạn
            {job.durationSeconds ? ` · ${Math.round(job.durationSeconds)}s gốc` : ""}
          </p>
        </div>
        <StatusBadge status={job.status} kind="job" />
      </div>

      {isVideoJob && <Stepper steps={buildSteps(job)} />}

      {isVideoJob && job.segments.length > 0 && <SegmentTimeline segments={job.segments} />}

      {voicesError && (
        <div className="alert alert-danger mt-3">
          Không tải được danh sách giọng nói (Resona): {voicesError}
        </div>
      )}

      {job.segments.length > 0 && (
        <div className="mt-4">
          <ProgressBar label="Transcript" done={transcribedCount} total={job.segmentCount} />
          <ProgressBar label="Giọng nói mới" done={ttsDoneCount} total={job.segmentCount} />
          {isVideoJob && allTranscribed && (
            <a className="btn btn-outline-dark btn-sm mt-2" href={fullVideoSrtUrl(jobId)} download>
              Tải SRT toàn video (đã ghép đúng timeline)
            </a>
          )}
        </div>
      )}

      {job.segments.length === 0 && (
        <div className="text-center text-secondary py-4">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Đang cắt video
          thành các đoạn…
        </div>
      )}

      {isVideoJob && job.hasFinalVideo && (
        <div className="card border-warning p-3 mb-4 mt-4">
          <div className="small text-uppercase text-warning fw-bold mb-2">
            ✓ Video hoàn chỉnh (giọng mới; âm thanh gốc đã tắt)
          </div>
          <video controls src={finalVideoUrl(jobId)} className="segment-video mb-2" />
          <a className="btn btn-warning btn-sm align-self-start" href={finalVideoUrl(jobId)} download>
            Tải video hoàn chỉnh
          </a>
        </div>
      )}

      {/* Bulk control only makes sense with 2+ pending segments — with just 1, it's
          an exact duplicate of that segment's own "Tạo giọng nói mới" card below. */}
      {isVideoJob && !job.hasFinalVideo && (pendingVoiceCount > 0 || Boolean(autoRunStage)) && (
        <div className="card p-3 mb-4 mt-4">
          <div className="small text-uppercase text-secondary fw-bold mb-2">
              Tạo giọng nói ({pendingVoiceCount} đoạn chưa có giọng)
          </div>
          <div className="d-flex gap-2 flex-wrap align-items-center">
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: 260 }}
              value={bulkVoiceId}
              onChange={(e) => setBulkVoiceId(e.target.value)}
            >
              <option value="">-- Chọn giọng nói cho tất cả --</option>
              {voices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name} ({v.gender})
                </option>
              ))}
            </select>
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: 200 }}
              value={bulkLanguage}
              onChange={(e) => setBulkLanguage(e.target.value)}
              title="Ngôn ngữ chuẩn hoá văn bản cho TTS"
            >
              <option value="">Chuẩn hoá: tự động/đoạn</option>
              <option value="vi">Chuẩn hoá: Việt (tất cả)</option>
              <option value="en">Chuẩn hoá: Anh (tất cả)</option>
            </select>
            <button
              className="btn btn-warning btn-sm"
              onClick={handleBulkGenerate}
              disabled={bulkSubmitting || Boolean(autoRunStage)}
            >
              {bulkSubmitting ? "Đang gửi…" : `Chỉ tạo giọng (${pendingVoiceCount} đoạn)`}
            </button>
            <button
              className="btn btn-dark btn-sm"
              onClick={handleDoAll}
              disabled={Boolean(autoRunStage) || bulkSubmitting || mergeSubmitting || !allTranscribed}
              title={!allTranscribed ? "Cần nhận diện transcript cho tất cả đoạn trước" : undefined}
            >
              {autoRunStage === "voices"
                ? "Đang tạo voice từng đoạn…"
                : autoRunStage === "merge"
                ? "Voice xong, đang ghép video…"
                : "Tự chạy hết: voice + ghép nhạc"}
            </button>
          </div>
          {!bulkVoiceId && (
            <div className="text-warning small mt-2">⚠ Chọn một giọng nói ở trên trước.</div>
          )}
          <div className="text-muted small mt-2">
            Xử lý lần lượt từng đoạn một (không chạy song song) để tránh quá tải Resona.
          </div>
        </div>
      )}

      {isVideoJob && (
        <div className="card p-3 mb-4 mt-4">
          <div className="small text-uppercase text-secondary fw-bold mb-2">
            Nhạc nền và ghép video
          </div>
          <div className="small mb-2">Âm thanh gốc của video sẽ được tắt. Bạn có thể thêm nhạc nền bên dưới.</div>
          <label className="form-label small mb-1" htmlFor="background-music">
            Chọn file nhạc (có thể chọn MP4/MOV có âm thanh)
          </label>
          <input
            id="background-music"
            className="form-control form-control-sm mb-2"
            type="file"
            accept="audio/*,video/mp4,video/quicktime,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.m4v,.mov"
            onChange={handleMusicSelection}
            disabled={job.finalVideoStatus === "processing" || mergeSubmitting || musicUploading}
          />
          <div className="text-muted small mb-3">
            {musicUploading
              ? `Đang tải nhạc lên… ${musicUploadPercent}%`
              : job.hasBackgroundMusic
              ? `Đã lưu trên máy chủ: ${job.backgroundMusicName}. Nhạc sẽ tự lặp hoặc cắt theo độ dài video.`
              : "Chọn file nhạc để tải lên và lưu theo job. File ngắn sẽ tự lặp, file dài sẽ tự cắt cho vừa video."}
          </div>
          {musicUploadError && <div className="alert alert-danger small">{musicUploadError}</div>}
          {job.hasBackgroundMusic && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm align-self-start mb-3"
              onClick={handleRemoveMusic}
              disabled={musicUploading || job.finalVideoStatus === "processing" || mergeSubmitting}
            >
              Xóa nhạc đã lưu
            </button>
          )}
          {autoRunStage && (
            <div className="alert alert-info small">
              {autoRunStage === "voices"
                ? "Đang tạo voice lần lượt theo các đoạn SRT…"
                : "Voice đã xong, đang tự ghép video và nhạc…"}
            </div>
          )}
          {autoRunError && <div className="alert alert-danger small">{autoRunError}</div>}
          {job.finalVideoStatus === "failed" && (
            <div className="alert alert-danger">{job.error || "Ghép video thất bại"}</div>
          )}
          {job.finalVideoStatus === "processing" ? (
            <div className="text-secondary">
              <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Đang
              ghép video, render từng đoạn một…
            </div>
          ) : (
            <button
              className="btn btn-warning btn-sm align-self-start"
              onClick={handleMerge}
              disabled={mergeSubmitting || !allTtsDone}
              title={!allTtsDone ? "Cần tạo voice cho tất cả đoạn trước" : undefined}
            >
              {mergeSubmitting
                ? "Đang gửi…"
                : job.hasFinalVideo
                ? "Ghép lại video với lựa chọn hiện tại"
                : allTtsDone
                ? "Ghép video + giọng nói mới"
                : "Tạo xong voice để ghép video"}
            </button>
          )}
        </div>
      )}

      <div className="d-flex flex-column gap-2 mt-3">
        {job.segments.map((seg) => (
          <div id={`segment-${seg.index}`} key={seg.index}>
            <SegmentCard
              jobId={jobId}
              segment={seg}
              voices={voices}
              defaultOpen={seg.status !== "tts_done"}
              onChanged={kickPoll}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
