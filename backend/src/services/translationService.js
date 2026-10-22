import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config/env.js";

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/translate.py");

/** Translate a segment's subtitle cues in one local Argos Translate process. */
export async function translateTextsToVietnamese(texts, sourceLanguage) {
  const source = String(sourceLanguage || "").split(/[-_]/)[0].toLowerCase();
  if (!source || source === "vi") return texts;
  if (!Array.isArray(texts) || texts.length === 0) return [];

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
      try {
        const translated = JSON.parse(stdout);
        if (!Array.isArray(translated) || translated.length !== texts.length || translated.some((text) => !text)) {
          reject(new Error("Translation returned an invalid result"));
        } else resolve(translated);
      } catch (err) {
        reject(new Error(`Could not parse translation result: ${err.message}`));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(texts));
  });
}
