/**
 * Self-serve hesap silme paneli — KVKK md.11.
 *
 * 3 durum:
 *   1. Aktif (deletion_requested=false): "Hesabımı sil" butonu (modal açar)
 *   2. Grace period (deletion_requested=true, deleted=false):
 *      "X gün kaldı — silmekten vazgeç" butonu
 *   3. Anonymize edilmiş (deleted=true): "Hesabın silinmiş — geri alınamaz" (rare,
 *      bu pencerede user normalde göremez çünkü is_active=false ve auth de silinmiş)
 *
 * Akış:
 *   "Sil" → modal: "evet" yazımı + nedeni (opsiyonel) + onaylama
 *   POST /v1/me/account/delete-request {reason?, confirm_delete_org_if_owner?}
 *   → backend is_active=false yapar, supabase auth silinmemiş
 *   → frontend: logout + landing'e yönlendir
 *
 *   Cancel: kullanıcı sign-in deneyince landing → "hesabın silme süresi 20 gün
 *   kaldı, vazgeçmek için tıkla" — buradaki butona basınca POST cancel-deletion
 *   → is_active=true → sayfa yenilen → normal kullanım
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, ShieldOff, Trash2, X } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';
import { getSupabase } from '@/lib/supabase';

interface DeletionStatus {
  requested: boolean;
  requested_at: string | null;
  scheduled_at: string | null;
  reason: string | null;
  anonymized_at: string | null;
  is_active: boolean;
}

export function AccountDeletionPanel() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [confirmOrgDelete, setConfirmOrgDelete] = useState(false);

  const { data: status } = useQuery<DeletionStatus>({
    queryKey: ['me', 'deletion-status'],
    queryFn: async () => (await api.get('/me/account/deletion-status')).data,
    staleTime: 30_000,
  });

  const isOwner = user?.role === 'owner';

  const requestDeletion = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/me/account/delete-request', {
        reason: reason.trim() || undefined,
        confirm_delete_org_if_owner: confirmOrgDelete,
      });
      return data;
    },
    onSuccess: async () => {
      toast.success(
        'Hesabın silme süreci başladı. Logout ediliyorsun — 30 gün içinde geri alabilirsin.',
        { duration: 8000 },
      );
      setShowModal(false);
      // Supabase logout
      try {
        await getSupabase().auth.signOut();
      } catch {
        /* ignore */
      }
      // 1.5 sn sonra landing'e git
      setTimeout(() => {
        useAuthStore.getState().setUser(null);
        useAuthStore.getState().setOrg(null);
        useAuthStore.getState().setSession(null);
        navigate('/');
      }, 1500);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const cancelDeletion = useMutation({
    mutationFn: async () => {
      await api.post('/me/account/cancel-deletion');
    },
    onSuccess: () => {
      toast.success('Silme talebin geri alındı — hesabın aktif.');
      qc.invalidateQueries({ queryKey: ['me', 'deletion-status'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Grace period (zaten silme talep edilmiş)
  if (status?.requested && !status.anonymized_at) {
    const scheduledDate = status.scheduled_at ? new Date(status.scheduled_at) : null;
    const daysLeft = scheduledDate
      ? Math.max(0, Math.ceil((scheduledDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : 0;
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg bg-warning/20 text-warning flex items-center justify-center shrink-0">
            <AlertTriangle className="size-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-ink">Silme süreci devam ediyor</h3>
            <p className="mt-1 text-sm text-muted">
              <strong>{daysLeft} gün</strong> kaldı. Bu süre dolduğunda kişisel bilgilerin
              (ad, e-posta, telefon) tamamen anonymize edilecek. Vazgeçtiysen şimdi geri alabilirsin.
            </p>
            {status.reason && (
              <p className="mt-2 text-xs text-muted">
                Belirtilen neden: <span className="italic">{status.reason}</span>
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => cancelDeletion.mutate()}
          disabled={cancelDeletion.isPending}
          className="btn-outline w-full sm:w-auto"
        >
          {cancelDeletion.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Silmekten vazgeç
        </button>
      </div>
    );
  }

  // Normal durum: silme butonu
  return (
    <>
      <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 space-y-2">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg bg-danger/15 text-danger flex items-center justify-center shrink-0">
            <ShieldOff className="size-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-ink">Tehlikeli bölge — Hesabımı sil</h3>
            <p className="mt-1 text-sm text-muted">
              KVKK md.11 gereği hesabını silme hakkına sahipsin. Süreç:
            </p>
            <ul className="mt-2 text-sm text-muted list-disc pl-5 space-y-0.5">
              <li>Talep anında hesabın <strong>devre dışı</strong> olur (giriş yapamazsın)</li>
              <li><strong>30 gün</strong> içinde geri alabilirsin (silme onayını iptal edebilirsin)</li>
              <li>30 gün sonra adın, e-postan, telefonun <strong>anonymize</strong> edilir</li>
              <li>90 gün sonra hesabın tamamen <strong>silinir</strong> (CASCADE: tüm damga ve izin geçmişin)</li>
            </ul>
          </div>
        </div>
        {isOwner && (
          <div className="rounded-md bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-ink">
            <strong>⚠️ Owner uyarısı:</strong> Sen şirketin tek sahibisin. Hesabını silmeden
            önce ya başka birine owner rolü ver ya da silme modalında "şirketi de sil" onayını kabul et.
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="btn-danger w-full sm:w-auto"
        >
          <Trash2 className="size-4" />
          Hesabımı sil
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-ink">Hesabını silmek istediğinden emin misin?</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-muted hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="rounded-md bg-danger/5 border border-danger/20 p-3 text-sm text-ink">
              <p className="font-semibold">Bu işlem 30 gün geri alınabilir.</p>
              <p className="mt-1 text-xs text-muted">
                30 gün içinde tekrar giriş yaparsan vazgeçme seçeneği görünür. Süre dolunca
                anonymize başlar — sonrasında <strong>geri alınamaz</strong>.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Silme nedeni <span className="text-muted">(opsiyonel — bize geri bildirim için)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Damga'yı neden bırakıyorsun? (yapılan iyileştirmeler için faydalı)"
                maxLength={500}
                rows={2}
                className="w-full rounded-md border border-orange-200 px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
              <p className="text-[10px] text-muted mt-0.5">{reason.length}/500</p>
            </div>

            {isOwner && (
              <label className="flex items-start gap-2 cursor-pointer text-sm text-ink">
                <input
                  type="checkbox"
                  checked={confirmOrgDelete}
                  onChange={(e) => setConfirmOrgDelete(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <strong>Şirketi de sil onayı:</strong> Tek owner olduğum için tüm
                  şirket verileri (tüm çalışanlar, damga, izin geçmişi) silinecek. Anlıyorum.
                </span>
              </label>
            )}

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Onay için <strong className="text-danger">"hesabımı sil"</strong> yaz
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full rounded-md border border-orange-200 px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                autoFocus
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn-outline flex-1"
                disabled={requestDeletion.isPending}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => requestDeletion.mutate()}
                disabled={
                  requestDeletion.isPending ||
                  confirmText.toLowerCase().trim() !== 'hesabımı sil' ||
                  (isOwner && !confirmOrgDelete)
                }
                className="btn-danger flex-1"
              >
                {requestDeletion.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
