import { Router } from 'express';
import { healthRouter } from './health';
import { authRouter } from './auth';
import { checkInRouter } from './check-in';
import { eventsRouter } from './events';
import { leavesRouter } from './leaves';
import { locationsRouter } from './locations';
import { usersRouter } from './users';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use(checkInRouter);
apiRouter.use(eventsRouter);
apiRouter.use(leavesRouter);
apiRouter.use(locationsRouter);
apiRouter.use(usersRouter);

apiRouter.get('/', (_req, res) => {
  res.json({
    name: 'Damga API',
    version: '0.1.0',
    docs: 'https://damga.deploi.net/docs',
    routes: [
      'GET  /health',
      'POST /auth/magic-link',
      'POST /auth/sign-up',
      'GET  /auth/me',
      'POST /check-in',
      'POST /check-out',
      'GET  /events',
      'GET  /events/:id',
      'POST /events/:id/dispute',
      'GET  /events/verify-chain',
      'GET  /leaves',
      'POST /leaves',
      'PATCH /leaves/:id/approve',
      'PATCH /leaves/:id/reject',
      'GET  /locations',
      'POST /locations',
      'PATCH /locations/:id',
      'POST /locations/:id/nfc-tags',
      'POST /locations/:id/qr-codes',
      'GET  /users',
      'POST /users',
      'PATCH /users/:id',
    ],
  });
});
