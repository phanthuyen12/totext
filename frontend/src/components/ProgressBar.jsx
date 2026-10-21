export default function ProgressBar({ label, done, total }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="d-flex justify-content-between small mb-1">
        <span>{label}</span>
        <span className="text-secondary">
          {done}/{total} ({pct}%)
        </span>
      </div>
      <div className="progress" role="progressbar" style={{ height: 8 }}>
        <div className="progress-bar bg-warning" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
