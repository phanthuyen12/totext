import { statusMeta } from "../utils/statusMeta.js";

export default function StatusBadge({ status, kind = "segment" }) {
  const meta = statusMeta(status, kind);
  return (
    <span className={`badge rounded-1 text-uppercase ${meta.badgeClass}`}>
      {meta.spinning && (
        <span className="spinner-border spinner-border-sm me-1" style={{ width: 10, height: 10 }} aria-hidden="true" />
      )}
      {meta.label}
    </span>
  );
}
