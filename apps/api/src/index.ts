import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env, isProd, isConfigured } from './config/env';
import { logger } from './config/logger';
import { apiRouter } from './routes';
import { errorHandler, notFound } from './middleware/error';
import { apiLimiter } from './middleware/rate-limit';

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
      // İzinli origin'ler: CLIENT_URL + tüm subdomain'leri
      if (!origin) return cb(null, true);
      const allowed = [
        env.CLIENT_URL,
        'http://localhost:5273',
        'http://localhost:5273/',
        'https://damga.deploi.net',
      ];
      if (allowed.some((a) => origin.startsWith(a)) || origin.endsWith('.deploi.net')) {
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
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM alındı, kapatılıyor...');
  process.exit(0);
});
