import type { ClassRecord, ClassTier, SkillRecord } from './types';

const TIER_BY_DEPTH: Record<number, ClassTier> = {
    0: 'vagrant',
    1: 'first',
    2: 'second',
    3: 'third',
};

/**
 * Indexed view over the class list — built once and reused for chain traversal.
 */
export class ClassIndex {
    private byId = new Map<number, ClassRecord>();
    private byEnName = new Map<string, ClassRecord>();

    constructor(private readonly classes: ClassRecord[]) {
        for (const c of classes) {
            this.byId.set(c.id, c);
            this.byEnName.set(c.name.en, c);
        }
    }

    getAll(): ClassRecord[] {
        return this.classes;
    }

    getById(id: number): ClassRecord | undefined {
        return this.byId.get(id);
    }

    getByName(enName: string): ClassRecord | undefined {
        return this.byEnName.get(enName);
    }

    /**
     * Walk the parent chain from `classId` up to the root (Vagrant), then reverse.
     * Returns [Vagrant, 1st, 2nd, 3rd] for a 3rd-class id; shorter for 1st/2nd.
     */
    getChain(classId: number): ClassRecord[] {
        const chain: ClassRecord[] = [];
        let current = this.byId.get(classId);

        while (current) {
            chain.unshift(current);

            if (current.parent === null || current.parent === undefined) {
                break;
            }

            const parent = this.byId.get(current.parent);

            if (!parent) {
                break;
            }

            current = parent;
        }

        return chain;
    }

    /**
     * The class the character currently belongs to, based on level. Walks the
     * chain and picks the deepest class whose minLevel ≤ level.
     */
    getCurrentTierClass(classId: number, level: number): ClassRecord | undefined {
        const chain = this.getChain(classId);
        let best: ClassRecord | undefined = undefined;

        for (const c of chain) {
            if (c.minLevel <= level) {
                best = c;
            }
        }

        return best;
    }
}

export function getTierForDepth(depth: number): ClassTier {
    return TIER_BY_DEPTH[depth] ?? 'third';
}

/**
 * Maximum allocatable level of a skill. Source of truth is `skill.levels.length`
 * — each entry is one level's stats. `skill.skillPoints` is the per-level cost,
 * not the max, and must not be used as a level cap. Skills with a missing or
 * empty levels array default to 1 (single-level skill).
 */
export function getSkillMaxLevel(skill: { levels?: unknown[] }): number {
    const count = skill.levels?.length ?? 0;

    return count > 0 ? count : 1;
}

/**
 * Tier of the class this skill belongs to, measured by depth in the parent chain
 * from Vagrant (Vagrant=0, first=1, second=2, third=3).
 */
export function getSkillTier(skill: SkillRecord, index: ClassIndex): ClassTier {
    const skillClass = index.getById(skill.class);

    if (!skillClass) {
        return 'vagrant';
    }

    const chain = index.getChain(skillClass.id);

    return getTierForDepth(Math.max(0, chain.length - 1));
}
