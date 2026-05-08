import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Phone,
  User as UserIcon,
  Briefcase,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

interface OrgApplication {
  id: string;
  org_name: string;
  tax_id: string | null;
  industry: string | null;
  employee_count_estimate: string | null;
  applicant_full_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  applicant_title: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_org_id: string | null;
  created_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<OrgApplication['status'], string> = {
  pending: 'bg-warning/10 text-warning border-warning/30',
  approved: 'bg-success/10 text-success border-success/30',
  rejected: 'bg-danger/10 text-danger border-danger/30',
};

const STATUS_TR: Record<OrgApplication['status'], string> = {
  pending: 'Beklemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
};

/**
 * Admin başvuru inceleme sayfası.
 *
 * Pending başvuruları onaylayınca otomatik:
 *  - org + 4 default departman
 *  - owner kullanıcı (Damga DB) + Supabase Auth user
 *  - Şifre belirleme maili (recovery link → /auth/reset-password)
 *
 * Reject → opsiyonel sebep yazılır.
 */
export function AdminApplicationsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>(
    'pending',
  );
  const [rejecting, setRejecting] = useState<OrgApplication | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery<{ items: OrgApplication[] }>({
    queryKey: ['admin', 'applications', statusFilter],
    queryFn: async () => {
      const r = await api.get(`/admin/applications?status=${statusFilter}`);
      return r.data;
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      decision: 'approve' | 'reject';
      rejection_reason?: string;
    }) => {
      const r = await api.post(`/admin/applications/${payload.id}/review`, {
        decision: payload.decision,
        rejection_reason: payload.rejection_reason,
      });
      return r.data;
    },
    onSuccess: (data) => {
      if (data.action === 'approved') {
        toast.success(
          `✅ Başvuru onaylandı — owner hesabı oluşturuldu, mail gönderildi (${data.magic_link_sent_to})`,
        );
      } else {
        toast.success('Başvuru reddedildi');
      }
      void qc.invalidateQueries({ queryKey: ['admin', 'applications'] });
      setRejecting(null);
      setRejectReason('');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Şirket Başvuruları</h1>
          <p className="text-sm text-muted">
            Damga'ya başvuran şirketleri incele, onayla veya reddet.
          </p>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                statusFilter === s
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-muted border-orange-100 hover:bg-orange-50'
              }`}
            >
              {s === 'all' ? 'Tümü' : STATUS_TR[s]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center py-12 text-muted">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Building2 className="size-10 text-muted/40" />
          <p className="mt-3 text-sm text-muted">
            {statusFilter === 'pending'
              ? 'Şu an inceleme bekleyen başvuru yok.'
              : 'Bu durumda kayıt yok.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((app) => (
            <div key={app.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg leading-tight">{app.org_name}</h3>
                  <p className="text-xs text-muted">
                    {app.industry ? `${app.industry} · ` : ''}
                    {app.employee_count_estimate
                      ? `${app.employee_count_estimate} çalışan`
                      : '—'}
                  </p>
                </div>
                <span
                  className={`text-[11px] font-medium px-2 py-1 rounded-full border whitespace-nowrap ${STATUS_BADGE[app.status]}`}
                >
                  {STATUS_TR[app.status]}
                </span>
              </div>

              <dl className="space-y-1.5 text-sm">
                <div className="flex items-start gap-2 text-muted">
                  <UserIcon className="size-4 mt-0.5 shrink-0 text-orange-500" />
                  <span className="text-ink">{app.applicant_full_name}</span>
                  {app.applicant_title && (
                    <span className="text-xs">· {app.applicant_title}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted">
                  <Mail className="size-4 shrink-0 text-orange-500" />
                  <a
                    href={`mailto:${app.applicant_email}`}
                    className="text-ink hover:text-orange-600 truncate"
                  >
                    {app.applicant_email}
                  </a>
                </div>
                {app.applicant_phone && (
                  <div className="flex items-center gap-2 text-muted">
                    <Phone className="size-4 shrink-0 text-orange-500" />
                    <span className="text-ink">{app.applicant_phone}</span>
                  </div>
                )}
                {app.tax_id && (
                  <div className="flex items-center gap-2 text-muted">
                    <Briefcase className="size-4 shrink-0 text-orange-500" />
                    <span className="font-mono text-xs">VKN: {app.tax_id}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted">
                  <Clock className="size-4 shrink-0 text-orange-500" />
                  <span className="text-xs">
                    {new Date(app.created_at).toLocaleString('tr-TR')}
                  </span>
                </div>
              </dl>

              {app.notes && (
                <div className="rounded-md bg-orange-50/60 px-3 py-2 text-xs text-muted">
                  💬 {app.notes}
                </div>
              )}

              {app.status === 'rejected' && app.rejection_reason && (
                <div className="rounded-md bg-danger/5 border border-danger/20 px-3 py-2 text-xs text-danger flex items-start gap-1.5">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                  <span>{app.rejection_reason}</span>
                </div>
              )}

              {app.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() =>
                      reviewMutation.mutate({ id: app.id, decision: 'approve' })
                    }
                    disabled={reviewMutation.isPending}
                    className="btn-primary flex-1 text-sm"
                  >
                    {reviewMutation.isPending && reviewMutation.variables?.id === app.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Onayla
                  </button>
                  <button
                    onClick={() => {
                      setRejecting(app);
                      setRejectReason('');
                    }}
                    disabled={reviewMutation.isPending}
                    className="btn-outline flex-1 text-sm border-danger/40 text-danger hover:bg-danger/5"
                  >
                    <XCircle className="size-4" />
                    Reddet
                  </button>
                </div>
              )}

              {app.status === 'approved' && app.created_org_id && (
                <div className="text-xs text-success font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5" />
                  Org oluşturuldu · Owner mail aldı
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reddet modal */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md card space-y-4">
            <h2 className="font-display text-xl">Başvuruyu reddet</h2>
            <p className="text-sm text-muted">
              <strong className="text-ink">{rejecting.org_name}</strong> başvurusu reddedilecek.
              Başvurana gösterilecek (opsiyonel) bir sebep yazabilirsin.
            </p>
            <textarea
              rows={3}
              className="input resize-none"
              placeholder="Örn: Kurumsal bilgilerin doğrulanamadı."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              maxLength={300}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRejecting(null)}
                disabled={reviewMutation.isPending}
                className="btn-outline flex-1"
              >
                İptal
              </button>
              <button
                onClick={() =>
                  reviewMutation.mutate({
                    id: rejecting.id,
                    decision: 'reject',
                    rejection_reason: rejectReason.trim() || undefined,
                  })
                }
                disabled={reviewMutation.isPending}
                className="btn-primary flex-1 bg-danger hover:bg-danger/90 border-danger"
              >
                {reviewMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Reddet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
