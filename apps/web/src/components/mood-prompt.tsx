import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, Loader2, Heart } from 'lucide-react';
import { MOOD_EMOJIS } from '@damga/shared';
import { api, getErrorMessage } from '@/lib/api';

interface Mood {
  id: string;
  emoji: string;
  score: number;
  date: string;
}

interface MoodMeta {
  label: string;
  tone: string;
  ringColor: string;
}
const FALLBACK_META: MoodMeta = {
  label: '',
  tone: 'text-muted',
  ringColor: 'ring-orange-300',
};
const MOOD_META: Record<string, MoodMeta> = {
  '😄': { label: 'Harika', tone: 'text-success', ringColor: 'ring-success/40' },
  '🙂': { label: 'İyi', tone: 'text-success/90', ringColor: 'ring-success/30' },
  '😐': { label: 'Normal', tone: 'text-muted', ringColor: 'ring-orange-300' },
  '😕': { label: 'Yorgun', tone: 'text-warning', ringColor: 'ring-warning/40' },
  '😫': { label: 'Kötü', tone: 'text-danger', ringColor: 'ring-danger/40' },
};

interface Props {
  /** undefined → kullanıcı bugün ilk kez mood girmemişse açar */
  forceOpen?: boolean;
  onClose?: () => void;
  /** Modal kapatıldığında bu zaman damgasını localStorage'a yazar (re-prompt cooldown) */
  cooldownKey?: string;
}

const COOLDOWN_MS = 60 * 60 * 1000; // 1 saat boyunca aynı kullanıcıyı tekrar yorma

/**
 * Kullanıcıya bugünkü ruh halini soran modal.
 *
 * Nasıl açılır:
 *  - <MoodPromptAuto /> ile otomatik: bugünkü mood YOKSA + cooldown geçmişse açılır
 *  - <MoodPrompt forceOpen onClose ... /> ile manuel: damga sonrası vb.
 *
 * Submit POST /v1/moods → upsert (idempotent).
 */
export function MoodPrompt({ forceOpen, onClose, cooldownKey = 'mood-prompt' }: Props) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  const submitMut = useMutation({
    mutationFn: async (emoji: string) => {
      const r = await api.post('/moods', { emoji });
      return r.data.mood as Mood;
    },
    onSuccess: () => {
      toast.success('💛 Bugünkü ruh halin kaydedildi · +2 XP');
      void qc.invalidateQueries({ queryKey: ['mood', 'today'] });
      setHidden(true);
      writeCooldown(cooldownKey);
      onClose?.();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleSkip = () => {
    setHidden(true);
    writeCooldown(cooldownKey);
    onClose?.();
  };

  if (!forceOpen || hidden) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 px-3 py-4 sm:p-4">
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 space-y-4 animate-mood-pop"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 text-orange-600 text-xs font-medium uppercase tracking-wider">
              <Heart className="size-3.5" />
              Damga · ruh hali
            </div>
            <h2 className="mt-1 font-display text-xl">Bugün nasıl hissediyorsun?</h2>
            <p className="text-xs text-muted mt-1">
              Tek tık — sadece sen ve yöneticin görür.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            className="btn-ghost p-1.5 -mt-1 -mr-1"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {MOOD_EMOJIS.map((emoji) => {
            const meta = MOOD_META[emoji] ?? FALLBACK_META;
            const isPicked = picked === emoji;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setPicked(emoji);
                  submitMut.mutate(emoji);
                }}
                disabled={submitMut.isPending}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 transition active:scale-95 ${
                  isPicked
                    ? `border-orange-400 bg-orange-50 ring-2 ${meta.ringColor}`
                    : 'border-orange-100 bg-white hover:border-orange-300 hover:bg-orange-50/50'
                } disabled:opacity-60`}
              >
                <span className="text-3xl select-none" aria-hidden>
                  {emoji}
                </span>
                <span className={`text-[10px] font-medium ${meta.tone}`}>{meta.label}</span>
              </button>
            );
          })}
        </div>

        {submitMut.isPending && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted">
            <Loader2 className="size-3 animate-spin" />
            kaydediliyor…
          </div>
        )}

        <div className="text-center">
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitMut.isPending}
            className="text-xs text-muted underline-offset-4 hover:underline hover:text-orange-600"
          >
            Şimdi değil
          </button>
        </div>
      </div>

      <style>{`
        @keyframes mood-pop {
          0% { transform: translateY(20px) scale(0.95); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .animate-mood-pop { animation: mood-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
      `}</style>
    </div>
  );
}

function writeCooldown(key: string) {
  try {
    localStorage.setItem(`damga-${key}-ts`, String(Date.now()));
  } catch {
    /* noop */
  }
}

function readCooldown(key: string): number | null {
  try {
    const v = localStorage.getItem(`damga-${key}-ts`);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

/**
 * MoodPromptAuto: kullanıcı authenticated ise + bugünün mood'u yoksa +
 * son cooldown'dan COOLDOWN_MS (1 saat) geçmişse otomatik gösterir.
 * AppLayout içine yerleştir.
 */
export function MoodPromptAuto() {
  const [open, setOpen] = useState(false);

  const { data, isFetched } = useQuery<{ mood: Mood | null }>({
    queryKey: ['mood', 'today'],
    queryFn: async () => (await api.get('/moods/today')).data,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!isFetched) return;
    if (data?.mood) return; // bugünün mood'u zaten var
    const last = readCooldown('mood-prompt');
    if (last && Date.now() - last < COOLDOWN_MS) return;
    // Sayfayı yormadan 1 saniye sonra aç
    const t = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(t);
  }, [isFetched, data?.mood]);

  if (!open) return null;
  return <MoodPrompt forceOpen onClose={() => setOpen(false)} />;
}
