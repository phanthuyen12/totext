import { Routes, Route, useLocation } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import UploadPage from "./pages/UploadPage.jsx";
import JobDetailPage from "./pages/JobDetailPage.jsx";
import VoiceToTextPage from "./pages/VoiceToTextPage.jsx";
import VoicesPage from "./pages/VoicesPage.jsx";

const TITLES = [
  ["/voice-to-text", "Voice to Text"],
  ["/voices", "Voices"],
  ["/jobs", "Chi tiết job"],
  ["/", "Video → Dub"],
];

export default function App() {
  const { pathname } = useLocation();
  const title = (TITLES.find(([p]) => (p === "/" ? pathname === "/" : pathname.startsWith(p))) || TITLES[3])[1];
  return (
    <div className="app">
      <Nav />
      <main className="main">
        <header className="topbar">
          <div className="topbar-crumb">
            <span>Workspace</span> <span className="topbar-sep">/</span> <strong>{title}</strong>
          </div>
          <span className="topbar-pill">● Sẵn sàng</span>
        </header>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          <Route path="/voice-to-text" element={<VoiceToTextPage />} />
          <Route path="/voices" element={<VoicesPage />} />
        </Routes>
      </main>
    </div>
  );
}
