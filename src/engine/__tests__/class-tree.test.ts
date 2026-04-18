import { describe, expect, it } from 'vitest';
import { ClassIndex, getSkillTier, getTierForDepth } from '../class-tree';
import { testClasses, testSkills } from './fixtures';

const index = new ClassIndex(testClasses);

describe('ClassIndex.getChain', () => {
    it('walks from Vagrant to 3rd class', () => {
        const chain = index.getChain(4);
        expect(chain.map((c) => c.name.en)).toEqual(['Vagrant', 'Mercenary', 'Knight', 'Templar']);
    });

    it('returns just Vagrant for Vagrant id', () => {
        expect(index.getChain(1).map((c) => c.name.en)).toEqual(['Vagrant']);
    });

    it('returns empty for unknown class id', () => {
        expect(index.getChain(9999)).toEqual([]);
    });
});

describe('ClassIndex.getCurrentTierClass', () => {
    it('returns Vagrant under level 15', () => {
        expect(index.getCurrentTierClass(4, 10)?.name.en).toBe('Vagrant');
    });

    it('advances to deepest class whose minLevel is reached', () => {
        expect(index.getCurrentTierClass(4, 60)?.name.en).toBe('Knight');
        expect(index.getCurrentTierClass(4, 165)?.name.en).toBe('Templar');
    });
});

describe('getSkillTier', () => {
    it('maps class depth to tier names', () => {
        const vagrant = testSkills.find((s) => s.id === 100)!;
        const merc = testSkills.find((s) => s.id === 200)!;
        const knight = testSkills.find((s) => s.id === 300)!;
        const templar = testSkills.find((s) => s.id === 400)!;

        expect(getSkillTier(vagrant, index)).toBe('vagrant');
        expect(getSkillTier(merc, index)).toBe('first');
        expect(getSkillTier(knight, index)).toBe('second');
        expect(getSkillTier(templar, index)).toBe('third');
    });
});

describe('getTierForDepth', () => {
    it('caps beyond depth 3 at third', () => {
        expect(getTierForDepth(10)).toBe('third');
    });
});
