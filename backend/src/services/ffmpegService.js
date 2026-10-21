import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

export async function getDurationSeconds(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const seconds = parseFloat(stdout.trim());
  if (Number.isNaN(seconds)) {
    throw new Error(`Could not read duration for ${filePath}`);
  }
  return seconds;
}

export async function hasAudioStream(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "a",
    "-show_entries", "stream=index",
    "-of", "csv=p=0",
    filePath,
  ]);
  return stdout.trim().length > 0;
}

/**
 * Splits a video into fixed-length chunks without re-encoding (stream copy),
 * so segment boundaries snap to the nearest keyframe rather than being exact.
 * Returns the list of generated chunk file paths, in order.
 */
export async function splitVideoIntoSegments(inputPath, outputDir, segmentSeconds) {
  await fs.mkdir(outputDir, { recursive: true });
  const pattern = path.join(outputDir, "segment-%03d.mp4");

  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-map",
    "0",
    "-c",
    "copy",
    "-f",
    "segment",
    "-segment_time",
    String(segmentSeconds),
    "-reset_timestamps",
    "1",
    pattern,
  ]);

  const files = (await fs.readdir(outputDir))
    .filter((f) => f.startsWith("segment-") && f.endsWith(".mp4"))
    .sort();
  return files.map((f) => path.join(outputDir, f));
}

/**
 * Extracts a 16kHz mono WAV from any audio/video file — the format faster-whisper expects.
 */
export async function extractAudioWav(inputPath, outputWavPath) {
  await fs.mkdir(path.dirname(outputWavPath), { recursive: true });
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "wav",
    outputWavPath,
  ]);
  return outputWavPath;
}
