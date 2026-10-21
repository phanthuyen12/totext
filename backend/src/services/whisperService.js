import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(__dirname, "../../scripts/transcribe.py");

/**
 * Runs scripts/transcribe.py as a subprocess and parses its JSON stdout.
 * Returns { language, languageProbability, segments: [{start, end, text}] }.
 */
export function transcribe(audioPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      config.whisperPython,
      [
        scriptPath,
        audioPath,
        config.whisperModel,
        config.whisperDevice,
        config.whisperComputeType,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (err) => {
      reject(new Error(`Failed to start whisper process: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`whisper process exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim().split("\n").pop());
        resolve({
          language: parsed.language,
          languageProbability: parsed.language_probability,
          segments: parsed.segments || [],
        });
      } catch (err) {
        reject(new Error(`Failed to parse whisper output: ${err.message}\nstdout: ${stdout}`));
      }
    });
  });
}
