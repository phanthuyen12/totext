function formatTimestamp(totalSeconds) {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

function parseTimestamp(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(value);
  if (!match) throw new Error(`Invalid SRT timestamp: ${value}`);
  return Number(match[1]) * 3600000 + Number(match[2]) * 60000 + Number(match[3]) * 1000 + Number(match[4]);
}

function formatMilliseconds(ms) {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/**
 * Builds an SRT file body from whisper segments: [{start, end, text}].
 */
export function segmentsToSrt(segments) {
  return segments
    .map((seg, i) => {
      const index = i + 1;
      const start = formatTimestamp(seg.start);
      const end = formatTimestamp(seg.end);
      return `${index}\n${start} --> ${end}\n${seg.text}\n`;
    })
    .join("\n");
}

export function segmentsToPlainText(segments) {
  return segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
}

export function parseSrtCues(content) {
  const blocks = content.trim().split(/\r?\n\s*\r?\n/).filter(Boolean);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const timeLineIndex = lines.findIndex((line) => line.includes(" --> "));
    if (timeLineIndex < 0) continue;
    const match = /^(\S+) --> (\S+)$/.exec(lines[timeLineIndex].trim());
    if (!match) continue;
    const text = lines.slice(timeLineIndex + 1).join("\n").trim();
    if (!text) continue;
    cues.push({
      start: parseTimestamp(match[1]) / 1000,
      end: parseTimestamp(match[2]) / 1000,
      text,
    });
  }
  return cues;
}

/** Joins per-video-chunk SRTs into one timeline and renumbers every cue. */
export function combineSrtFiles(parts) {
  let cueIndex = 1;
  const cues = [];
  for (const { content, offsetSeconds = 0 } of parts) {
    const offsetMs = Math.round(offsetSeconds * 1000);
    const blocks = content.trim().split(/\r?\n\s*\r?\n/).filter(Boolean);
    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      const timeLineIndex = lines.findIndex((line) => line.includes(" --> "));
      if (timeLineIndex < 0) continue;
      const times = /^(\S+) --> (\S+)$/.exec(lines[timeLineIndex].trim());
      if (!times) continue;
      lines[0] = String(cueIndex++);
      lines[timeLineIndex] = `${formatMilliseconds(parseTimestamp(times[1]) + offsetMs)} --> ${formatMilliseconds(parseTimestamp(times[2]) + offsetMs)}`;
      cues.push(lines.join("\n"));
    }
  }
  return cues.length ? `${cues.join("\n\n")}\n` : "";
}
