import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  LifeBuoy,
  Send,
  MessageSquare,
  CheckCircle2,
  Clock,
  AlertCircle,
  Inbox,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { formatDateTimeTr } from '@/lib/utils';

const CATEGORIES = [
  { value: 'access', label: 'Erişim / kullanıcı' },
  { value: 'billing', label: 'Plan / ödeme' },
  { value: 'integration', label: 'API / entegrasyon' },
  { value: 'bug', label: 'Hata bildirimi' },
  { value: 'general', label: 'Genel destek' },
];

const PRIORITIES = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yüksek' },
  { value: 'urgent', label: 'Acil' },
  { value: 'low', label: 'Düşük' },
];

const STATUS_META: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  open: { label: 'Açık', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: Inbox },
  in_progress: {
    label: 'İncelemede',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Clock,
  },
  waiting: {
    label: 'Yanıt Bekliyor',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: AlertCircle,
  },
  resolved: {
    label: 'Çözüldü',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  closed: {
    label: 'Kapatıldı',
    color: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    icon: CheckCircle2,
  },
};

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  category: string;
  priority: string;
  status: keyof typeof STATUS_META;
  platform_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export function SupportPage() {
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('normal');
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery<{
    items: SupportTicket[];
  }>({
    queryKey: ['me-support-tickets'],
    queryFn: async () => (await api.get('/me/support-tickets')).data,
    refetchInterval: 60_000, // 1 dakikada bir poll (yanıt geldi mi diye)
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post('/support/tickets', {
          subject: subject.trim(),
          message: message.trim(),
          category,
          priority,
        })
      ).data,
    onSuccess: () => {
      setSubject('');
      setMessage('');
      setCategory('general');
      setPriority('normal');
      toast.success(
        '✅ Destek talebin alındı — yöneticilerimize bildirim gönderildi. Yanıt gelince bu sayfada görürsün.',
      );
      void qc.invalidateQueries({ queryKey: ['me-support-tickets'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const canSubmit = subject.trim().length >= 3 && message.trim().length >= 5;
  const tickets = ticketsData?.items ?? [];
  const activeTickets = tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved');
  const archivedTickets = tickets.filter((t) => t.status === 'closed' || t.status === 'resolved');

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-orange-500 text-white">
          <LifeBuoy className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl">Destek Talepleri</h1>
          <p className="text-sm text-muted">
            Sorununu, isteğini veya hata bildirimini buradan ilet. Yanıtlar e-posta + bu sayfada gelir.
          </p>
        </div>
      </div>

      {/* Yeni talep formu */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
          <Send className="size-4 text-orange-500" />
          <h2 className="font-display text-lg">Yeni Talep Aç</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Kategori
            <select
              className="input mt-1 w-full"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Öncelik
            <select
              className="input mt-1 w-full"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              {PRIORITIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium">
          Konu
          <input
            className="input mt-1 w-full"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Örn. Yeni API entegrasyonu talebi"
            maxLength={160}
          />
        </label>

        <label className="block text-sm font-medium">
          Açıklama
          <textarea
            className="input mt-1 min-h-32 w-full resize-y"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Talebini, etkilenen kullanıcıları ve beklediğin sonucu yaz."
            maxLength={4000}
          />
        </label>

        <div className="flex justify-end">
          <button
            type="button"
            className="btn-primary"
            disabled={!canSubmit || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Talebi Gönder
          </button>
        </div>
      </div>

      {/* Aktif talepler */}
      {activeTickets.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
            <Inbox className="size-4 text-orange-500" />
            <h2 className="font-display text-lg">Aktif Taleplerim</h2>
            <span className="ml-auto chip bg-orange-100 text-orange-700 text-xs">
              {activeTickets.length}
            </span>
          </div>
          <div className="space-y-2">
            {activeTickets.map((t) => (
              <TicketCard
                key={t.id}
                ticket={t}
                expanded={expandedTicket === t.id}
                onToggle={() => setExpandedTicket(expandedTicket === t.id ? null : t.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Arşiv */}
      {archivedTickets.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <h2 className="font-display text-lg text-zinc-600">Çözülmüş Talepler</h2>
            <span className="ml-auto chip bg-zinc-100 text-zinc-600 text-xs">
              {archivedTickets.length}
            </span>
          </div>
          <div className="space-y-2">
            {archivedTickets.map((t) => (
              <TicketCard
                key={t.id}
                ticket={t}
                expanded={expandedTicket === t.id}
                onToggle={() => setExpandedTicket(expandedTicket === t.id ? null : t.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Boş durum */}
      {!ticketsLoading && tickets.length === 0 && (
        <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/40 p-6 text-center text-sm text-muted">
          <MessageSquare className="mx-auto size-8 text-orange-300 mb-2" />
          Henüz destek talebin yok. Sorun yaşadığında yukarıdaki formdan bize ulaş.
        </div>
      )}
    </div>
  );
}

function TicketCard({
  ticket,
  expanded,
  onToggle,
}: {
  ticket: SupportTicket;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = STATUS_META[ticket.status] ?? STATUS_META.open!;
  const Icon = meta.icon;
  const hasReply = !!ticket.platform_notes && ticket.platform_notes.trim().length > 0;

  return (
    <div
      className={`rounded-lg border transition ${
        hasReply && !expanded
          ? 'border-orange-300 bg-orange-50/30'
          : 'border-zinc-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-3 text-left hover:bg-zinc-50/50 transition flex items-start gap-3"
      >
        <Icon className="size-4 text-orange-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{ticket.subject}</span>
            <span
              className={`chip border text-[10px] px-2 py-0.5 rounded-full ${meta.color}`}
            >
              {meta.label}
            </span>
            {hasReply && (
              <span className="chip bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                📨 Yanıt var
              </span>
            )}
          </div>
          <div className="text-xs text-muted mt-1">
            {formatDateTimeTr(ticket.created_at)} ·{' '}
            {CATEGORIES.find((c) => c.value === ticket.category)?.label ?? ticket.category}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="size-4 text-zinc-400 shrink-0" />
        ) : (
          <ChevronDown className="size-4 text-zinc-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-zinc-100">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
              Talebim
            </div>
            <div className="rounded bg-zinc-50 p-2.5 text-sm whitespace-pre-wrap">
              {ticket.message}
            </div>
          </div>
          {hasReply && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-orange-600 mb-1 flex items-center gap-1">
                <MessageSquare className="size-3" />
                Yönetici Yanıtı
                <span className="text-zinc-400 ml-2">
                  · son güncelleme: {formatDateTimeTr(ticket.updated_at)}
                </span>
              </div>
              <div className="rounded bg-orange-50 border border-orange-100 p-2.5 text-sm whitespace-pre-wrap">
                {ticket.platform_notes}
              </div>
            </div>
          )}
          {!hasReply && (
            <div className="text-xs text-muted italic text-center py-2">
              Henüz yanıt yok. Yöneticimiz inceleyince e-posta + bu sayfada görünür.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
