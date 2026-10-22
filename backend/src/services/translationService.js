import axios from "axios";
import { config } from "../config/env.js";

/** Translate one subtitle cue to Vietnamese, preserving its timing separately. */
export async function translateToVietnamese(text, sourceLanguage) {
  const source = String(sourceLanguage || "").split(/[-_]/)[0].toLowerCase();
  if (!text?.trim() || !source || source === "vi") return text;

  const { data } = await axios.post(config.translationUrl, {
    q: text,
    source,
    target: "vi",
    format: "text",
    ...(config.translationApiKey ? { api_key: config.translationApiKey } : {}),
  }, { timeout: 30000 });
  const translated = data?.translatedText?.trim();
  if (!translated) throw new Error("Translation service returned an empty translation");
  return translated;
}
