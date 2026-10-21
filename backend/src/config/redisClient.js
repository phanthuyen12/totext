import Redis from "ioredis";
import { config } from "./env.js";

// BullMQ requires maxRetriesPerRequest: null on the connection it manages.
export function createRedisConnection() {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}

export const redis = createRedisConnection();
