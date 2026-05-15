/**
 * Dil seçici — settings sayfasında veya navbar'da.
 *
 * Şu an TR/EN destekleniyor. Yeni dil eklemek için:
 *   1. apps/web/src/i18n/locales/<lang>.json
 *   2. i18n/index.ts'te resources'a ekle
 *   3. LANGUAGES sabitine ekle
 */
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? 'tr';

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-1">
      <Globe className="size-4 text-zinc-400 ml-1" />
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => void i18n.changeLanguage(l.code)}
          className={`px-2.5 py-1 rounded-md text-sm font-medium transition ${
            current === l.code
              ? 'bg-purple-700 text-white'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
          aria-label={l.label}
          title={l.label}
        >
          <span className="mr-1">{l.flag}</span>
          <span className="hidden sm:inline">{l.code.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}
