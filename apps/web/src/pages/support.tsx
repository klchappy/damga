import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, LifeBuoy, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';

const CATEGORIES = [
  { value: 'access', label: 'Erişim / kullanıcı' },
  { value: 'billing', label: 'Plan / ödeme' },
  { value: 'integration', label: 'API / entegrasyon isteği' },
  { value: 'bug', label: 'Hata bildirimi' },
  { value: 'general', label: 'Genel destek' },
];

const PRIORITIES = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yüksek' },
  { value: 'urgent', label: 'Acil' },
  { value: 'low', label: 'Düşük' },
];

export function SupportPage() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('normal');

  const createMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post('/support/tickets', {
          subject,
          message,
          category,
          priority,
        })
      ).data,
    onSuccess: () => {
      setSubject('');
      setMessage('');
      setCategory('general');
      setPriority('normal');
      toast.success('Destek talebin alındı');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const canSubmit = subject.trim().length >= 3 && message.trim().length >= 5;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-orange-500 text-white">
          <LifeBuoy className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl">Destek Talebi</h1>
          <p className="text-sm text-muted">
            Erişim, plan, entegrasyon veya hata taleplerini buradan ilet.
          </p>
        </div>
      </div>

      <div className="card space-y-4">
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

        <div className="rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2 text-xs text-muted">
          API ve entegrasyon talepleri doğrudan uygulanmaz; platform yöneticisi talebi inceleyip
          işleme alır veya kapatır.
        </div>

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
    </div>
  );
}
