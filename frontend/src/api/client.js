import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

// Debug logging so the browser console shows every call this app makes —
// useful to confirm whether a button click actually fired a request or not.
api.interceptors.request.use((req) => {
  console.log(`[api] -> ${req.method?.toUpperCase()} ${req.url}`, req.data || "");
  return req;
});
api.interceptors.response.use(
  (res) => {
    console.log(`[api] <- ${res.status} ${res.config.method?.toUpperCase()} ${res.config.url}`, res.data);
    return res;
  },
  (err) => {
    console.error(
      `[api] <- ${err.response?.status || "ERR"} ${err.config?.method?.toUpperCase()} ${err.config?.url}`,
      err.response?.data || err.message
    );
    return Promise.reject(err);
  }
);

export function uploadVideo(file, onProgress) {
  const form = new FormData();
  form.append("video", file);
  return api
    .post("/jobs/video", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
    })
    .then((r) => r.data);
}

export function uploadVoiceToText(file, onProgress) {
  const form = new FormData();
  form.append("audio", file);
  return api
    .post("/jobs/voice-to-text", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
    })
    .then((r) => r.data);
}

export function getJob(jobId) {
  return api.get(`/jobs/${jobId}`).then((r) => r.data);
}

export function listJobs() {
  return api.get("/jobs").then((r) => r.data.jobs);
}

export function deleteJob(jobId) {
  return api.delete(`/jobs/${jobId}`).then((r) => r.data);
}

export function updateSegmentText(jobId, index, textOrCues) {
  const body = Array.isArray(textOrCues) ? { cues: textOrCues } : { text: textOrCues };
  return api.patch(`/jobs/${jobId}/segments/${index}`, body).then((r) => r.data);
}

export function retrySegmentTranscription(jobId, index) {
  return api.post(`/jobs/${jobId}/segments/${index}/retry-transcription`).then((r) => r.data);
}

export function generateSegmentTts(jobId, index, voiceId, language) {
  return api
    .post(`/jobs/${jobId}/segments/${index}/tts`, { voiceId, language })
    .then((r) => r.data);
}

export function generateAllSegmentsTts(jobId, voiceId, language) {
  return api.post(`/jobs/${jobId}/segments/tts-all`, { voiceId, language }).then((r) => r.data);
}

export function mergeJobVideo(jobId, musicFile) {
  if (musicFile) {
    const form = new FormData();
    form.append("music", musicFile);
    return api
      .post(`/jobs/${jobId}/merge`, form, { headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => r.data);
  }
  return api.post(`/jobs/${jobId}/merge`).then((r) => r.data);
}

export function finalVideoUrl(jobId) {
  return `/api/jobs/${jobId}/final-video`;
}

export function srtDownloadUrl(jobId, index) {
  return `/api/jobs/${jobId}/segments/${index}/srt`;
}

export function fullVideoSrtUrl(jobId) {
  return `/api/jobs/${jobId}/srt`;
}

export function videoChunkUrl(jobId, index) {
  return `/api/jobs/${jobId}/segments/${index}/video`;
}

export function ttsAudioUrl(jobId, index) {
  return `/api/jobs/${jobId}/segments/${index}/tts-audio`;
}

export function listVoices(params) {
  return api.get("/voices", { params }).then((r) => r.data);
}
