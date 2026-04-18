import { describe, expect, it } from 'vitest';
import { calculateLevelPoints, getClassBonus, getTotalPoints } from '../skill-points';
import { testClasses } from './fixtures';

describe('calculateLevelPoints', () => {
    it('grants zero points at level 1 (start of game)', () => {
        expect(calculateLevelPoints(1)).toBe(0);
    });

    it('grants 2 per level for levels 2-20', () => {
        expect(calculateLevelPoints(2)).toBe(2);
        expect(calculateLevelPoints(20)).toBe(38);
    });

    it('applies tier 2 (21-40) at 3 per level on top of tier 1', () => {
        expect(calculateLevelPoints(40)).toBe(38 + 60);
    });

    it('clamps at level 190 regardless of input overflow', () => {
        expect(calculateLevelPoints(500)).toBe(calculateLevelPoints(190));
    });

    it('matches the spec total at level 190', () => {
        // Sum of all tiers, computed manually from init.md: 38+60+80+100+120+140+160+10+32+240
        expect(calculateLevelPoints(190)).toBe(980);
    });

    it('treats levels <1 as level 1', () => {
        expect(calculateLevelPoints(0)).toBe(0);
        expect(calculateLevelPoints(-10)).toBe(0);
    });
});

describe('getClassBonus', () => {
    it('returns 0 for Vagrant (base class, no class-change bonus)', () => {
        expect(getClassBonus('Vagrant')).toBe(0);
    });

    it('returns the spec value for known classes', () => {
        expect(getClassBonus('Mentalist')).toBe(480);
        expect(getClassBonus('Arcanist')).toBe(1190);
    });

    it('returns 0 for unknown classes (data-agnostic fallback)', () => {
        expect(getClassBonus('Unknown')).toBe(0);
    });
});

describe('getTotalPoints', () => {
    it('adds class bonus to level points', () => {
        const merc = testClasses.find((c) => c.name.en === 'Mercenary')!;
        expect(getTotalPoints(20, merc)).toBe(calculateLevelPoints(20) + 60);
    });

    it('is just level points when current class is undefined (no chain resolved)', () => {
        expect(getTotalPoints(50, undefined)).toBe(calculateLevelPoints(50));
    });
});
