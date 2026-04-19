import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, encodeStateV1 } from '../serializer';
import { SkillEngine, createInitialState } from '../engine';
import { testClasses, testSkills } from './fixtures';

function freshEngine() {
    return new SkillEngine({ skills: testSkills, classes: testClasses, initialState: createInitialState(4) });
}

describe('serializer — roundtrip', () => {
    it('encodes and decodes a simple build', () => {
        const engine = freshEngine();
        engine.setLevel(60);
        engine.increment(200, 5);
        engine.increment(100, 3);

        const encoded = encodeState(engine.getState());
        const decoded = decodeState(encoded, { skills: testSkills });

        expect(decoded).not.toBeNull();
        expect(decoded!.classId).toBe(4);
        expect(decoded!.level).toBe(60);
        expect(decoded!.pages[0].allocations).toEqual({ 100: 3, 200: 5 });
    });

    it('encodes and decodes multi-page with i18n page names', () => {
        const engine = freshEngine();
        engine.setLevel(30);
        engine.renamePage(0, 'PvE AoE 🪓');
        engine.addPage('PvP 防御');
        engine.increment(200, 1);

        const encoded = encodeState(engine.getState());
        const decoded = decodeState(encoded, { skills: testSkills });

        expect(decoded!.pages.map((p) => p.name)).toEqual(['PvE AoE 🪓', 'PvP 防御']);
        expect(decoded!.activePageIndex).toBe(1);
    });

    it('drops unknown skill ids silently (forward-compat with data updates)', () => {
        const oldUrl = 'v=1&c=4&l=30&ap=0&p=|200:3,99999:5';
        const decoded = decodeState(oldUrl, { skills: testSkills });
        expect(decoded!.pages[0].allocations).toEqual({ 200: 3 });
    });
});

describe('serializer — malformed input', () => {
    it('returns null on missing class/level', () => {
        expect(decodeState('p=|200:3', { skills: testSkills })).toBeNull();
    });

    it('accepts a leading # in the hash', () => {
        const decoded = decodeState('#v=1&c=4&l=30&ap=0&p=|200:3', { skills: testSkills });
        expect(decoded!.pages[0].allocations).toEqual({ 200: 3 });
    });

    it('clamps level to the valid range', () => {
        const decoded = decodeState('v=1&c=4&l=9999&ap=0&p=|', { skills: testSkills });
        expect(decoded!.level).toBe(190);
    });

    it('clamps activePageIndex to available pages', () => {
        const decoded = decodeState('v=1&c=4&l=30&ap=9&p=|', { skills: testSkills });
        expect(decoded!.activePageIndex).toBe(0);
    });
});

