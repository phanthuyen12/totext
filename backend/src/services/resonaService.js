import axios from "axios";
import fs from "node:fs";
import { config } from "../config/env.js";

function client() {
  if (!config.resonaApiKey) {
    const err = new Error(
      "RESONA_API_KEY chưa được cấu hình trong backend/.env"
    );
    err.code = "missing_api_key";
    throw err;
  }
  return axios.create({
    baseURL: config.resonaApiBase,
    headers: { Authorization: `Bearer ${config.resonaApiKey}` },
    timeout: config.resonaRequestTimeoutMs,
  });
}

function toResonaError(err) {
  console.error(`[resona] ${err.config?.method?.toUpperCase() || "?"} ${err.config?.url || "?"} failed:`, err.response?.data || err.message);
  const detail = err.response?.data?.detail;
  if (detail) {
    const wrapped = new Error(detail.message || "Resona API error");
    wrapped.status = detail.status;
    wrapped.httpStatus = err.response.status;
    return wrapped;
  }
  return err;
}

export async function listVoices(params) {
  try {
    console.log("[resona] GET /voices", params);
    const { data } = await client().get("/api/v2/voices", { params });
    return data;
  } catch (err) {
    throw toResonaError(err);
  }
}

export async function textToSpeech({ text, voiceId, language = "vi" }) {
  try {
    console.log(`[resona] POST /text-to-speech voiceId=${voiceId} language=${language} textLength=${text.length}`);
    const { data } = await client().post("/api/v2/text-to-speech", {
      text,
      voice_id: voiceId,
      language,
    });
    console.log(`[resona] text-to-speech accepted, request_id=${data.request_id}`);
    return data;
  } catch (err) {
    throw toResonaError(err);
  }
}

export async function getTextToSpeechResult(requestId) {
  try {
    const { data } = await client().get(`/api/v2/text-to-speech/${requestId}`);
    console.log(`[resona] text-to-speech/${requestId} status=${data.status}`);
    return data;
  } catch (err) {
    throw toResonaError(err);
  }
}

export async function textToDialogue({ input, language = "vi" }) {
  try {
    const { data } = await client().post("/api/v2/text-to-dialogue", {
      input,
      language,
    });
    return data;
  } catch (err) {
    throw toResonaError(err);
  }
}

export async function getTextToDialogueResult(requestId) {
  try {
    const { data } = await client().get(`/api/v2/text-to-dialogue/${requestId}`);
    return data;
  } catch (err) {
    throw toResonaError(err);
  }
}

/**
 * Polls a /text-to-speech or /text-to-dialogue result endpoint until it
 * leaves "processing", or throws after timeoutMs.
 */
export async function pollUntilDone(fetchFn, { intervalMs = 3000, timeoutMs = 120000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const result = await fetchFn();
    if (result.status !== "processing") return result;
    if (Date.now() > deadline) {
      const err = new Error("Timed out waiting for Resona TTS result");
      err.code = "poll_timeout";
      throw err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export async function downloadToFile(url, destPath) {
  const response = await axios.get(url, { responseType: "stream", timeout: 60000 });
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
  return destPath;
}
