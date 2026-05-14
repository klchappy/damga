/**
 * Redis singleton client.
 *
 * REDIS_URL set değilse `null` döner — caller graceful fallback yapmalı.
 *
 * Upstash, Coolify self-hosted Redis, AWS ElastiCache, Hetzner managed —
 * hepsi destekleniyor (rediss:// veya redis://).
 */
import IORedis, { type Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './../config/logger';

let _client: Redis | null = null;
let _initialized = false;

export function getRedis(): Redis | null {
  if (_initialized) return _client;
  _initialized = true;
  if (!env.REDIS_URL) {
    logger.info('Redis URL set değil — BullMQ/cache devre dışı, in-process fallback');
    return null;
  }
  try {
    _client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // BullMQ gerektirir
      enableReadyCheck: false, // BullMQ gerektirir (Bull v5)
      lazyConnect: false,
    });
    _client.on('error', (err) => logger.warn({ err: err.message }, 'Redis client error'));
    _client.on('connect', () => logger.info('🔴 Redis bağlandı'));
    return _client;
  } catch (err) {
    logger.warn({ err }, 'Redis init başarısız — null döner');
    return null;
  }
}

export function isRedisAvailable(): boolean {
  return getRedis() !== null;
}

export async function closeRedis(): Promise<void> {
  if (_client) {
    await _client.quit().catch(() => {});
    _client = null;
    _initialized = false;
  }
}
