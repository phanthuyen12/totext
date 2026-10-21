import { Queue } from "bullmq";
import { createRedisConnection } from "../config/redisClient.js";

const connection = createRedisConnection();

export const videoQueue = new Queue("video-split", { connection });
export const transcribeQueue = new Queue("transcribe-segment", { connection });
export const ttsQueue = new Queue("tts-segment", { connection });
export const mergeQueue = new Queue("merge-video", { connection });

const defaultJobOptions = {
  attempts: 2,
  backoff: { type: "fixed", delay: 5000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
};

export function enqueueVideoSplit(data) {
  return videoQueue.add("cut-video", data, defaultJobOptions);
}

export function enqueueTranscribe(data) {
  return transcribeQueue.add("transcribe-segment", data, defaultJobOptions);
}

export function enqueueTts(data) {
  return ttsQueue.add("tts-segment", data, defaultJobOptions);
}

export function enqueueMerge(data) {
  return mergeQueue.add("merge-video", data, defaultJobOptions);
}
