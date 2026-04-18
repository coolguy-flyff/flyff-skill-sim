import { describe, expect, it } from 'vitest';
import { decodeState, encodeState } from '../serializer';
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
