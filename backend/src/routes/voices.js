import express from "express";
import { redis } from "../config/redisClient.js";
import * as resonaService from "../services/resonaService.js";

export const router = express.Router();

const CACHE_TTL_SECONDS = 300;

// GET /api/voices - proxies Resona GET /api/v2/voices, cached in Redis for 5 minutes
router.get("/", async (req, res, next) => {
  try {
    const cacheKey = `voices:cache:${new URLSearchParams(req.query).toString()}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const data = await resonaService.listVoices(req.query);
    await redis.set(cacheKey, JSON.stringify(data), "EX", CACHE_TTL_SECONDS);
    res.json(data);
  } catch (err) {
    if (err.code === "missing_api_key") {
      return res.status(501).json({ error: err.message });
    }
    next(err);
  }
});
