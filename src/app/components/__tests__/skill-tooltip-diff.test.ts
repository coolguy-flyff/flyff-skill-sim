import { describe, expect, it } from 'vitest';
import type { SkillRecord } from '@engine/types';
import {
    abilityIdentityKey,
    deepEqual,
    diffEntries,
    fieldChangesAcrossLevels,
    scalingIdentityKey,
    synergyIdentityKey,
    type AbilityEntry,
    type LevelLike,
    type ScalingParam,
    type SynergyEntry,
} from '../skill-tooltip-diff';

function makeSkill(levels: LevelLike[]): SkillRecord {
    return { id: 1, name: { en: 's' }, description: { en: '' }, icon: '', class: 0, level: 1, skillPoints: 1, levels } as unknown as SkillRecord;
}

describe('fieldChangesAcrossLevels', () => {
    it('returns false when every level index has the same value', () => {
        const base = makeSkill([{ consumedMP: 20 }, { consumedMP: 25 }, { consumedMP: 30 }]);
        const variation = makeSkill([{ consumedMP: 20 }, { consumedMP: 25 }, { consumedMP: 30 }]);

        expect(fieldChangesAcrossLevels(base, variation, 'consumedMP')).toBe(false);
    });

    it('returns true when any level index differs', () => {
        const base = makeSkill([{ consumedMP: 20 }, { consumedMP: 25 }, { consumedMP: 30 }]);
        const variation = makeSkill([{ consumedMP: 20 }, { consumedMP: 26 }, { consumedMP: 30 }]);

        expect(fieldChangesAcrossLevels(base, variation, 'consumedMP')).toBe(true);
    });

    it('returns true when level arrays have different lengths', () => {
        const base = makeSkill([{ consumedMP: 20 }, { consumedMP: 25 }]);
        const variation = makeSkill([{ consumedMP: 20 }, { consumedMP: 25 }, { consumedMP: 30 }]);

        expect(fieldChangesAcrossLevels(base, variation, 'consumedMP')).toBe(true);
    });

    it('treats undefined === undefined as unchanged', () => {
        const base = makeSkill([{}, {}]);
        const variation = makeSkill([{}, {}]);

        expect(fieldChangesAcrossLevels(base, variation, 'cooldown')).toBe(false);
    });

    it('matches the MP-scaling scenario: base max=5, variation max=5, same MP curve → unchanged', () => {
        // Scenario from user spec: base lv1=20 → lv5=40, variation lv1=20 → lv5=40.
        // Must NOT be flagged as "changed by variation" even though the currently-
        // displayed levels (base lv5=40 vs variation lv1=20) have different values.
        const base = makeSkill([
            { consumedMP: 20 },
            { consumedMP: 25 },
            { consumedMP: 30 },
            { consumedMP: 35 },
            { consumedMP: 40 },
        ]);
        const variation = makeSkill([
            { consumedMP: 20 },
            { consumedMP: 25 },
            { consumedMP: 30 },
            { consumedMP: 35 },
            { consumedMP: 40 },
        ]);

        expect(fieldChangesAcrossLevels(base, variation, 'consumedMP')).toBe(false);
    });

    it('compares damageMultiplier array by first multiplier', () => {
        const base = makeSkill([{ damageMultiplier: [{ multiplier: 0.36 }] }, { damageMultiplier: [{ multiplier: 0.36 }] }]);
        const same = makeSkill([{ damageMultiplier: [{ multiplier: 0.36 }] }, { damageMultiplier: [{ multiplier: 0.36 }] }]);
        const diff = makeSkill([{ damageMultiplier: [{ multiplier: 0.5 }] }, { damageMultiplier: [{ multiplier: 0.5 }] }]);

        expect(fieldChangesAcrossLevels(base, same, 'damageMultiplier')).toBe(false);
        expect(fieldChangesAcrossLevels(base, diff, 'damageMultiplier')).toBe(true);
    });
});

