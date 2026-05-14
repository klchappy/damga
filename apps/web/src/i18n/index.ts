/**
 * i18n setup — react-i18next.
 *
 * Strateji:
 *   - Default dil: tr (Türkiye)
 *   - Fallback: tr (eksik anahtarlar için TR)
 *   - User dil tercihi localStorage'da `damga-lang`
 *   - URL prefix yok (sadece state-based)
 *
 * Yeni dil eklemek için:
 *   1. apps/web/src/i18n/locales/<lang>.json oluştur (tr.json kopyala + çevir)
 *   2. import + resources'a ekle (aşağıda)
 *   3. Language switcher component'inde dil listesine ekle
 *
 * MEVCUT KOD %95+ TR HARDCODED — bu setup gelecekteki migration için iskelet.
 * `useTranslation()` yeni component'lerde kullanılır, eski kod yavaş yavaş
 * t('key') ile değiştirilir.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import tr from './locales/tr.json';
import en from './locales/en.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      tr: { translation: tr },
      en: { translation: en },
    },
    fallbackLng: 'tr',
    supportedLngs: ['tr', 'en'],
    interpolation: {
      escapeValue: false, // React zaten XSS'e karşı escape eder
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'damga-lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
