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
import { leaderboardRouter } from './leaderboard';
import { rewardsRouter } from './rewards';

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
apiRouter.use(leaderboardRouter);
apiRouter.use(rewardsRouter);

apiRouter.get('/', (_req, res) => {
  res.json({
    name: 'Damga API',
    version: '0.1.0',
    docs: 'https://damga.deploi.net/docs',
    routes: {
      auth: [
        'POST /auth/sign-up, /auth/magic-link, /auth/apply-org',
        'POST /auth/resolve-identifier (public)',
        'POST /auth/forgot { identifier, method:email|sms|whatsapp }',
        'GET  /auth/me',
      ],
      admin: [
        'GET  /admin/applications, /admin/pending-users, /admin/pending-reviews',
        'POST /admin/applications/:id/review',
        'POST /admin/pending-users/:id/assign',
        'POST /admin/events/:id/review { decision:approve|reject, notes }',
      ],
      org: ['GET /orgs/me, PATCH /orgs/me/settings'],
      stamp: [
        'POST /check-in, /check-out, /stamp (auto)',
        'POST /stamp/selfie-upload { contentType, base64 }',
        'GET  /events, /events/:id, /events/verify-chain',
        'POST /events/:id/dispute',
      ],
      users: [
        'GET  /users',
        'POST /users (admin: Supabase auth + DB + recovery link)',
        'PATCH /users/me (kendi profil)',
        'PATCH /users/:id (admin tam yetki)',
        'POST /users/:id/set-password { password?, send_via:show|sms|whatsapp }',
        'POST /users/:id/password-reset (generateLink)',
      ],
      locations: [
        'GET  /locations, /locations/:id/nfc-tags, /locations/:id/qr-codes',
        'POST /locations, /locations/:id/nfc-tags, /locations/:id/qr-codes (v2 URL)',
        'DELETE /locations/:id/nfc-tags/:tagId, /locations/:id/qr-codes/:qrId',
      ],
      content: [
        'GET  /menus, /menus/today, /menus/:id/feedback',
        'POST /menus, /menus/:id/rsvp, /menus/:id/rate',
        'PATCH /menus/:id, DELETE /menus/:id',
        'GET  /announcements, /announcements/:id/comments',
        'POST /announcements, /announcements/:id/read, /announcements/:id/comments',
        'PATCH /announcements/:id, DELETE /announcements/:id',
        'DELETE /announcements/:id/comments/:commentId',
      ],
      misc: [
        'GET /leaves, POST /leaves, PATCH /leaves/:id/approve|reject',
        'GET /moods/today, /moods/team, POST /moods',
        'POST /statuses, DELETE /statuses/current, GET /statuses/team',
        'GET /api-keys, POST /api-keys, DELETE /api-keys/:id',
        'GET /webhooks, POST /webhooks, /webhooks/:id/deliveries|test',
        'GET /reports/attendance, /reports/payroll, /export/events',
        'GET /departments, POST /departments, PATCH /departments/:id',
      ],
    },
  });
});