describe('diffEntries', () => {
    const keyByP = (e: { parameter: string }) => e.parameter;

    it('partitions matched + deep-equal entries as unchanged', () => {
        const base = [{ parameter: 'attack', add: 5 }];
        const variation = [{ parameter: 'attack', add: 5 }];

        const result = diffEntries(base, variation, keyByP);

        expect(result.unchanged).toHaveLength(1);
        expect(result.modified).toHaveLength(0);
        expect(result.added).toHaveLength(0);
        expect(result.removed).toHaveLength(0);
    });

    it('partitions matched but value-different entries as modified (variation version returned)', () => {
        const base = [{ parameter: 'attack', add: 5 }];
        const variation = [{ parameter: 'attack', add: 10 }];

        const result = diffEntries(base, variation, keyByP);

        expect(result.modified).toEqual([{ parameter: 'attack', add: 10 }]);
        expect(result.unchanged).toHaveLength(0);
    });

    it('flags variation-only as added', () => {
        const base: { parameter: string; add: number }[] = [];
        const variation = [{ parameter: 'stun', add: 1 }];

        const result = diffEntries(base, variation, keyByP);

        expect(result.added).toEqual([{ parameter: 'stun', add: 1 }]);
    });

    it('flags base-only as removed', () => {
        const base = [{ parameter: 'weaken', add: 1 }];
        const variation: { parameter: string; add: number }[] = [];

        const result = diffEntries(base, variation, keyByP);

        expect(result.removed).toEqual([{ parameter: 'weaken', add: 1 }]);
    });

    it('handles multiple entries with mixed outcomes', () => {
        const base = [
            { parameter: 'attack', add: 5 },
            { parameter: 'speed', add: 10 },
            { parameter: 'weaken', add: 2 },
        ];
        const variation = [
            { parameter: 'attack', add: 5 },
            { parameter: 'speed', add: 15 },
            { parameter: 'stun', add: 3 },
        ];

        const result = diffEntries(base, variation, keyByP);

        expect(result.unchanged).toEqual([{ parameter: 'attack', add: 5 }]);
        expect(result.modified).toEqual([{ parameter: 'speed', add: 15 }]);
        expect(result.added).toEqual([{ parameter: 'stun', add: 3 }]);
        expect(result.removed).toEqual([{ parameter: 'weaken', add: 2 }]);
    });
});

describe('identity keys', () => {
    it('abilityIdentityKey — Stonehand PvE and PvP skillchance are distinct', () => {
        const pve: AbilityEntry = { parameter: 'skillchance', skill: 7599, pve: true, pvp: false, add: 12, rate: true };
        const pvp: AbilityEntry = { parameter: 'skillchance', skill: 7599, pve: false, pvp: true, add: 6, rate: true };

        expect(abilityIdentityKey(pve)).not.toBe(abilityIdentityKey(pvp));
    });

    it('abilityIdentityKey — same parameter+skill+scope collide', () => {
        const a: AbilityEntry = { parameter: 'hp', add: 200, rate: false };
        const b: AbilityEntry = { parameter: 'hp', add: 300, rate: false };

        expect(abilityIdentityKey(a)).toBe(abilityIdentityKey(b));
    });

    it('synergyIdentityKey — keyed by target skill + parameter', () => {
        const a: SynergyEntry = { parameter: 'attack', skill: 20466, minLevel: 3, add: false, scale: 2 };
        const b: SynergyEntry = { parameter: 'attack', skill: 20466, minLevel: 5, add: true, scale: 10 };
        const c: SynergyEntry = { parameter: 'duration', skill: 20466, minLevel: 3, add: false, scale: 2 };

        expect(synergyIdentityKey(a)).toBe(synergyIdentityKey(b));
        expect(synergyIdentityKey(a)).not.toBe(synergyIdentityKey(c));
    });

    it('scalingIdentityKey — parameter + stat + part', () => {
        const a: ScalingParam = { parameter: 'attack', stat: 'int', scale: 3.5 };
        const b: ScalingParam = { parameter: 'attack', stat: 'int', scale: 5 };
        const c: ScalingParam = { parameter: 'attack', stat: 'str', scale: 3.5 };

        expect(scalingIdentityKey(a)).toBe(scalingIdentityKey(b));
        expect(scalingIdentityKey(a)).not.toBe(scalingIdentityKey(c));
    });
});

describe('deepEqual', () => {
    it('handles primitives', () => {
        expect(deepEqual(1, 1)).toBe(true);
        expect(deepEqual(1, 2)).toBe(false);
        expect(deepEqual('a', 'a')).toBe(true);
        expect(deepEqual(undefined, undefined)).toBe(true);
        expect(deepEqual(null, null)).toBe(true);
        expect(deepEqual(null, undefined)).toBe(false);
    });

    it('handles nested objects', () => {
        expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
        expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } })).toBe(false);
    });

    it('handles arrays', () => {
        expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
        expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
        expect(deepEqual([], [])).toBe(true);
    });
});
