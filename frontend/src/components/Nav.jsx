import { NavLink } from "react-router-dom";

const ITEMS = [
  { to: "/", end: true, icon: "▶", label: "Video → Dub", hint: "Cắt & đổi giọng" },
  { to: "/voice-to-text", icon: "≡", label: "Voice to Text", hint: "Âm thanh → văn bản" },
  { to: "/voices", icon: "◉", label: "Voices", hint: "Thư viện giọng nói" },
];

export default function Nav() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">VT</span>
        <div>
          <div className="sidebar-title">Voice Studio</div>
          <div className="sidebar-sub">Dubbing toolkit</div>
        </div>
      </div>
      <div className="sidebar-section">Workspace</div>
      <nav className="sidebar-nav">
        {ITEMS.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className="sidebar-link">
            <span className="sidebar-icon">{it.icon}</span>
            <span>
              <span className="sidebar-label">{it.label}</span>
              <span className="sidebar-hint">{it.hint}</span>
            </span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">v1.0 · Resona TTS</div>
    </aside>
  );
}
