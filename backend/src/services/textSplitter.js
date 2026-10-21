// Resona charges "voice credits" ~= 1 per character after stripping whitespace,
// and rejects requests outside [50, 2000] credits (section_credit_limit_exceeded).
// A single transcript from a ~4-minute video segment easily blows past 2000, so
// long text must be split into smaller requests before calling text-to-speech.

export function textCredits(text) {
  return text.replace(/\s/g, "").length;
}

const SENTENCE_SPLIT_RE = /(?<=[.!?…])\s+/;

function splitLongSentence(sentence, maxCredits) {
  const words = sentence.split(/\s+/);
  const chunks = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && textCredits(candidate) > maxCredits) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Splits text into chunks that each fit Resona's per-request credit window,
 * breaking at sentence boundaries where possible so the voice doesn't cut
 * mid-sentence. Returns the chunks in order; each is safe to send as-is to
 * POST /api/v2/text-to-speech.
 */
export function splitTextForTts(text, { maxCredits = 1800, minCredits = 50 } = {}) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (textCredits(trimmed) <= maxCredits) return [trimmed];

  const sentences = trimmed.split(SENTENCE_SPLIT_RE).flatMap((s) =>
    textCredits(s) > maxCredits ? splitLongSentence(s, maxCredits) : [s]
  );

  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && textCredits(candidate) > maxCredits) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  // Merge a too-small trailing chunk into its neighbor so every request clears
  // Resona's 50-credit minimum.
  while (chunks.length > 1 && textCredits(chunks[chunks.length - 1]) < minCredits) {
    const last = chunks.pop();
    const merged = `${chunks[chunks.length - 1]} ${last}`;
    if (textCredits(merged) <= 2000) {
      chunks[chunks.length - 1] = merged;
    } else {
      chunks.push(last); // can't merge without busting the hard cap — leave as-is
      break;
    }
  }

  return chunks;
}
