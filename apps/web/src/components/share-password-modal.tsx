import { useState } from 'react';
import { toast } from 'sonner';
import {
  Copy,
  Mail,
  MessageCircle,
  X,
  CheckCircle2,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';

interface Props {
  password: string;
  recipientName: string;
  recipientEmail: string;
  /** true → şifre admin tarafından otomatik üretildi */
  generated: boolean;
  onClose: () => void;
}

/**
 * Admin'in atadığı yeni şifreyi gösterip paylaşımını sağlayan modal.
 *
 * Şifre clear-text gösterilir (göz simgesi ile gizleme/gösterme), kopyala /
 * WhatsApp / mail butonları ile admin manuel iletim yapar.
 */
export function SharePasswordModal({
  password,
  recipientName,
  recipientEmail,
  generated,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [reveal, setReveal] = useState(true);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success('Şifre kopyalandı');
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Kopyalanamadı');
    }
  };

  const waMessage = encodeURIComponent(
    `Merhaba ${recipientName},\n\nDamga şifren güncellendi:\n\nE-posta: ${recipientEmail}\nŞifre: ${password}\n\nGiriş: https://damga.deploi.net/auth/sign-in\n\nİlk girişten sonra Profil → Şifre değiştir kısmından kendi şifrene değiştirmen önerilir.`,
  );
  const mailSubject = encodeURIComponent('Damga şifren güncellendi');
  const mailBody = encodeURIComponent(
    `Merhaba ${recipientName},\n\nDamga şifren güncellendi.\n\nE-posta: ${recipientEmail}\nŞifre: ${password}\n\nGiriş: https://damga.deploi.net/auth/sign-in\n\nİlk girişten sonra Profil → Şifre değiştir kısmından kendi şifrene değiştirmen önerilir.`,
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-success/10 text-success shrink-0">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <h2 className="font-display text-xl">Şifre belirlendi</h2>
              <p className="text-xs text-muted mt-0.5">
                {recipientName} · {recipientEmail}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5 -mt-1 -mr-1"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-sm text-muted">
          {generated ? (
            <>
              Otomatik <strong className="text-ink">güçlü şifre</strong> üretildi. Kullanıcıya
              ulaştır — istediği kanaldan paylaşabilirsin.
            </>
          ) : (
            <>
              Belirlediğin şifre kullanıcıya atandı. Aşağıdaki butonlarla paylaşabilirsin.
            </>
          )}
        </p>

        <div className="rounded-lg border-2 border-orange-300 bg-orange-50/60 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-orange-600 flex items-center gap-1">
              <KeyRound className="size-3" /> Yeni Şifre
            </div>
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="btn-ghost p-1 text-xs text-muted hover:text-orange-600"
              title={reveal ? 'Gizle' : 'Göster'}
            >
              {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
          <div className="font-mono text-lg break-all text-ink select-all tracking-wider">
            {reveal ? password : '•'.repeat(password.length)}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className={`btn-outline text-xs flex-col gap-1 py-3 ${
              copied ? 'border-success/40 text-success bg-success/5' : ''
            }`}
          >
            {copied ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
          <a
            href={`https://wa.me/?text=${waMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline text-xs flex-col gap-1 py-3"
          >
            <MessageCircle className="size-4 text-[#25D366]" />
            WhatsApp
          </a>
          <a
            href={`mailto:${recipientEmail}?subject=${mailSubject}&body=${mailBody}`}
            className="btn-outline text-xs flex-col gap-1 py-3"
          >
            <Mail className="size-4 text-orange-500" />
            Mail
          </a>
        </div>

        <div className="rounded-md bg-warning/5 border border-warning/20 px-3 py-2 text-[11px] text-muted flex items-start gap-1.5">
          <AlertTriangle className="size-3.5 text-warning shrink-0 mt-0.5" />
          <div>
            <strong className="text-ink">Güvenlik notu:</strong> Şifreyi kullanıcıya
            iletildikten sonra, kullanıcının ilk girişte{' '}
            <strong className="text-ink">Profil → Şifre değiştir</strong>'den kendi
            şifresine geçmesini öner. Damga audit log'una bu işlem yazılmıştır.
          </div>
        </div>

        <button type="button" onClick={onClose} className="btn-primary w-full">
          Tamamladım
        </button>
      </div>
    </div>
  );
}
