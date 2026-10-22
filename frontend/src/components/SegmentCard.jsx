import { useState, useEffect, useRef } from "react";
import StatusBadge from "./StatusBadge.jsx";
import {
  updateSegmentText,
  generateSegmentTts,
  retrySegmentTranscription,
  srtDownloadUrl,
  videoChunkUrl,
  ttsAudioUrl,
} from "../api/client.js";

const LANGUAGE_LABEL = { en: "Anh", vi: "Việt" };

function formatSrtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  const pad = (n, size = 2) => String(n).padStart(size, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`;
}

export default function SegmentCard({ jobId, segment, voices, defaultOpen, onChanged }) {
  const [text, setText] = useState(segment.editedText || segment.transcriptText || "");
  const sourceCuesJson = JSON.stringify(segment.cues || []);
  const [cues, setCues] = useState(() => JSON.parse(sourceCuesJson));
  const [voiceId, setVoiceId] = useState(segment.ttsVoiceId || "");
  const [ttsLanguage, setTtsLanguage] = useState("vi");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retryingTranscript, setRetryingTranscript] = useState(false);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef(null);
  const selectedVoice = voices.find((v) => v.voice_id === voiceId);

  useEffect(() => {
    setText(segment.editedText || segment.transcriptText || "");
  }, [segment.transcriptText, segment.editedText]);

  useEffect(() => {
    setCues(JSON.parse(sourceCuesJson));
  }, [sourceCuesJson]);

  const isTranscribed = ["transcribed", "tts_queued", "tts_processing", "tts_done", "tts_failed"].includes(
    segment.status
  );
  const isBusy = ["cut", "extracting_audio", "transcribing"].includes(segment.status);
  const isTtsQueued = segment.status === "tts_queued";
  const isTtsBusy = isTtsQueued || segment.status === "tts_processing";
  const isTtsDone = segment.status === "tts_done";
  const isTranscriptionStale = ["cut", "extracting_audio", "transcribing"].includes(segment.status) &&
    Date.now() - Date.parse(segment.updatedAt || "") > 5 * 60 * 1000;
  const canRetryTranscription = segment.status === "failed" || isTranscriptionStale;
  const preview = (text || "").slice(0, 70) + (text.length > 70 ? "…" : "");

  async function handleSaveText() {
    setSaving(true);
    try {
      if (cues.length > 0) {
        await updateSegmentText(jobId, segment.index, cues);
        setText(cues.map((cue) => cue.text).join(" ").replace(/\s+/g, " ").trim());
      } else {
        await updateSegmentText(jobId, segment.index, text);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateVoice() {
    if (!voiceId) return alert("Chọn một giọng nói trước");
    setSubmitting(true);
    try {
      await handleSaveText();
      await generateSegmentTts(jobId, segment.index, voiceId, ttsLanguage);
      // the POST only enqueues the job — pull fresh status now so the button
      // disables immediately instead of looking like nothing happened
      await onChanged?.();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
      await onChanged?.();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetryTranscription() {
    setRetryingTranscript(true);
    try {
      await retrySegmentTranscription(jobId, segment.index);
      await onChanged?.();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setRetryingTranscript(false);
    }
  }

  return (
    <div className="card">
      <audio ref={previewRef} hidden onEnded={() => setPreviewing(false)} />
      <button
        type="button"
        className="btn w-100 d-flex justify-content-between align-items-center p-3 text-start border-0"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="d-flex align-items-center gap-2 flex-wrap">
          <strong>
            Đoạn {segment.index + 1}
            {segment.startSec !== undefined
              ? ` (${Math.round(segment.startSec)}s–${Math.round(segment.endSec)}s)`
              : ""}
          </strong>
          {!open && preview && <span className="text-muted small text-truncate">— {preview}</span>}
        </span>
        <span className="d-flex align-items-center gap-2">
          <StatusBadge status={segment.status} />
          <span className="text-secondary">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          {segment.kind === "video-chunk" && (
            <video controls src={videoChunkUrl(jobId, segment.index)} className="segment-video mb-3" />
          )}

          {segment.error && <div className="alert alert-danger">{segment.error}</div>}

          {canRetryTranscription && (
            <button
              className="btn btn-outline-warning btn-sm mb-3"
              onClick={handleRetryTranscription}
              disabled={retryingTranscript}
            >
              {retryingTranscript ? "Đang xếp lại…" : segment.status === "failed" ? "Chạy lại nhận diện đoạn này" : "Thử chạy lại đoạn bị kẹt"}
            </button>
          )}

          {isBusy && (
            <div className="text-center text-secondary py-3">
              <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Đang xử lý
              transcript…
            </div>
          )}

          {isTranscribed && (
            <>
              <div className="bg-body-tertiary rounded p-3 mb-3">
                <div className="small text-uppercase text-secondary fw-bold mb-2">
                  Phụ đề / transcript
                </div>
                {cues.length > 0 ? (
                  <div className="d-flex flex-column gap-2 mb-2">
                    {cues.map((cue, cueIndex) => {
                      const offset = Number(segment.startSec || 0);
                      return (
                        <div key={`${cueIndex}-${cue.start}`} className="border rounded p-2 bg-white">
                          <div className="small text-secondary mb-1">
                            SRT {formatSrtTime(offset + cue.start)} → {formatSrtTime(offset + cue.end)}
                          </div>
                          <textarea
                            className="form-control"
                            rows={2}
                            value={cue.text}
                            aria-label={`Lời thoại phụ đề ${cueIndex + 1}`}
                            onChange={(event) => setCues((previous) => previous.map((item, index) =>
                              index === cueIndex ? { ...item, text: event.target.value } : item
                            ))}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    className="form-control mb-2"
                    rows={4}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                )}
                <div className="d-flex gap-2 flex-wrap">
                  <button
                    className="btn btn-outline-dark btn-sm"
                    onClick={handleSaveText}
                    disabled={saving}
                  >
                    {saving ? "Đang lưu…" : saved ? "✓ Đã lưu" : "Lưu transcript"}
                  </button>
                  <a
                    className="btn btn-outline-dark btn-sm"
                    href={srtDownloadUrl(jobId, segment.index)}
                    download
                  >
                    Tải SRT
                  </a>
                </div>
              </div>

              <div className="bg-body-tertiary rounded p-3">
                <div className="small text-uppercase text-secondary fw-bold mb-2">
                  Tạo giọng nói theo từng mốc SRT
                </div>
                {cues.length > 0 && (
                  <div className="text-muted small mb-2">
                    Mỗi dòng phụ đề được tạo audio riêng, căn theo thời gian SRT rồi ghép vào đoạn video.
                  </div>
                )}
                <div className="d-flex gap-2 flex-wrap align-items-center">
                  <select
                    className="form-select form-select-sm"
                    style={{ maxWidth: 260 }}
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                  >
                    <option value="">-- Chọn giọng nói --</option>
                    {voices.map((v) => (
                      <option key={v.voice_id} value={v.voice_id}>
                        {v.name} ({v.gender})
                      </option>
                    ))}
                  </select>
                  {selectedVoice?.preview_url && (
                    <button
                      type="button"
                      className="btn btn-outline-dark btn-sm"
                      title="Nghe thử giọng này"
                      onClick={() => {
                        if (previewRef.current) {
                          previewRef.current.src = selectedVoice.preview_url;
                          previewRef.current.play();
                          setPreviewing(true);
                        }
                      }}
                    >
                      ▶ {previewing ? "Đang phát…" : "Nghe thử"}
                    </button>
                  )}
                  <select
                    className="form-select form-select-sm"
                    style={{ maxWidth: 140 }}
                    value={ttsLanguage}
                    onChange={(e) => setTtsLanguage(e.target.value)}
                    title="Ngôn ngữ chuẩn hóa văn bản cho TTS (số, ngày giờ, viết tắt…)"
                  >
                    <option value="vi">Chuẩn hoá: Việt</option>
                    <option value="en">Chuẩn hoá: Anh</option>
                  </select>
                  <button
                    className="btn btn-warning btn-sm"
                    onClick={handleGenerateVoice}
                    disabled={submitting || isTtsBusy}
                  >
                    {isTtsQueued
                      ? "Đang xếp hàng…"
                      : isTtsBusy
                      ? segment.ttsProgress
                        ? `Đang tạo giọng… (${segment.ttsProgress})`
                        : "Đang tạo giọng…"
                      : "Tạo giọng nói"}
                  </button>
                </div>
                {!voiceId && (
                  <div className="text-warning small mt-1">⚠ Chọn một giọng nói ở trên trước.</div>
                )}
                <div className="text-muted small mt-1">
                  Tự nhận diện: {LANGUAGE_LABEL[segment.language] || segment.language || "—"} (theo
                  SRT) — có thể đổi lại ở ô "Chuẩn hoá" nếu nhận sai.
                </div>
                {isTtsBusy && segment.ttsProgress && (
                  <div className="text-muted small mt-1">
                    {cues.length > 0
                      ? `Đang tạo voice theo từng dòng SRT (dòng ${segment.ttsProgress}).`
                      : `Đang gửi từng phần văn bản đến Resona (phần ${segment.ttsProgress}).`}
                  </div>
                )}

                {ttsLanguage !== "vi" && (
                  <div className="alert alert-warning py-2 px-3 mt-2 mb-0 small">
                    Đang chuẩn hoá theo tiếng {LANGUAGE_LABEL[ttsLanguage] || ttsLanguage}, nhưng
                    toàn bộ giọng nói hiện có trong tài khoản Resona đều là giọng Việt — phát âm có
                    thể không chuẩn.
                  </div>
                )}

                {isTtsDone && (
                  <div className="mt-3">
                    <a
                      className="btn btn-outline-dark btn-sm"
                      href={ttsAudioUrl(jobId, segment.index)}
                      download
                    >
                      Tải audio
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
