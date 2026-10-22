import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config/env.js";

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/translate.py");

/** Translate one subtitle cue to Vietnamese, preserving its timing separately. */
export async function translateToVietnamese(text, sourceLanguage) {
  const source = String(sourceLanguage || "").split(/[-_]/)[0].toLowerCase();
  if (!text?.trim() || !source || source === "vi") return text;

  return new Promise((resolve, reject) => {
    const child = spawn(config.translationPython, [scriptPath, source], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => reject(new Error(`Failed to start translation process: ${err.message}`)));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python translation failed${stderr.trim() ? `: ${stderr.trim()}` : ` (exit ${code})`}`));
        return;
      }
      const translated = stdout.trim();
      if (!translated) reject(new Error("Translation returned an empty result"));
      else resolve(translated);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(text);
  });
}
