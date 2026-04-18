import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import cns from './locales/cns.json';
import sp from './locales/sp.json';

/**
 * UI chrome locales. Game content (skill/class names, descriptions) uses
 * whatever the Flyff API provides for the selected language — see
 * `getLocalized()` in `data/i18n-util.ts`. Filipino is excluded here because
 * the scraper measured only 2.1% Flyff-side coverage.
 */
export const SUPPORTED_UI_LANGUAGES = ['en', 'de', 'fr', 'cns', 'sp'] as const;
export type UILanguage = (typeof SUPPORTED_UI_LANGUAGES)[number];

/**
 * All game-content languages the Flyff API exposes (more than the UI chrome set —
 * players can pick any of these for skill names even if UI falls back to English).
 * Excludes fi/fil/sw (near-zero coverage as measured in scraper log).
 */
export const SUPPORTED_CONTENT_LANGUAGES = [
    'en',
    'ar',
    'br',
    'cns',
    'de',
    'fr',
    'id',
    'it',
    'jp',
    'kr',
    'nl',
    'pl',
    'ru',
    'sp',
    'th',
    'tw',
    'vi',
] as const;

/** Map browser language codes → our supported Flyff codes. */
const BROWSER_ALIAS: Record<string, string> = {
    'zh-CN': 'cns',
    'zh-Hans': 'cns',
    zh: 'cns',
    'zh-TW': 'tw',
    'zh-Hant': 'tw',
    es: 'sp',
    'es-ES': 'sp',
    'es-MX': 'sp',
    ja: 'jp',
    ko: 'kr',
};

export const i18nReady = i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            de: { translation: de },
            fr: { translation: fr },
            cns: { translation: cns },
            sp: { translation: sp },
        },
        fallbackLng: 'en',
        supportedLngs: [...SUPPORTED_UI_LANGUAGES],
        interpolation: { escapeValue: false },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'flyff-sim-lang',
            convertDetectedLanguage: (lng) => BROWSER_ALIAS[lng] ?? lng.split('-')[0],
        },
    });

export default i18n;
