import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Mail, MessageCircle, X, CheckCircle2, AlertTriangle, Link as LinkIcon } from 'lucide-react';

interface Props {
  link: string | null;
  error?: string | null;
  recipientName: string;
  recipientEmail: string;
  onClose: () => void;
  /** Modal başlığı (örn. "Owner hesabı kuruldu") */
  title?: string;
  /** Üst kısımda göstereceğimiz açıklama */
  description?: string;
}

/**
 * Şifre belirleme link'ini admin'e gösteren paylaşım modalı.
 *
 * Email rate-limit problemini bypass etmek için: Supabase generateLink ile
 * üretilmiş URL'yi kopyala/WhatsApp/mail share butonlarıyla admin manuel paylaşır.
 */
export function ShareLinkModal({
  link,
  error,
  recipientName,
  recipientEmail,
  onClose,
  title = 'Hesap kuruldu',
  description = 'Aşağıdaki şifre belirleme linkini kullanıcıya paylaş — istediği kanaldan (WhatsApp, kurumsal mail, fiziksel teslim).',
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Link kopyalandı');
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Kopyalanamadı');
    }
  };

  const waMessage = encodeURIComponent(
    `Merhaba ${recipientName},\n\nDamga hesabını kurduk. Şifre belirleme linki:\n${link}\n\nLink'e tıkla → şifreni belirle → giriş yap.`,
  );
  const mailSubject = encodeURIComponent('Damga hesabın hazır — şifreni belirle');
  const mailBody = encodeURIComponent(
    `Merhaba ${recipientName},\n\nDamga hesabın oluşturuldu.\n\nŞifreni belirlemek için:\n${link}\n\nGiriş yapmak için: https://damga.deploi.net/auth/sign-in`,
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
              <h2 className="font-display text-xl">{title}</h2>
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

        <p className="text-sm text-muted">{description}</p>

        {error && !link && (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs flex items-start gap-1.5">
            <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
            <div>
              <strong className="text-ink">Link üretilemedi:</strong>
              <div className="text-muted">{error}</div>
              <div className="text-muted mt-1">
                Kullanıcı{' '}
                <strong className="text-ink">/auth/forgot-password</strong>'tan
                kendi şifre sıfırlama maili tetikleyebilir.
              </div>
            </div>
          </div>
        )}

        {link && (
          <>
            <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-orange-600 mb-1 flex items-center gap-1">
                <LinkIcon className="size-3" /> Şifre belirleme linki
              </div>
              <div className="font-mono text-[11px] break-all text-ink select-all">
                {link}
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
                {copied ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
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

            <div className="rounded-md bg-orange-50/40 border border-orange-100 px-3 py-2 text-[11px] text-muted">
              💡 Link <strong className="text-ink">tek kullanımlık</strong> ve
              Supabase ayarına göre <strong className="text-ink">~1 saat</strong>{' '}
              içinde geçerli. Süresi dolarsa kullanıcı{' '}
              <strong className="text-ink">/auth/forgot-password</strong>'tan
              tekrar talep edebilir.
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="btn-primary w-full"
        >
          Tamamladım
        </button>
      </div>
    </div>
  );
}
