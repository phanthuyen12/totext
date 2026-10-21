import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config/env.js";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const jobId = req.jobId || (req.jobId = uuidv4());
    const dir = path.join(config.uploadDir, jobId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `original${path.extname(file.originalname) || ""}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
});
