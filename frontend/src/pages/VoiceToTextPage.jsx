import { useEffect, useRef, useState } from "react";
import { uploadVoiceToText, getJob, srtDownloadUrl, listJobs, retrySegmentTranscription } from "../api/client.js";
import Dropzone from "../components/Dropzone.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import JobHistoryList from "../components/JobHistoryList.jsx";

export default function VoiceToTextPage() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    listJobs()
      .then((all) => setJobs(all.filter((j) => j.type === "audio")))
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false));
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError("");
    setJob(null);
    try {
      const { jobId } = await uploadVoiceToText(file, setProgress);
      poll(jobId);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
    }
  }

  function poll(jobId) {
    getJob(jobId)
      .then((data) => {
        setJob(data);
        const seg = data.segments[0];
        if (!seg || ["cut", "extracting_audio", "transcribing"].includes(seg.status)) {
          timerRef.current = setTimeout(() => poll(jobId), 2000);
        }
      })
      .catch((err) => setError(err.response?.data?.error || err.message));
  }

  async function retryTranscription() {
    if (!job || !segment) return;
    setRetrying(true);
    try {
      await retrySegmentTranscription(job.id, segment.index);
      poll(job.id);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setRetrying(false);
    }
  }

  const segment = job?.segments?.[0];
  const isBusy = segment && ["cut", "extracting_audio", "transcribing"].includes(segment.status);
  const canRetry = segment && (
    segment.status === "failed" ||
    (isBusy && Date.now() - Date.parse(segment.updatedAt || "") > 5 * 60 * 1000)
  );

  return (
    <div className="container py-4" style={{ maxWidth: 1240 }}>
      <div className="mb-4">
        <h1 className="h3">Voice to Text</h1>
        <p className="text-muted">
          Upload một file audio/video ngắn, hệ thống chuyển giọng nói thành văn bản (và SRT) ngay —
          không cắt thành nhiều đoạn.
        </p>
        <p className="small text-muted mb-0">Job và tệp tải lên sẽ tự xoá sau 1 giờ kể từ lần hoạt động cuối.</p>
      </div>

      <div className="row g-4 align-items-start">
      <div className="col-xl-7">
      <form onSubmit={handleSubmit} className="card p-4">
        <Dropzone accept="audio/*,video/*" file={file} onFile={setFile} hint="MP3, WAV, M4A, MP4…" />

        {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}

        {uploading && (
          <div className="mt-3">
            <div className="d-flex justify-content-between small mb-1">
              <span>Đang upload…</span>
              <span className="text-muted">{progress}%</span>
            </div>
            <div className="progress" style={{ height: 8 }}>
              <div className="progress-bar bg-warning" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <button type="submit" className="btn btn-warning w-100 mt-3" disabled={!file || uploading}>
          {uploading ? "Đang upload…" : "Chuyển giọng nói → văn bản"}
        </button>
      </form>

      {segment && (
        <div className="card p-4 mt-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <strong>Kết quả</strong>
            <StatusBadge status={segment.status} />
          </div>
          {segment.error && <div className="alert alert-danger">{segment.error}</div>}
          {canRetry && (
            <button className="btn btn-outline-warning btn-sm mb-3" onClick={retryTranscription} disabled={retrying}>
              {retrying ? "Đang xếp lại…" : "Chạy lại nhận diện"}
            </button>
          )}
          {isBusy && (
            <div className="text-center text-secondary py-3">
              <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Đang xử lý…
            </div>
          )}
          {segment.status === "transcribed" && (
            <>
              <textarea className="form-control mb-3" rows={8} readOnly value={segment.transcriptText} />
              <a className="btn btn-outline-dark" href={srtDownloadUrl(job.id, 0)} download>
                Tải SRT
              </a>
            </>
          )}
        </div>
      )}

      </div>
      <div className="col-xl-5">
      <section className="card p-3 panel-history">
        <h2 className="h6 text-uppercase text-secondary mb-3">Lịch sử Voice to Text</h2>
        <JobHistoryList
          jobs={jobs}
          loading={loadingJobs}
          onDeleted={(ids) => setJobs((prev) => prev.filter((j) => !ids.includes(j.id)))} emptyHint="Chưa có job Voice to Text nào." />
      </section>
      </div>
      </div>
    </div>
  );
}
