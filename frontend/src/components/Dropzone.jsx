import { useRef, useState } from "react";

export default function Dropzone({ accept, file, onFile, hint }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  }

  return (
    <div
      className={`dropzone ${dragOver ? "dropzone-over" : ""} ${file ? "dropzone-has-file" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <div className="dropzone-icon">⬆</div>
      {file ? (
        <>
          <div className="dropzone-filename">{file.name}</div>
          <div className="text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB — bấm để chọn file khác</div>
        </>
      ) : (
        <>
          <div>Kéo thả file vào đây, hoặc bấm để chọn</div>
          {hint && <div className="text-muted">{hint}</div>}
        </>
      )}
    </div>
  );
}
