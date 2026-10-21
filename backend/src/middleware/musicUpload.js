import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config/env.js";

const allowedExtensions = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".mp4", ".m4v", ".mov"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(config.outputDir, req.params.jobId, "music");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `background${path.extname(file.originalname).toLowerCase()}`);
  },
});

export const musicUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedExtensions.has(path.extname(file.originalname).toLowerCase())) {
      cb(new Error("File nhạc phải là MP3, WAV, M4A, AAC, OGG, FLAC hoặc video MP4/MOV có tiếng"));
      return;
    }
    cb(null, true);
  },
});
