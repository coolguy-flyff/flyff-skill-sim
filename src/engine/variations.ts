import { getSkillTier, type ClassIndex } from './class-tree';
import type { SkillRecord } from './types';

/**
 * 3rd class skills come in three flavors:
 *  - `base`     — shown in the tree canvas.
 *  - `variation` — "master variations", shown in a dedicated panel. Only one per
 *                  base can be allocated, and only once the base is maxed.
 *                  Authoritatively identified by the `inheritSkill` field
 *                  (API ≥ 1.9.0); falls back to a treePosition=(0,0) heuristic
 *                  for older snapshots.
 *  - `passive`  — right-side passives panel: `passive === true` on a 3rd-class
 *                 skill. The game has no separate schema flag; we rely on the
 *                 boolean `passive` field.
 *
 * 1st/2nd class / Vagrant skills are always "base".
 */
export type SkillRole = 'base' | 'variation' | 'passive';

export function classifySkill(skill: SkillRecord, index: ClassIndex): SkillRole {
    const tier = getSkillTier(skill, index);

    if (tier !== 'third') {
        return 'base';
    }

    if (skill.inheritSkill !== undefined) {
        return 'variation';
    }

    if (skill.passive === true) {
        return 'passive';
    }

    return 'base';
}

/**
 * For a variation, resolve its base skill. Prefers the authoritative
 * `inheritSkill` field; falls back to scanning `requirements` for a qualifying
 * 3rd-class base.
 */
export function findVariationBase(
    variation: SkillRecord,
    skillsById: Map<number, SkillRecord>,
    index: ClassIndex,
): SkillRecord | null {
    if (variation.inheritSkill !== undefined) {
        return skillsById.get(variation.inheritSkill) ?? null;
    }

    for (const req of variation.requirements ?? []) {
        const candidate = skillsById.get(req.skill);

        if (candidate && classifySkill(candidate, index) === 'base' && getSkillTier(candidate, index) === 'third') {
            return candidate;
        }
    }

    return null;
}

/**
 * Group variations by their base skill id. Uses the authoritative
 * `masterVariations` array on base skills first, then falls back to scanning
 * `inheritSkill` pointers so both representations stay in sync.
 */
export function buildVariationGroups(
    skills: SkillRecord[],
    skillsById: Map<number, SkillRecord>,
    index: ClassIndex,
): Map<number, SkillRecord[]> {
    const groups = new Map<number, SkillRecord[]>();

    for (const skill of skills) {
        if (!skill.masterVariations || skill.masterVariations.length === 0) {
            continue;
        }

        const variations: SkillRecord[] = [];

        for (const id of skill.masterVariations) {
            const v = skillsById.get(id);

            if (v) {
                variations.push(v);
            }
        }

        if (variations.length > 0) {
            groups.set(skill.id, variations);
        }
    }

    for (const skill of skills) {
        if (classifySkill(skill, index) !== 'variation') {
            continue;
        }

        if (skill.inheritSkill !== undefined && groups.has(skill.inheritSkill)) {
            continue;
        }

        const base = findVariationBase(skill, skillsById, index);

        if (!base) {
            continue;
        }

        const existing = groups.get(base.id);

        if (existing) {
            if (!existing.includes(skill)) {
                existing.push(skill);
            }
        } else {
            groups.set(base.id, [skill]);
        }
    }

    return groups;
}
