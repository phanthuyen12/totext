// These processors call CPU-heavy ffmpeg/Whisper child processes and can compete
// for a busy local machine. Leave BullMQ more time for automatic lock renewal
// before treating a slow heartbeat as a dead worker.
export const workerLockOptions = {
  lockDuration: 5 * 60 * 1000,
};