describe('serializer — v2 binary format', () => {
    it('encodeState emits v=2 form', () => {
        const engine = freshEngine();
        engine.setLevel(60);
        engine.increment(200, 5);

        const encoded = encodeState(engine.getState());

        expect(encoded).toMatch(/^v=2&b=/);
    });

    it('v2 roundtrip preserves simple build', () => {
        const engine = freshEngine();
        engine.setLevel(60);
        engine.increment(200, 5);
        engine.increment(100, 3);

        const encoded = encodeState(engine.getState());
        const decoded = decodeState(encoded, { skills: testSkills });

        expect(decoded).not.toBeNull();
        expect(decoded!.classId).toBe(4);
        expect(decoded!.level).toBe(60);
        expect(decoded!.pages[0].allocations).toEqual({ 100: 3, 200: 5 });
    });

    it('v2 roundtrip preserves multi-page + i18n/emoji page names', () => {
        const engine = freshEngine();
        engine.setLevel(30);
        engine.renamePage(0, 'PvE AoE 🪓');
        engine.addPage('PvP 防御');
        engine.increment(200, 1);

        const encoded = encodeState(engine.getState());
        const decoded = decodeState(encoded, { skills: testSkills });

        expect(decoded!.pages.map((p) => p.name)).toEqual(['PvE AoE 🪓', 'PvP 防御']);
        expect(decoded!.activePageIndex).toBe(1);
        expect(decoded!.pages[1].allocations).toEqual({ 200: 1 });
    });

    it('v2 drops unknown skill ids silently', () => {
        // Hand-pack a v2 byte buffer with one valid + one unknown skill id.
        // Header: 02 | classId 00 04 | level 1E (30) | packed 0000 0000 (ap=0, pages=1)
        // Page 0: nameLen 00 | allocCount 02 | [200,3] | [99999,5]
        // 99999 overflows uint16 (0x1869F → 0x869F inside uint16 boundary) but the
        // decoder should drop it because it's not in validSkillIds.
        const bytes = new Uint8Array([
            0x02, 0x00, 0x04, 0x1e, 0x00,
            0x00, 0x02,
            0x00, 0xc8, 0x03, // id=200 lvl=3
            0x86, 0x9f, 0x05, // id=0x869F=34463 (not in testSkills) lvl=5
        ]);
        const b64 = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
        const decoded = decodeState(`v=2&b=${b64}`, { skills: testSkills });

        expect(decoded!.pages[0].allocations).toEqual({ 200: 3 });
    });

    it('v2 decode rejects malformed base64', () => {
        expect(decodeState('v=2&b=~~~!', { skills: testSkills })).toBeNull();
    });

    it('v2 decode rejects truncated byte buffer', () => {
        const shortBytes = new Uint8Array([0x02, 0x00, 0x04]);
        const b64 = btoa(String.fromCharCode(...shortBytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
        expect(decodeState(`v=2&b=${b64}`, { skills: testSkills })).toBeNull();
    });

    it('v2 decode rejects wrong version byte', () => {
        const bytes = new Uint8Array([0x99, 0x00, 0x04, 0x1e, 0x00]);
        const b64 = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
        expect(decodeState(`v=2&b=${b64}`, { skills: testSkills })).toBeNull();
    });

    it('typical hash stays compact (<120 chars for a 15-skill build)', () => {
        const engine = freshEngine();
        engine.setLevel(120);

        const skillIds = testSkills.slice(0, Math.min(15, testSkills.length)).map((s) => s.id);

        for (const id of skillIds) {
            engine.increment(id, 1);
        }

        const encoded = encodeState(engine.getState());
        expect(encoded.length).toBeLessThan(120);
    });

    it('v2 preserves activePageIndex across all 4 pages', () => {
        const engine = freshEngine();
        engine.setLevel(30);
        engine.addPage('B');
        engine.addPage('C');
        engine.addPage('D');
        engine.setActivePage(2);

        const encoded = encodeState(engine.getState());
        const decoded = decodeState(encoded, { skills: testSkills });

        expect(decoded!.pages).toHaveLength(4);
        expect(decoded!.pages.map((p) => p.name)).toEqual(['', 'B', 'C', 'D']);
        expect(decoded!.activePageIndex).toBe(2);
    });
});

describe('serializer — cross-version', () => {
    it('v1 URL decodes successfully, round-trips back through v2', () => {
        // Simulate a shared v1 link: build a v1 string, decode it, re-encode via
        // the public (v2) `encodeState`, then decode that — should match.
        const engine = freshEngine();
        engine.setLevel(90);
        engine.renamePage(0, 'Legacy');
        engine.increment(200, 3);
        engine.increment(100, 5);

        const v1Hash = encodeStateV1(engine.getState());
        const fromV1 = decodeState(v1Hash, { skills: testSkills });

        expect(fromV1).not.toBeNull();
        expect(fromV1!.classId).toBe(4);
        expect(fromV1!.level).toBe(90);
        expect(fromV1!.pages[0].name).toBe('Legacy');
        expect(fromV1!.pages[0].allocations).toEqual({ 100: 5, 200: 3 });

        // Re-encode as v2 and decode again.
        const v2Hash = encodeState({
            classId: fromV1!.classId,
            level: fromV1!.level,
            pages: fromV1!.pages,
            activePageIndex: fromV1!.activePageIndex,
        });

        expect(v2Hash).toMatch(/^v=2&b=/);

        const fromV2 = decodeState(v2Hash, { skills: testSkills });
        expect(fromV2).toEqual(fromV1);
    });

    it('v=2 payload with pages having 0 allocations still decodes cleanly', () => {
        const engine = freshEngine();
        engine.setLevel(45);
        engine.addPage('Empty');

        const encoded = encodeState(engine.getState());
        const decoded = decodeState(encoded, { skills: testSkills });

        expect(decoded!.pages).toHaveLength(2);
        expect(decoded!.pages[0].allocations).toEqual({});
        expect(decoded!.pages[1].allocations).toEqual({});
    });
});
