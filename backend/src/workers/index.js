import { startVideoWorker } from "./videoWorker.js";
import { startTranscribeWorker } from "./transcribeWorker.js";
import { startTtsWorker } from "./ttsWorker.js";
import { startMergeWorker } from "./mergeWorker.js";

export function startAllWorkers() {
  const workers = {
    "video-split": startVideoWorker(),
    "transcribe-segment": startTranscribeWorker(),
    "tts-segment": startTtsWorker(),
    "merge-video": startMergeWorker(),
  };
  for (const [name, worker] of Object.entries(workers)) {
    worker.on("stalled", (jobId) => {
      console.warn(`[${name}] job ${jobId} lost its lock and was returned to the queue`);
    });
    worker.on("lockRenewalFailed", (jobIds) => {
      console.error(`[${name}] failed to renew lock for job(s): ${jobIds.join(", ")}`);
    });
    worker.on("error", (err) => {
      console.error(`[${name}] worker error:`, err.message);
    });
  }
  console.log(
    "[workers] video-split, transcribe-segment, tts-segment, merge-video workers started"
  );
  return workers;
}
