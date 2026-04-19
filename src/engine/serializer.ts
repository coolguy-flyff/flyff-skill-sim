import type { CharacterState, SkillPage, SkillRecord } from './types';
import { MAX_CHARACTER_LEVEL, MAX_SKILL_PAGES } from './constants';

const V1_VERSION = '1';
const V2_VERSION = '2';
const V1_PAGE_SEP = '~';
const V1_FIELD_SEP = '|';
const V2_HEADER_BYTE = 0x02;

// --- Base64url helpers ---

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = '';

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(s: string): Uint8Array | null {
    if (!s) {
        return new Uint8Array(0);
    }

    try {
        const b64 = s.replaceAll('-', '+').replaceAll('_', '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        return bytes;
    } catch {
        return null;
    }
}

// --- v1 legacy (decode only; writers always emit v2). ---

function v1EncodeName(name: string): string {
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

function v1DecodeName(encoded: string): string {
    if (!encoded) {
        return '';
    }

    const bytes = base64UrlToBytes(encoded);

    if (!bytes) {
        return '';
    }

    try {
        return new TextDecoder().decode(bytes);
    } catch {
        return '';
    }
}

function v1EncodeAllocations(alloc: Record<number, number>): string {
    const entries = Object.entries(alloc)
        .filter(([, level]) => level > 0)
        .map(([id, level]) => `${id}:${level}`);

    entries.sort();

    return entries.join(',');
}

function v1DecodeAllocations(encoded: string, validSkillIds: Set<number>): Record<number, number> {
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

/** v1 encode — kept for regression tests and for generating v1 fixtures to
 *  exercise the legacy decode path. Callers outside this module should use
 *  `encodeState`, which emits v2. */
export function encodeStateV1(state: CharacterState): string {
    const params = new URLSearchParams();
    params.set('v', V1_VERSION);
    params.set('c', String(state.classId));
    params.set('l', String(state.level));
    params.set('ap', String(state.activePageIndex));

    const pagesEncoded = state.pages
        .map((p) => `${v1EncodeName(p.name)}${V1_FIELD_SEP}${v1EncodeAllocations(p.allocations)}`)
        .join(V1_PAGE_SEP);
    params.set('p', pagesEncoded);

    return params.toString();
}

function decodeV1(params: URLSearchParams, validSkillIds: Set<number>): DecodeResult | null {
    if (!params.has('c') || !params.has('l')) {
        return null;
    }

    const classId = Number(params.get('c'));
    const level = Number(params.get('l'));

    if (!Number.isFinite(classId) || !Number.isFinite(level)) {
        return null;
    }

    const raw = params.get('p') ?? '';
    const pageChunks = raw ? raw.split(V1_PAGE_SEP) : [''];
    const pages: SkillPage[] = pageChunks.slice(0, MAX_SKILL_PAGES).map((chunk) => {
        const [nameEncoded, allocEncoded] = chunk.split(V1_FIELD_SEP);

        return {
            name: v1DecodeName(nameEncoded ?? ''),
            allocations: v1DecodeAllocations(allocEncoded ?? '', validSkillIds),
        };
    });

    if (pages.length === 0) {
        pages.push({ name: '', allocations: {} });
    }

    const activePageIndex = Math.max(0, Math.min(pages.length - 1, Number(params.get('ap') ?? 0) || 0));
    const boundedLevel = Math.max(1, Math.min(MAX_CHARACTER_LEVEL, Math.floor(level)));

    return { classId, level: boundedLevel, activePageIndex, pages };
}

// --- v2 binary pack/unpack ---

// Byte layout (fields are fixed-size; per-page sections are length-prefixed):
//   u8    version (=2)
//   u16BE classId
//   u8    level (1..190)
//   u8    packed: hi nibble = activePageIndex (0..3), lo nibble = pagesCount-1 (0..3)
//   per page:
//     u8    name byte length (0..255)
//     [n]   UTF-8 name bytes
//     u8    allocations count (0..255)
//     per allocation:
//       u16BE skillId
//       u8    level (1..255)

function encodeV2(state: CharacterState): Uint8Array {
    const pageCount = Math.max(1, Math.min(MAX_SKILL_PAGES, state.pages.length));
    const pages = state.pages.slice(0, pageCount);
    const activePageIndex = Math.max(0, Math.min(pageCount - 1, state.activePageIndex));
    const encoder = new TextEncoder();

    // Pre-encode page names so we know the total buffer size in advance.
    const pageBuffers: { name: Uint8Array; allocations: [number, number][] }[] = pages.map((p) => ({
        name: encoder.encode(p.name ?? ''),
        allocations: Object.entries(p.allocations)
            .filter(([, lvl]) => lvl > 0)
            .map(([id, lvl]) => [Number(id), Number(lvl)] as [number, number])
            .sort((a, b) => a[0] - b[0]),
    }));

    // 5 bytes header + per page: 1 (nameLen) + nameBytes + 1 (allocCount) + 3 per allocation.
    const size =
        5 +
        pageBuffers.reduce((sum, p) => sum + 1 + p.name.length + 1 + p.allocations.length * 3, 0);
    const buf = new Uint8Array(size);
    let o = 0;

    buf[o++] = V2_HEADER_BYTE;
    const classId = Math.max(0, Math.min(0xffff, state.classId | 0));
    buf[o++] = (classId >> 8) & 0xff;
    buf[o++] = classId & 0xff;
    buf[o++] = Math.max(1, Math.min(MAX_CHARACTER_LEVEL, state.level | 0));
    buf[o++] = ((activePageIndex & 0x0f) << 4) | ((pageCount - 1) & 0x0f);

    for (const p of pageBuffers) {
        const nameLen = Math.min(255, p.name.length);
        buf[o++] = nameLen;
        buf.set(p.name.subarray(0, nameLen), o);
        o += nameLen;
        const allocCount = Math.min(255, p.allocations.length);
        buf[o++] = allocCount;

        for (let i = 0; i < allocCount; i++) {
            const [id, lvl] = p.allocations[i];
            buf[o++] = (id >> 8) & 0xff;
            buf[o++] = id & 0xff;
            buf[o++] = Math.max(0, Math.min(255, lvl | 0));
        }
    }

    return buf.subarray(0, o);
}

function decodeV2(bytes: Uint8Array, validSkillIds: Set<number>): DecodeResult | null {
    if (bytes.length < 5) {
        return null;
    }

    if (bytes[0] !== V2_HEADER_BYTE) {
        return null;
    }

    const classId = (bytes[1] << 8) | bytes[2];
    const level = Math.max(1, Math.min(MAX_CHARACTER_LEVEL, bytes[3]));
    const packed = bytes[4];
    const activePageIndexRaw = (packed >> 4) & 0x0f;
    const pagesCount = ((packed & 0x0f) + 1);

    if (pagesCount < 1 || pagesCount > MAX_SKILL_PAGES) {
        return null;
    }

    const decoder = new TextDecoder('utf-8', { fatal: false });
    const pages: SkillPage[] = [];
    let o = 5;

    for (let i = 0; i < pagesCount; i++) {
        if (o >= bytes.length) {
            return null;
        }

        const nameLen = bytes[o++];

        if (o + nameLen > bytes.length) {
            return null;
        }

        const name = decoder.decode(bytes.subarray(o, o + nameLen));
        o += nameLen;

        if (o >= bytes.length) {
            return null;
        }

        const allocCount = bytes[o++];

        if (o + allocCount * 3 > bytes.length) {
            return null;
        }

        const allocations: Record<number, number> = {};

        for (let j = 0; j < allocCount; j++) {
            const id = (bytes[o] << 8) | bytes[o + 1];
            const lvl = bytes[o + 2];
            o += 3;

            if (lvl > 0 && validSkillIds.has(id)) {
                allocations[id] = lvl;
            }
        }

        pages.push({ name, allocations });
    }

    if (pages.length === 0) {
        pages.push({ name: '', allocations: {} });
    }

    const activePageIndex = Math.max(0, Math.min(pages.length - 1, activePageIndexRaw));

    return { classId, level, activePageIndex, pages };
}

export function encodeStateV2(state: CharacterState): string {
    const bytes = encodeV2(state);
    const params = new URLSearchParams();
    params.set('v', V2_VERSION);
    params.set('b', bytesToBase64Url(bytes));

    return params.toString();
}

// --- Public API — writes v2, reads both. ---

export function encodeState(state: CharacterState): string {
    return encodeStateV2(state);
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
 *   - legacy v=1 URLs keep working; v=2 is the current format
 * Returns null if the payload is unparseable.
 */
export function decodeState(encoded: string, options: DecodeOptions): DecodeResult | null {
    const cleaned = encoded.startsWith('#') ? encoded.slice(1) : encoded;

    if (!cleaned) {
        return null;
    }

    const params = new URLSearchParams(cleaned);
    const version = params.get('v');
    const validSkillIds = new Set(options.skills.map((s) => s.id));

    if (version === V2_VERSION) {
        const payload = params.get('b') ?? '';
        const bytes = base64UrlToBytes(payload);

        if (!bytes) {
            return null;
        }

        return decodeV2(bytes, validSkillIds);
    }

    // Legacy (v=1) or unversioned → run through the v1 parser.
    return decodeV1(params, validSkillIds);
}
