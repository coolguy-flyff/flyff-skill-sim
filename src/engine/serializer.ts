import type { CharacterState, SkillPage, SkillRecord } from './types';
import { MAX_CHARACTER_LEVEL, MAX_SKILL_PAGES } from './constants';

const VERSION = '1';
const PAGE_SEP = '~';
const FIELD_SEP = '|';

/**
 * URL-safe base64: preserves i18n characters and spaces while staying hash-friendly.
 */
function encodeName(name: string): string {
    if (!name) {
        return '';
    }

    try {
        const utf8 = new TextEncoder().encode(name);
        let binary = '';

        for (const byte of utf8) {
            binary += String.fromCharCode(byte);
        }

        return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    } catch {
        return '';
    }
}

function decodeName(encoded: string): string {
    if (!encoded) {
        return '';
    }

    try {
        const b64 = encoded.replaceAll('-', '+').replaceAll('_', '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        return new TextDecoder().decode(bytes);
    } catch {
        return '';
    }
}

function encodeAllocations(alloc: Record<number, number>): string {
    const entries = Object.entries(alloc)
        .filter(([, level]) => level > 0)
        .map(([id, level]) => `${id}:${level}`);

    entries.sort();

    return entries.join(',');
}

function decodeAllocations(encoded: string, validSkillIds: Set<number>): Record<number, number> {
    const out: Record<number, number> = {};

    if (!encoded) {
        return out;
    }

    for (const entry of encoded.split(',')) {
        const [idRaw, levelRaw] = entry.split(':');
        const id = Number(idRaw);
        const level = Number(levelRaw);

        if (Number.isFinite(id) && Number.isFinite(level) && level > 0 && validSkillIds.has(id)) {
            out[id] = level;
        }
    }

    return out;
}

export function encodeState(state: CharacterState): string {
    const params = new URLSearchParams();
    params.set('v', VERSION);
    params.set('c', String(state.classId));
    params.set('l', String(state.level));
    params.set('ap', String(state.activePageIndex));

    const pagesEncoded = state.pages
        .map((p) => `${encodeName(p.name)}${FIELD_SEP}${encodeAllocations(p.allocations)}`)
        .join(PAGE_SEP);
    params.set('p', pagesEncoded);

    return params.toString();
}

export interface DecodeOptions {
    skills: SkillRecord[];
}

export interface DecodeResult {
    classId: number;
    level: number;
    activePageIndex: number;
    pages: SkillPage[];
}

/**
 * Parses an encoded hash fragment back into state components. Tolerant:
 *   - missing/unknown skill ids are dropped silently (data updates don't break URLs)
 *   - malformed pages fall back to a single empty page
 * Returns null if class id or level can't be parsed (caller decides fallback).
 */
export function decodeState(encoded: string, options: DecodeOptions): DecodeResult | null {
    const cleaned = encoded.startsWith('#') ? encoded.slice(1) : encoded;

    if (!cleaned) {
        return null;
    }

    const params = new URLSearchParams(cleaned);

    if (!params.has('c') || !params.has('l')) {
        return null;
    }

    const classId = Number(params.get('c'));
    const level = Number(params.get('l'));

    if (!Number.isFinite(classId) || !Number.isFinite(level)) {
        return null;
    }

    const validSkillIds = new Set(options.skills.map((s) => s.id));
    const raw = params.get('p') ?? '';
    const pageChunks = raw ? raw.split(PAGE_SEP) : [''];
    const pages: SkillPage[] = pageChunks.slice(0, MAX_SKILL_PAGES).map((chunk) => {
        const [nameEncoded, allocEncoded] = chunk.split(FIELD_SEP);

        return {
            name: decodeName(nameEncoded ?? ''),
            allocations: decodeAllocations(allocEncoded ?? '', validSkillIds),
        };
    });

    if (pages.length === 0) {
        pages.push({ name: '', allocations: {} });
    }

    const activePageIndex = Math.max(0, Math.min(pages.length - 1, Number(params.get('ap') ?? 0) || 0));
    const boundedLevel = Math.max(1, Math.min(MAX_CHARACTER_LEVEL, Math.floor(level)));

    return { classId, level: boundedLevel, activePageIndex, pages };
}
