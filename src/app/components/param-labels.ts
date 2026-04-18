import type { I18nString } from '@engine/types';

/**
 * Resolves an API-sourced parameter label for the current locale. The `labels`
 * map comes from `public/data/parameter-labels.json` (scraped from
 * `https://api.flyff.com/language/parameter/<name>`), so every translation is
 * official — no hand-curated maps.
 *
 * Fallback order: locale → English → minimal humanization (raw parameter with
 * first letter capitalized). The `rate` flag doesn't affect the label — the
 * API gives one string per parameter name; `rate` only governs value
 * formatting ("+X%" vs "+X") in the caller.
 */
export function getParamLabel(
    parameter: string,
    locale: string,
    labels: Record<string, I18nString>,
): string {
    const entry = labels[parameter];

    if (entry) {
        const localized = (entry as Record<string, string | undefined>)[locale];

        if (localized && localized.trim().length > 0) {
            return localized.trim();
        }

        if (entry.en && entry.en.trim().length > 0) {
            return entry.en.trim();
        }
    }

    if (!parameter) {
        return '';
    }

    return parameter.charAt(0).toUpperCase() + parameter.slice(1);
}
