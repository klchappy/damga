/**
 * Hetzner Cloud snapshot otomasyonu.
 *
 * Haftalık olarak (Pazar 03:00 TR) production server'ın snapshot'ını alır.
 * 4 haftadan eski auto-snapshot'ları siler (rotation).
 *
 * Gerekli env:
 *   HCLOUD_TOKEN       — Hetzner Cloud API token (Read+Write)
 *   HCLOUD_SERVER_ID   — Snapshot alınacak server ID (number)
 *
 * Token Hetzner panel → Security → API Tokens (Read+Write scope).
 */
import { logger } from '../config/logger';

const HCLOUD_API = 'https://api.hetzner.cloud/v1';
const SNAPSHOT_LABEL = 'damga-auto';
const RETENTION_DAYS = 28; // 4 hafta

interface HCloudImage {
  id: number;
  type: string;
  status: string;
  description: string;
  created: string; // ISO timestamp
  labels: Record<string, string>;
}

interface HCloudActionResponse {
  action?: { id: number; status: string };
  image?: HCloudImage;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Snapshot al — async (Hetzner API hemen döner, image background'da oluşur).
 */
async function createSnapshot(token: string, serverId: number): Promise<HCloudImage | null> {
  const now = new Date().toISOString().slice(0, 10);
  const url = `${HCLOUD_API}/servers/${serverId}/actions/create_image`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      type: 'snapshot',
      description: `damga-auto-${now}`,
      labels: { [SNAPSHOT_LABEL]: 'true', source: 'cron' },
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Hetzner snapshot create failed: ${res.status} ${errBody}`);
  }
  const json = (await res.json()) as HCloudActionResponse;
  return json.image ?? null;
}

/**
 * Otomatik etiketli snapshot'ları listele.
 */
async function listAutoSnapshots(token: string): Promise<HCloudImage[]> {
  const url = `${HCLOUD_API}/images?type=snapshot&label_selector=${SNAPSHOT_LABEL}=true&per_page=50`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Hetzner list snapshots failed: ${res.status}`);
  const json = (await res.json()) as { images?: HCloudImage[] };
  return json.images ?? [];
}

async function deleteSnapshot(token: string, imageId: number): Promise<void> {
  const url = `${HCLOUD_API}/images/${imageId}`;
  const res = await fetch(url, { method: 'DELETE', headers: authHeaders(token) });
  if (!res.ok && res.status !== 404) {
    const errBody = await res.text();
    throw new Error(`Hetzner delete snapshot failed: ${res.status} ${errBody}`);
  }
}

export interface RunSnapshotResult {
  created: { id: number; description: string } | null;
  deletedCount: number;
  errors: string[];
  skipped?: 'no-token' | 'no-server-id';
}

/**
 * Cron job entry point — env yoksa skip, varsa snapshot al + rotation.
 */
export async function runWeeklySnapshot(): Promise<RunSnapshotResult> {
  const token = process.env.HCLOUD_TOKEN;
  const serverIdRaw = process.env.HCLOUD_SERVER_ID;

  if (!token) {
    logger.warn('HCLOUD_TOKEN yok, snapshot atlandı');
    return { created: null, deletedCount: 0, errors: [], skipped: 'no-token' };
  }
  if (!serverIdRaw) {
    logger.warn('HCLOUD_SERVER_ID yok, snapshot atlandı');
    return { created: null, deletedCount: 0, errors: [], skipped: 'no-server-id' };
  }
  const serverId = Number(serverIdRaw);
  if (!Number.isFinite(serverId) || serverId <= 0) {
    return {
      created: null,
      deletedCount: 0,
      errors: [`HCLOUD_SERVER_ID geçersiz: ${serverIdRaw}`],
    };
  }

  const errors: string[] = [];
  let created: { id: number; description: string } | null = null;

  // 1) Yeni snapshot tetikle
  try {
    const image = await createSnapshot(token, serverId);
    if (image) {
      created = { id: image.id, description: image.description };
      logger.info(
        { imageId: image.id, description: image.description },
        '📸 Hetzner snapshot tetiklendi',
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`create: ${msg}`);
    logger.error({ err: msg }, 'Snapshot oluşturulamadı');
  }

  // 2) Eski snapshot'ları temizle
  let deletedCount = 0;
  try {
    const snapshots = await listAutoSnapshots(token);
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const expired = snapshots.filter((img) => new Date(img.created).getTime() < cutoff);
    for (const img of expired) {
      try {
        await deleteSnapshot(token, img.id);
        deletedCount += 1;
        logger.info({ imageId: img.id, description: img.description }, '🗑️ Eski snapshot silindi');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`delete ${img.id}: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`list: ${msg}`);
    logger.error({ err: msg }, 'Snapshot rotation hatası');
  }

  logger.info(
    { created_id: created?.id, deleted: deletedCount, errors: errors.length },
    '✓ Hetzner snapshot job tamam',
  );
  return { created, deletedCount, errors };
}
