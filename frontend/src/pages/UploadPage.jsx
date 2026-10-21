import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadVideo, listJobs } from "../api/client.js";
import Dropzone from "../components/Dropzone.jsx";
import JobHistoryList from "../components/JobHistoryList.jsx";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const { jobId } = await uploadVideo(file, setProgress);
      navigate(`/jobs/${jobId}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="container py-4" style={{ maxWidth: 1240 }}>
      <div className="mb-4">
        <h1 className="h3">Video dài → chia đoạn 1 phút → SRT → đổi giọng nói</h1>
        <p className="text-muted">
          Upload video dài, hệ thống tự cắt thành các đoạn ~1 phút, nhận diện giọng nói thành
          transcript/SRT và tự nhận diện ngôn ngữ cho từng đoạn, rồi bạn chọn giọng (Resona) để tạo
          lại audio. Khi đủ transcript, có thể tải một file SRT đã ghép đúng timeline video.
        </p>
        <p className="small text-muted mb-0">Job và các tệp video/giọng nói sẽ tự xoá sau 1 giờ kể từ lần hoạt động cuối.</p>
      </div>

      <div className="row g-4 align-items-start">
      <div className="col-xl-7">
      <form onSubmit={handleSubmit} className="card p-4">
        <Dropzone accept="video/*" file={file} onFile={setFile} hint="MP4, MOV, MKV… tối đa 2GB" />

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
          {uploading ? "Đang upload…" : "Upload & bắt đầu xử lý"}
        </button>
      </form>
      </div>
      <div className="col-xl-5">
      <section className="card p-3 panel-history">
        <h2 className="h6 text-uppercase text-secondary mb-3">Job gần đây</h2>
        <JobHistoryList
          jobs={jobs}
          loading={loadingJobs}
          onDeleted={(ids) => setJobs((prev) => prev.filter((j) => !ids.includes(j.id)))} emptyHint="Chưa upload video nào." />
      </section>
      </div>
      </div>
    </div>
  );
}
