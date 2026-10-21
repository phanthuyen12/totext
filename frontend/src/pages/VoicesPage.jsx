import { useEffect, useState } from "react";
import { listVoices } from "../api/client.js";

export default function VoicesPage() {
  const [voices, setVoices] = useState([]);
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError("");
    listVoices({ search: search || undefined, gender: gender || undefined, page_size: 50 })
      .then((data) => setVoices(data.voices || []))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container py-4" style={{ maxWidth: 1240 }}>
      <div className="mb-4">
        <h1 className="h3">Giọng nói (Resona)</h1>
        <p className="text-muted">Danh sách giọng nói public + giọng clone của bạn trên Resona.live.</p>
      </div>

      <div className="alert alert-warning small">
        Toàn bộ giọng nói trong tài khoản này đều là giọng Việt (miền Bắc/Trung/Nam) — dùng cho
        video/văn bản tiếng Anh hoặc ngôn ngữ khác có thể phát âm không chuẩn, vì đây là giới hạn
        catalog giọng nói từ phía Resona, không có giọng clone/tiếng Anh nào trong tài khoản này.
      </div>

      <form
        className="d-flex gap-2 flex-wrap mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <input
          className="form-control"
          style={{ maxWidth: 260 }}
          placeholder="Tìm theo tên/thẻ…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-select"
          style={{ maxWidth: 200 }}
          value={gender}
          onChange={(e) => setGender(e.target.value)}
        >
          <option value="">Tất cả giới tính</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="neutral">Neutral</option>
        </select>
        <button type="submit" className="btn btn-warning">
          Tìm
        </button>
      </form>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && (
        <div className="text-center text-secondary py-4">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Đang tải…
        </div>
      )}

      {!loading && !error && voices.length === 0 && (
        <div className="text-center text-secondary py-4">Không tìm thấy giọng nói nào.</div>
      )}

      <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3">
        {voices.map((v) => (
          <div className="col" key={v.voice_id}>
            <div className="card p-3 h-100">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <strong>{v.name}</strong>
                {v.is_featured && <span className="badge bg-warning text-dark">Nổi bật</span>}
              </div>
              <div className="text-muted small mb-2">
                {v.gender} · {v.accent} · {v.category}
              </div>
              {v.preview_url && <audio controls src={v.preview_url} style={{ width: "100%" }} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
