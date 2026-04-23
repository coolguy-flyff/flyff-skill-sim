import type { ClassRecord, SkillRecord, I18nString } from '@engine/types';

export interface FlyffData {
    classes: ClassRecord[];
    skills: SkillRecord[];
    classesById: Map<number, ClassRecord>;
    classesByEnName: Map<string, ClassRecord>;
    skillsById: Map<number, SkillRecord>;
    /** API-sourced display labels for ability/scaling/synergy `parameter`
     *  strings, keyed by the lowercase parameter name. Each entry holds every
     *  locale the API returns (same shape as `I18nString`). */
    parameterLabels: Record<string, I18nString>;
}

declare global {
    interface Window {
        /**
         * Decompressed file sizes injected by `tools/prerender.ts` so progress
         * tracking can divide by an accurate denominator. Compressed
         * `Content-Length` headers don't match the decompressed bytes the
         * stream reader gives us, so we use these embedded numbers instead.
         */
        __FLYFF_SIZES?: { class: number; skill: number; params: number };
    }
}

/** Conservative fallback if the prerender didn't inject sizes (dev mode, etc.).
 *  Off by a bit is fine — progress just won't land exactly at 100%. */
const FALLBACK_SIZES = { class: 50_000, skill: 3_300_000, params: 100_000 };

type ProgressListener = (fraction: number) => void;

const progressListeners = new Set<ProgressListener>();
let lastFraction = 0;

/** Subscribe to fetch progress (0..1). Listener fires on each chunk read.
 *  Returns an unsubscribe function. The most recent value is replayed
 *  immediately so late subscribers don't show 0% if loading is already partial. */
export function onLoadProgress(listener: ProgressListener): () => void {
    progressListeners.add(listener);
    listener(lastFraction);

    return () => {
        progressListeners.delete(listener);
    };
}

function emitProgress(fraction: number) {
    lastFraction = fraction;

    for (const listener of progressListeners) {
        listener(fraction);
    }
}

/**
 * Streams a fetch response, calling `onChunk` with each newly-loaded byte
 * count so callers can track progress. Falls back to a non-streaming read
 * if `response.body` isn't available (very old browsers / CORS edge cases).
 */
async function fetchStreaming(url: string, onChunk: (loaded: number) => void): Promise<string> {
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }

    if (!res.body) {
        return res.text();
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let loaded = 0;

    while (true) {
        const { done, value } = await reader.read();

        if (done) {
            text += decoder.decode();
            break;
        }

        text += decoder.decode(value, { stream: true });
        loaded += value.length;
        onChunk(loaded);
    }

    return text;
}

let cached: Promise<FlyffData> | null = null;

/** Lazily loads and memoizes the scraped game data. */
export function loadFlyffData(): Promise<FlyffData> {
    if (cached) {
        return cached;
    }

    cached = (async () => {
        const sizes = window.__FLYFF_SIZES ?? FALLBACK_SIZES;
        const total = sizes.class + sizes.skill + sizes.params;
        const loaded = { class: 0, skill: 0, params: 0 };

        function update() {
            const sum = loaded.class + loaded.skill + loaded.params;
            emitProgress(Math.min(1, sum / total));
        }

        const [classesText, skillsText, paramsText] = await Promise.all([
            fetchStreaming('/data/class.json', (n) => {
                loaded.class = n;
                update();
            }),
            fetchStreaming('/data/skill.json', (n) => {
                loaded.skill = n;
                update();
            }),
            fetchStreaming('/data/parameter-labels.json', (n) => {
                loaded.params = n;
                update();
            }),
        ]);

        emitProgress(1);

        const classes = JSON.parse(classesText) as ClassRecord[];
        const skills = JSON.parse(skillsText) as SkillRecord[];
        const parameterLabels = JSON.parse(paramsText) as Record<string, I18nString>;

        return {
            classes,
            skills,
            classesById: new Map(classes.map((c) => [c.id, c])),
            classesByEnName: new Map(classes.map((c) => [c.name.en, c])),
            skillsById: new Map(skills.map((s) => [s.id, s])),
            parameterLabels,
        };
    })();

    return cached;
}
