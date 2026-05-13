import { Router } from 'express';
import crypto from 'node:crypto';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { getDb, apiKeys, webhooks, externalIntegrations } from '@damga/db';
import { z } from 'zod';
import { requireAuth, requirePlatformAdminUser, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { env, isConfigured } from '../config/env';

export const integrationsRouter = Router();

let externalIntegrationsReady = false;

async function ensureExternalIntegrationsTable(): Promise<void> {
  if (externalIntegrationsReady) return;
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.external_integrations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
      service_type text NOT NULL,
      name text NOT NULL,
      base_url text,
      docs_url text,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      encrypted_secrets jsonb NOT NULL DEFAULT '{}'::jsonb,
      secret_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
      is_active boolean NOT NULL DEFAULT true,
      created_by uuid REFERENCES public.users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_external_integrations_org
    ON public.external_integrations(org_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_external_integrations_type
    ON public.external_integrations(service_type)
  `);
  externalIntegrationsReady = true;
}

const serviceTypeSchema = z.enum([
  'ai',
  'email',
  'storage',
  'accounting',
  'payroll',
  'custom',
]);

const configValueSchema = z.union([z.string().max(2_000), z.number(), z.boolean(), z.null()]);
const blockedConfigKeyPattern = /(api[_-]?key|secret|token|password|credential|private[_-]?key)/i;
const configSchema = z
  .record(z.string().min(1).max(64), configValueSchema)
  .refine((value) => Object.keys(value).length <= 50, 'En fazla 50 config alanı saklanabilir')
  .refine(
    (value) => Object.keys(value).every((key) => !blockedConfigKeyPattern.test(key)),
    'Secret veya token değerleri config içinde değil secrets içinde gönderilmelidir',
  );
const secretFieldNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_.:-]+$/, 'Secret alan adı sadece harf, rakam, _, ., :, - içerebilir');
const secretsSchema = z
  .record(secretFieldNameSchema, z.string().min(1).max(20_000))
  .refine((value) => Object.keys(value).length <= 20, 'En fazla 20 secret alanı saklanabilir');

const externalIntegrationSchema = z.object({
  service_type: serviceTypeSchema,
  name: z.string().min(2).max(100),
  base_url: z.string().url().optional().nullable(),
  docs_url: z.string().url().optional().nullable(),
  config: configSchema.default({}),
  secrets: secretsSchema.default({}),
  is_active: z.boolean().default(true),
});

const updateExternalIntegrationSchema = externalIntegrationSchema.partial().extend({
  secrets: secretsSchema.optional(),
});

integrationsRouter.get(
  '/integrations/status',
  requireAuth,
  requireRole('admin', 'owner'),
  requirePlatformAdminUser,
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');

      const db = getDb();
      const [[keyStats], [webhookStats]] = await Promise.all([
        db
          .select({
            total: count(),
          })
          .from(apiKeys)
          .where(and(eq(apiKeys.org_id, req.authOrgId), eq(apiKeys.is_active, true))),
        db
          .select({
            total: count(),
          })
          .from(webhooks)
          .where(and(eq(webhooks.org_id, req.authOrgId), eq(webhooks.is_active, true))),
      ]);

      res.json({
        endpoints: {
          api_base_url: `${env.SERVER_URL.replace(/\/+$/, '')}/v1`,
          app_url: env.CLIENT_URL,
          docs_url: `${env.CLIENT_URL.replace(/\/+$/, '')}/docs`,
        },
        counts: {
          active_api_keys: keyStats?.total ?? 0,
          active_webhooks: webhookStats?.total ?? 0,
        },
        services: {
          database: isConfigured.db,
          supabase: isConfigured.supabase,
          resend: isConfigured.resend,
          redis: isConfigured.redis,
          web_push: isConfigured.webPush,
        },
        mail: {
          from: env.EMAIL_FROM,
          contact: env.CONTACT_EMAIL,
          support: env.SUPPORT_EMAIL,
          kvkk: env.KVKK_EMAIL,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

integrationsRouter.get(
  '/integrations/external',
  requireAuth,
  requireRole('admin', 'owner'),
  requirePlatformAdminUser,
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      await ensureExternalIntegrationsTable();

      const rows = await getDb()
        .select({
          id: externalIntegrations.id,
          service_type: externalIntegrations.service_type,
          name: externalIntegrations.name,
          base_url: externalIntegrations.base_url,
          docs_url: externalIntegrations.docs_url,
          config: externalIntegrations.config,
          secret_fields: externalIntegrations.secret_fields,
          is_active: externalIntegrations.is_active,
          created_at: externalIntegrations.created_at,
          updated_at: externalIntegrations.updated_at,
        })
        .from(externalIntegrations)
        .where(eq(externalIntegrations.org_id, req.authOrgId))
        .orderBy(desc(externalIntegrations.created_at));

      res.json({
        items: rows.map((row) => ({
          ...row,
          has_secrets: Object.fromEntries((row.secret_fields ?? []).map((field) => [field, true])),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

integrationsRouter.post(
  '/integrations/external',
  requireAuth,
  requireRole('admin', 'owner'),
  requirePlatformAdminUser,
  async (req, res, next) => {
    try {
      if (!req.authOrgId || !req.authUserId) throw new HttpError(401, 'Yetki yok');
      await ensureExternalIntegrationsTable();
      const input = externalIntegrationSchema.parse(req.body);
      const encryptedSecrets = encryptSecrets(input.secrets);
      const secretFields = Object.keys(encryptedSecrets);

      const [created] = await getDb()
        .insert(externalIntegrations)
        .values({
          org_id: req.authOrgId,
          service_type: input.service_type,
          name: input.name,
          base_url: input.base_url ?? null,
          docs_url: input.docs_url ?? null,
          config: input.config,
          encrypted_secrets: encryptedSecrets,
          secret_fields: secretFields,
          is_active: input.is_active,
          created_by: req.authUserId,
        })
        .returning({
          id: externalIntegrations.id,
          service_type: externalIntegrations.service_type,
          name: externalIntegrations.name,
          base_url: externalIntegrations.base_url,
          docs_url: externalIntegrations.docs_url,
          config: externalIntegrations.config,
          secret_fields: externalIntegrations.secret_fields,
          is_active: externalIntegrations.is_active,
          created_at: externalIntegrations.created_at,
          updated_at: externalIntegrations.updated_at,
        });

      res.status(201).json({
        integration: {
          ...created,
          has_secrets: Object.fromEntries(secretFields.map((field) => [field, true])),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

integrationsRouter.patch(
  '/integrations/external/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  requirePlatformAdminUser,
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      await ensureExternalIntegrationsTable();
      const id = String(req.params.id ?? '').trim();
      const input = updateExternalIntegrationSchema.parse(req.body);

      const [current] = await getDb()
        .select({
          id: externalIntegrations.id,
          encrypted_secrets: externalIntegrations.encrypted_secrets,
          secret_fields: externalIntegrations.secret_fields,
        })
        .from(externalIntegrations)
        .where(and(eq(externalIntegrations.id, id), eq(externalIntegrations.org_id, req.authOrgId)));
      if (!current) throw new HttpError(404, 'Entegrasyon bulunamadi');

      const patch: Partial<typeof externalIntegrations.$inferInsert> = {
        updated_at: new Date(),
      };
      if (input.service_type !== undefined) patch.service_type = input.service_type;
      if (input.name !== undefined) patch.name = input.name;
      if (input.base_url !== undefined) patch.base_url = input.base_url ?? null;
      if (input.docs_url !== undefined) patch.docs_url = input.docs_url ?? null;
      if (input.config !== undefined) patch.config = input.config;
      if (input.is_active !== undefined) patch.is_active = input.is_active;
      if (input.secrets !== undefined && Object.keys(input.secrets).length > 0) {
        patch.encrypted_secrets = {
          ...(current.encrypted_secrets as Record<string, string>),
          ...encryptSecrets(input.secrets),
        };
        patch.secret_fields = [
          ...new Set([...(current.secret_fields ?? []), ...Object.keys(input.secrets)]),
        ];
      }

      const [updated] = await getDb()
        .update(externalIntegrations)
        .set(patch)
        .where(and(eq(externalIntegrations.id, id), eq(externalIntegrations.org_id, req.authOrgId)))
        .returning({
          id: externalIntegrations.id,
          service_type: externalIntegrations.service_type,
          name: externalIntegrations.name,
          base_url: externalIntegrations.base_url,
          docs_url: externalIntegrations.docs_url,
          config: externalIntegrations.config,
          secret_fields: externalIntegrations.secret_fields,
          is_active: externalIntegrations.is_active,
          created_at: externalIntegrations.created_at,
          updated_at: externalIntegrations.updated_at,
        });

      res.json({
        integration: {
          ...updated,
          has_secrets: Object.fromEntries((updated?.secret_fields ?? []).map((field) => [field, true])),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

integrationsRouter.delete(
  '/integrations/external/:id',
  requireAuth,
  requireRole('admin', 'owner'),
  requirePlatformAdminUser,
  async (req, res, next) => {
    try {
      if (!req.authOrgId) throw new HttpError(401, 'Yetki yok');
      await ensureExternalIntegrationsTable();
      const id = String(req.params.id ?? '').trim();
      const [deleted] = await getDb()
        .delete(externalIntegrations)
        .where(and(eq(externalIntegrations.id, id), eq(externalIntegrations.org_id, req.authOrgId)))
        .returning({ id: externalIntegrations.id });
      if (!deleted) throw new HttpError(404, 'Entegrasyon bulunamadi');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

function encryptSecrets(secrets: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(secrets)
      .filter(([, value]) => value.trim().length > 0)
      .map(([key, value]) => [key, encryptSecret(value)]),
  );
}

function encryptSecret(value: string) {
  const keyMaterial =
    env.INTEGRATION_ENCRYPTION_KEY ??
    `damga.integration.v1:${env.NFC_SIGNING_SECRET}`;
  const key = crypto.createHash('sha256').update(keyMaterial).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}
