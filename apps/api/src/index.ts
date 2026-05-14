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

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  cors({
    origin: (origin, cb) => {
      // İzinli origin'ler: CLIENT_URL (env) + lokal dev + tüm *.deploi.net subdomain'leri
      if (!origin) return cb(null, true);
      const trimmed = origin.replace(/\/$/, '');
      const clientUrl = env.CLIENT_URL.replace(/\/$/, '');
      if (
        trimmed === clientUrl ||
        trimmed.startsWith('http://localhost:') ||
        /^https:\/\/[a-z0-9-]+\.deploi\.net$/.test(trimmed)
      ) {
        cb(null, true);
      } else {
        cb(new Error(`CORS engellendi: ${origin}`));
      }
    },
    credentials: true,
  }),
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

  // Arka plan görevleri: her Pazartesi 09:00 auto-finalize weekly
  if (isConfigured) {
    startScheduler();
  } else {
    logger.warn('Scheduler başlatılmadı (DB yapılandırılmamış)');
  }
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM alındı, kapatılıyor...');
  stopScheduler();
  process.exit(0);
});
