/**
 * Supabase Storage entegrasyonu — selfie ve diğer üretici belge yüklemeleri için.
 *
 * Bucket: 'damga-selfies' (Supabase dashboard'da public read olarak ayarlanır;
 * bu kod service role key ile yükleme yapar). Bucket yoksa runtime'da oluşturmaya
 * çalışır.
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { env, isConfigured } from '../config/env';
import { logger } from '../config/logger';

const SELFIE_BUCKET = 'damga-selfies';

/**
 * Selfie optimizasyon ayarları.
 * Damga için 1024px genişlik + WebP yeterli — yüz tanıma + anomali kanıtı için.
 */
const SELFIE_MAX_WIDTH = 1024;
const SELFIE_WEBP_QUALITY = 82;

/**
 * Selfie'yi WebP'ye optimize et (resize + recompress).
 *
 * Önce: 5 MB ham JPEG (telefon kamerası)
 * Sonra: ~100-200 KB WebP (1024px, kalite 82)
 *
 * Avantajlar:
 * - 25-50x bandwidth tasarrufu (özellikle storage maliyetini düşürür)
 * - WebP modern tarayıcıların hepsinde destekli (97% global support)
 * - Yüz tanıma + anomali kanıtı için 1024px yeterli
 *
 * Sharp'ın .rotate() metadata'daki EXIF orientation'a göre çevirir
 * (iPhone fotoğrafları aksi halde yan dönük gelir).
 */
async function optimizeSelfie(input: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
  try {
    const optimized = await sharp(input)
      .rotate() // EXIF orientation
      .resize({ width: SELFIE_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: SELFIE_WEBP_QUALITY })
      .toBuffer();
    logger.info(
      { originalBytes: input.length, optimizedBytes: optimized.length, ratio: (input.length / optimized.length).toFixed(1) },
      '🖼️  Selfie optimize edildi',
    );
    return { buffer: optimized, contentType: 'image/webp' };
  } catch (e) {
    // Sharp başarısız olursa (corrupt input vs.) orijinal'i kullan
    logger.warn({ err: e }, 'Selfie optimize başarısız, ham yükleniyor');
    return { buffer: input, contentType: 'image/jpeg' };
  }
}

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
  /** Optimize'ı atla (test/debug için). Production'da varsayılan optimize ON. */
  skipOptimize?: boolean;
}): Promise<UploadSelfieResult> {
  await ensureBucket();
  const supabase = getStorageClient();

  // Optimize: 5MB JPEG → ~150KB WebP (25-50x küçülme)
  let finalBuffer = args.buffer;
  let finalContentType = args.contentType;
  if (!args.skipOptimize) {
    const optimized = await optimizeSelfie(args.buffer);
    finalBuffer = optimized.buffer;
    finalContentType = optimized.contentType;
  }

  const ext =
    finalContentType === 'image/webp'
      ? 'webp'
      : finalContentType === 'image/png'
        ? 'png'
        : 'jpg';
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now();
  const path = `${args.orgId}/${args.userId}/${ts}-${rand}.${ext}`;

  const { error } = await supabase.storage
    .from(SELFIE_BUCKET)
    .upload(path, finalBuffer, {
      contentType: finalContentType,
      upsert: false,
    });
  if (error) {
    throw new Error(`Selfie yüklenemedi: ${error.message}`);
  }

  const { data } = supabase.storage.from(SELFIE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
