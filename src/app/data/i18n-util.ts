import type { I18nString } from '@engine/types';

/**
 * Pulls a value from a Flyff i18n object with graceful fallback to English.
 * Flyff coverage varies heavily per-language; returning empty strings would
 * produce broken UI, so we always fall back.
 */
export function getLocalized(field: I18nString | undefined, lang: string): string {
    if (!field) {
        return '';
    }

    const val = field[lang];

    if (val && val.trim()) {
        return val;
    }

    return field.en ?? '';
}
