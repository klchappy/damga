// Sentry init EN BAŞTA — diğer import'ları monkey-patch eder (HTTP, Express vs.)
// SENTRY_DSN yoksa sessizce skip eder
import { initSentry, Sentry } from './lib/sentry';
initSentry();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env, isProd, isConfigured } from './config/env';
import { logger } from './config/logger';
import { apiRouter } from './routes';
import { errorHandler, notFound } from './middleware/error';
import { apiLimiter } from './middleware/rate-limit';
import { startScheduler, stopScheduler } from './lib/scheduler';
import { startHealthMonitor, stopHealthMonitor } from './lib/health-monitor';
import { startAccountCleanup, stopAccountCleanup } from './lib/account-cleanup';
import { isRedisAvailable, scheduleRepeatingJobs, startWorker, stopQueue } from './lib/queue';
import { processors } from './lib/queue-processors';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

// SECURITY: CORS izin listesi.
// Önceki versiyon /^https:\/\/[a-z0-9-]+\.deploi\.net$/ ile TÜM subdomain'lere
// açıktı; saldırgan herhangi bir subdomain'i (örn: attacker.deploi.net)
// alabilse veya subdomain takeover yapabilse credentials'lı request gönderebilirdi.
// Şimdi explicit allow-list: sadece Damga'nın gerçekten kullandığı origin'ler.
const ALLOWED_ORIGINS = new Set<string>(
  [
    env.CLIENT_URL.replace(/\/$/, ''),
    'https://damga.deploi.net',
    'https://www.damga.deploi.net',
    'https://api.damga.deploi.net',
    'https://deploi.net',
    'https://www.deploi.net',
  ].filter(Boolean),
);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // server-to-server, curl, mobile app
      const trimmed = origin.replace(/\/$/, '');
      if (
        ALLOWED_ORIGINS.has(trimmed) ||
        trimmed.startsWith('http://localhost:') ||
        trimmed.startsWith('http://127.0.0.1:') ||
        // Capacitor (mobile) — file:// veya capacitor:// scheme'leri
        trimmed.startsWith('capacitor://') ||
        trimmed.startsWith('ionic://')
      ) {
        cb(null, true);
      } else {
        cb(new Error(`CORS engellendi: ${origin}`));
      }
    },
    credentials: true,
  }),
);

// FIX (Y13 — production audit): Resend webhook route'una RAW body ver (HMAC verify için).
// Eğer JSON parser önce çalışırsa, JSON.stringify(req.body) re-encode HMAC'ı bozar.
// Bu middleware tüm json()'dan ÖNCE gelmeli, sadece /v1/webhooks/resend için aktif.
app.use(
  '/v1/webhooks/resend',
  express.raw({ type: 'application/json', limit: '64kb' }),
);

app.use(express.json({ limit: '512kb' }));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/v1/health' } }));

// Rate limit (genel)
app.use('/v1', apiLimiter);

// API rotaları
app.use('/v1', apiRouter);

// Root
app.get('/', (_req, res) => {
  res.json({
    name: 'Damga API',
    version: '0.1.0',
    base: '/v1',
    health: '/v1/health',
    configured: isConfigured,
  });
});

app.use(notFound);

// Sentry Express error handler — errorHandler'dan ÖNCE (hata yakalama için)
if (isConfigured.sentry) {
  Sentry.setupExpressErrorHandler(app);
}
app.use(errorHandler);

const port = env.PORT;
app.listen(port, () => {
  logger.info(
    {
      port,
      env: env.NODE_ENV,
      configured: isConfigured,
    },
    `🚀 Damga API ${isProd ? 'production' : 'dev'} → http://localhost:${port}`,
  );

  // Arka plan görevleri: Redis varsa BullMQ (multi-instance safe),
  // yoksa in-process setInterval (single-instance fallback)
  if (isConfigured.db) {
    if (isRedisAvailable()) {
      // Production scale: BullMQ + Redis
      startWorker(processors);
      void scheduleRepeatingJobs();
      logger.info('⚡ BullMQ scheduler aktif (multi-instance safe)');
    } else {
      // Single-instance fallback
      startScheduler();
      startHealthMonitor();
      startAccountCleanup();
      logger.info('⏰ In-process scheduler aktif (Redis URL set ederek BullMQ\'ya geç)');
    }
  } else {
    logger.warn('Scheduler başlatılmadı (DB yapılandırılmamış)');
  }
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM alındı, kapatılıyor...');
  stopScheduler();
  stopHealthMonitor();
  stopAccountCleanup();
  await stopQueue();
  process.exit(0);
});
