/**
 * Supabase Storage entegrasyonu — selfie ve diğer üretici belge yüklemeleri için.
 *
 * Bucket: 'damga-selfies' (Supabase dashboard'da public read olarak ayarlanır;
 * bu kod service role key ile yükleme yapar). Bucket yoksa runtime'da oluşturmaya
 * çalışır.
 */
import { createClient } from '@supabase/supabase-js';
import { env, isConfigured } from '../config/env';
import { logger } from '../config/logger';

const SELFIE_BUCKET = 'damga-selfies';

let _supabase: ReturnType<typeof createClient> | null = null;
function getStorageClient() {
  if (!isConfigured.supabase) {
    throw new Error('Supabase yapılandırılmamış (SUPABASE_URL / SERVICE_ROLE_KEY eksik)');
  }
  if (!_supabase) {
    _supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabase;
}

let _bucketEnsured = false;
async function ensureBucket() {
  if (_bucketEnsured) return;
  const supabase = getStorageClient();
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    logger.warn({ err: error.message }, 'Storage bucket listesi alınamadı');
    return;
  }
  const exists = data?.some((b) => b.name === SELFIE_BUCKET);
  if (!exists) {
    const { error: createErr } = await supabase.storage.createBucket(SELFIE_BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });
    if (createErr && !createErr.message.toLowerCase().includes('already exists')) {
      logger.warn({ err: createErr.message }, 'Selfie bucket oluşturulamadı');
      return;
    }
  }
  _bucketEnsured = true;
}

export interface UploadSelfieResult {
  url: string;
  path: string;
}

/**
 * Selfie yükle. Buffer alır, dosyaya yazar, public URL döner.
 *
 * Path format: <orgId>/<userId>/<timestamp>-<rand>.jpg
 */
export async function uploadSelfie(args: {
  orgId: string;
  userId: string;
  buffer: Buffer;
  contentType: string;
}): Promise<UploadSelfieResult> {
  await ensureBucket();
  const supabase = getStorageClient();
  const ext =
    args.contentType === 'image/png'
      ? 'png'
      : args.contentType === 'image/webp'
        ? 'webp'
        : 'jpg';
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now();
  const path = `${args.orgId}/${args.userId}/${ts}-${rand}.${ext}`;

  const { error } = await supabase.storage
    .from(SELFIE_BUCKET)
    .upload(path, args.buffer, {
      contentType: args.contentType,
      upsert: false,
    });
  if (error) {
    throw new Error(`Selfie yüklenemedi: ${error.message}`);
  }

  const { data } = supabase.storage.from(SELFIE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
