import { useState } from "react";
import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge.jsx";
import { JOB_TYPE_LABEL } from "../utils/statusMeta.js";
import { deleteJob } from "../api/client.js";

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

// onDeleted(ids) is called after jobs are removed on the server so the parent can drop them from its list
export default function JobHistoryList({ jobs, loading, emptyHint, onDeleted }) {
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (loading) {
    return (
      <div className="text-center text-secondary py-4">
        <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Đang tải lịch sử…
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return <div className="text-center text-secondary py-4">{emptyHint || "Chưa có job nào."}</div>;
  }

  const allSelected = selected.size === jobs.length;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function remove(ids) {
    if (!window.confirm(`Xoá ${ids.length} job? Video, transcript và audio của job sẽ bị xoá vĩnh viễn.`)) return;
    setDeleting(true);
    setError("");
    const done = [];
    for (const id of ids) {
      try {
        await deleteJob(id);
        done.push(id);
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      }
    }
    setSelected((prev) => new Set([...prev].filter((id) => !done.includes(id))));
    if (done.length) onDeleted?.(done);
    setDeleting(false);
  }

  return (
    <>
      {onDeleted && (
        <div className="job-toolbar d-flex align-items-center gap-2 mb-2">
          <label className="d-flex align-items-center gap-2 small mb-0">
            <input
              type="checkbox"
              className="form-check-input mt-0"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(jobs.map((j) => j.id)))}
            />
            Chọn tất cả
          </label>
          <button
            type="button"
            className="btn btn-sm btn-danger ms-auto"
            disabled={selected.size === 0 || deleting}
            onClick={() => remove([...selected])}
          >
            {deleting ? "Đang xoá…" : `Xoá đã chọn (${selected.size})`}
          </button>
        </div>
      )}
      {error && <div className="alert alert-danger py-2 small">{error}</div>}
      <div className="d-flex flex-column gap-2">
        {jobs.map((job) => (
          <div key={job.id} className="d-flex align-items-stretch gap-2">
            {onDeleted && (
              <input
                type="checkbox"
                className="form-check-input align-self-center mt-0"
                checked={selected.has(job.id)}
                onChange={() => toggle(job.id)}
                aria-label="Chọn job"
              />
            )}
            <Link
              to={`/jobs/${job.id}`}
              className="job-history-row flex-grow-1 d-flex justify-content-between align-items-center border rounded p-3"
            >
              <div className="d-flex flex-column">
                <strong>{job.originalFilename}</strong>
                <span className="text-secondary small">
                  {JOB_TYPE_LABEL[job.type] || job.type} · {job.segmentCount} đoạn ·{" "}
                  {formatTime(job.createdAt)}
                </span>
              </div>
              <StatusBadge status={job.status} kind="job" />
            </Link>
            {onDeleted && (
              <button
                type="button"
                className="btn btn-outline-danger btn-sm align-self-center"
                title="Xoá job này"
                disabled={deleting}
                onClick={() => remove([job.id])}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
