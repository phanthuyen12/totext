import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { getDurationSeconds } from "./ffmpegService.js";

const execFileAsync = promisify(execFile);

/** Replaces the source video's audio with the generated voice. */
export async function muxVideoWithVoice(videoPath, ttsAudioPath, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-i", ttsAudioPath,
    "-filter_complex",
    "[1:a]apad,volume=1.0[aout]",
    "-map", "0:v:0",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    outputPath,
  ]);
  return outputPath;
}

/**
 * Concatenates several audio files (e.g. per-chunk TTS output from splitting
 * a long transcript across multiple Resona requests) into one track, in
 * order. Uses the `concat` filter (not the concat demuxer) so it doesn't
 * care whether inputs share the same codec/container.
 */
export async function concatAudioFiles(audioPaths, outputPath) {
  if (audioPaths.length === 1) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.copyFile(audioPaths[0], outputPath);
    return outputPath;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const inputArgs = audioPaths.flatMap((p) => ["-i", p]);
  const streamRefs = audioPaths.map((_, i) => `[${i}:a]`).join("");
  const filter = `${streamRefs}concat=n=${audioPaths.length}:v=0:a=1[aout]`;

  await execFileAsync("ffmpeg", [
    "-y",
    ...inputArgs,
    "-filter_complex", filter,
    "-map", "[aout]",
    outputPath,
  ]);
  return outputPath;
}

/**
 * Concatenates dubbed segments (same codecs, produced by muxVideoWithVoice)
 * into one final video, in order, via ffmpeg's concat demuxer.
 */
export async function concatVideos(segmentPaths, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const listPath = outputPath + ".list.txt";
  const listContent = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listPath, listContent, "utf-8");

  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    outputPath,
  ]);

  await fs.unlink(listPath).catch(() => {});
  return outputPath;
}

/** Mixes uploaded music under the dubbed voice. MP4/MOV files are treated as
 * audio sources; their video streams are ignored. Music loops or trims to fit. */
export async function addBackgroundMusic(videoPath, musicPath, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-stream_loop", "-1",
    "-i", musicPath,
    "-filter_complex",
    "[1:a]volume=0.18[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]",
    "-map", "0:v:0",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    outputPath,
  ]);
  return outputPath;
}

function atempoFilters(speed) {
  const factors = [];
  let remaining = speed;
  while (remaining > 2) {
    factors.push(2);
    remaining /= 2;
  }
  while (remaining < 0.5) {
    factors.push(0.5);
    remaining /= 0.5;
  }
  factors.push(remaining);
  return factors.map((factor) => `atempo=${factor.toFixed(5)}`).join(",");
}

/** Places each generated subtitle voice at its SRT start time and fits it to
 * that cue's duration. The resulting WAV has exactly the source segment length. */
export async function createTimedAudioTrack(cueAudioPaths, cues, durationSeconds, outputPath) {
  if (!cueAudioPaths.length || cueAudioPaths.length !== cues.length) {
    throw new Error("Thiếu audio hoặc mốc SRT để ghép giọng nói theo timeline");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Độ dài đoạn video không hợp lệ");
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const inputs = ["-f", "lavfi", "-t", String(durationSeconds), "-i", "anullsrc=r=48000:cl=stereo"];
  for (const audioPath of cueAudioPaths) inputs.push("-i", audioPath);

  const filters = [`[0:a]atrim=duration=${durationSeconds},asetpts=PTS-STARTPTS[base]`];
  const cueRefs = ["[base]"];
  for (let index = 0; index < cues.length; index++) {
    const cueStart = Math.max(0, Number(cues[index].start) || 0);
    const cueEnd = Math.min(durationSeconds, Number(cues[index].end) || 0);
    const cueDuration = cueEnd - cueStart;
    if (cueDuration <= 0) throw new Error(`Mốc SRT ${index + 1} không hợp lệ`);

    const sourceDuration = await getDurationSeconds(cueAudioPaths[index]);
    if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) {
      throw new Error(`Audio của phụ đề ${index + 1} không có thời lượng hợp lệ`);
    }
    const speed = sourceDuration / cueDuration;
    const delayMs = Math.round(cueStart * 1000);
    const ref = `[cue${index}]`;
    filters.push(
      `[${index + 1}:a]aresample=48000,${atempoFilters(speed)},apad,atrim=duration=${cueDuration},` +
      `asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}${ref}`
    );
    cueRefs.push(ref);
  }
  filters.push(`${cueRefs.join("")}amix=inputs=${cueRefs.length}:duration=first:dropout_transition=0:normalize=0[aout]`);

  await execFileAsync("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[aout]",
    "-t", String(durationSeconds),
    "-ar", "48000",
    "-ac", "2",
    "-c:a", "pcm_s16le",
    outputPath,
  ]);
  return outputPath;
}
