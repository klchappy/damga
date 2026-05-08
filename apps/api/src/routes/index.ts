import { Router } from 'express';
import { healthRouter } from './health';
import { authRouter } from './auth';
import { applicationsRouter } from './applications';
import { orgsRouter } from './orgs';
import { checkInRouter } from './check-in';
import { eventsRouter } from './events';
import { leavesRouter } from './leaves';
import { locationsRouter } from './locations';
import { usersRouter } from './users';
import { departmentsRouter } from './departments';
import { moodsRouter } from './moods';
import { statusesRouter } from './statuses';
import { menusRouter } from './menus';
import { announcementsRouter } from './announcements';
import { apiKeysRouter } from './api-keys';
import { webhooksRouter } from './webhooks';
import { reportsRouter } from './reports';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use(applicationsRouter);
apiRouter.use(orgsRouter);
apiRouter.use(checkInRouter);
apiRouter.use(eventsRouter);
apiRouter.use(leavesRouter);
apiRouter.use(locationsRouter);
apiRouter.use(usersRouter);
apiRouter.use(departmentsRouter);
apiRouter.use(moodsRouter);
apiRouter.use(statusesRouter);
apiRouter.use(menusRouter);
apiRouter.use(announcementsRouter);
apiRouter.use(apiKeysRouter);
apiRouter.use(webhooksRouter);
apiRouter.use(reportsRouter);

apiRouter.get('/', (_req, res) => {
  res.json({
    name: 'Damga API',
    version: '0.1.0',
    docs: 'https://damga.deploi.net/docs',
    routes: [
      'GET  /health',
      'POST /auth/magic-link, /sign-up, /auth/apply-org',
      'GET  /auth/me',
      'GET  /admin/applications, /admin/pending-users',
      'POST /admin/applications/:id/review, /admin/pending-users/:id/assign',
      'GET  /orgs/me, PATCH /orgs/me/settings',
      'POST /check-in, /check-out',
      'GET  /events, /events/:id, /events/verify-chain',
      'POST /events/:id/dispute',
      'GET  /leaves',
      'POST /leaves',
      'PATCH /leaves/:id/approve, /leaves/:id/reject',
      'GET  /locations',
      'POST /locations, /locations/:id/nfc-tags, /locations/:id/qr-codes',
      'GET  /users',
      'POST /users, PATCH /users/:id',
      'GET  /moods/today, /moods/team',
      'POST /moods',
      'POST /statuses, DELETE /statuses/current',
      'GET  /statuses/team',
      'GET  /menus',
      'POST /menus, /menus/:id/rsvp, /menus/:id/rate',
      'GET  /announcements',
      'POST /announcements, /announcements/:id/read',
      'GET  /api-keys, POST /api-keys, DELETE /api-keys/:id',
      'GET  /webhooks, POST /webhooks',
      'GET  /webhooks/:id/deliveries, POST /webhooks/:id/test',
      'GET  /reports/attendance?month=YYYY-MM&format=csv|json',
      'GET  /reports/payroll?month=YYYY-MM',
      'GET  /export/events?format=csv|json',
    ],
  });
});
