import express from "express";
import { redis } from "../config/redisClient.js";
import { pingSqlite } from "../config/sqliteClient.js";

export const router = express.Router();

router.get("/", async (req, res) => {
  let redisOk = false;
  try {
    redisOk = (await redis.ping()) === "PONG";
  } catch {
    redisOk = false;
  }
  res.json({ ok: true, redis: redisOk, sqlite: pingSqlite() });
});
