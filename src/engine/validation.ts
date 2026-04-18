import { POINT_COSTS } from './constants';
import { getSkillMaxLevel, getSkillTier, type ClassIndex } from './class-tree';
import { classifySkill, findVariationBase } from './variations';
import { getLockingSkills } from './skill-overrides';
import { AllocationIssue, type AllocationResult, type SkillRecord } from './types';

export function skillPointCost(skill: SkillRecord, index: ClassIndex): number {
    const tier = getSkillTier(skill, index);

    return POINT_COSTS[tier];
}

export interface ValidationContext {
    skill: SkillRecord;
    skillsById: Map<number, SkillRecord>;
    index: ClassIndex;
    /** Skill IDs that the character has reached based on level (class chain). */
    learnedClassIds: Set<number>;
    characterLevel: number;
    allocations: Record<number, number>;
    variationGroups: Map<number, SkillRecord[]>;
    remainingPoints: number;
}

function checkPrereqs(ctx: ValidationContext): AllocationResult | null {
    const reqs = ctx.skill.requirements ?? [];

    for (const req of reqs) {
        const current = ctx.allocations[req.skill] ?? 0;

        if (current <= 0) {
            return { ok: false, issue: AllocationIssue.PREREQ_MISSING };
        }

        if (current < req.level) {
            return { ok: false, issue: AllocationIssue.PREREQ_LEVEL_TOO_LOW };
        }
    }

    return null;
}

function checkVariationConflict(ctx: ValidationContext): AllocationResult | null {
    const role = classifySkill(ctx.skill, ctx.index);

    if (role !== 'variation') {
        return null;
    }

    const base = findVariationBase(ctx.skill, ctx.skillsById, ctx.index);

    if (!base) {
        return null;
    }

    const siblings = ctx.variationGroups.get(base.id) ?? [];

    for (const sibling of siblings) {
        if (sibling.id === ctx.skill.id) {
            continue;
        }

        if ((ctx.allocations[sibling.id] ?? 0) > 0) {
            return { ok: false, issue: AllocationIssue.MASTER_VARIATION_CONFLICT };
        }
    }

    const baseLevel = ctx.allocations[base.id] ?? 0;

    if (baseLevel < getSkillMaxLevel(base)) {
        return { ok: false, issue: AllocationIssue.BASE_SKILL_NOT_MAXED };
    }

    return null;
}

/**
 * Can the character invest one more point into this skill right now?
 */
export function canIncrement(ctx: ValidationContext): AllocationResult {
    const current = ctx.allocations[ctx.skill.id] ?? 0;

    if (current >= getSkillMaxLevel(ctx.skill)) {
        return { ok: false, issue: AllocationIssue.SKILL_MAX };
    }

    if (!ctx.learnedClassIds.has(ctx.skill.class)) {
        return { ok: false, issue: AllocationIssue.CLASS_NOT_LEARNED };
    }

    if (ctx.characterLevel < ctx.skill.level) {
        return { ok: false, issue: AllocationIssue.CHARACTER_LEVEL_TOO_LOW };
    }

    for (const lockerId of getLockingSkills(ctx.skill.id)) {
        if ((ctx.allocations[lockerId] ?? 0) > 0) {
            return { ok: false, issue: AllocationIssue.LOCKED_BY_OTHER_SKILL };
        }
    }

    const variation = checkVariationConflict(ctx);

    if (variation) {
        return variation;
    }

    const prereq = checkPrereqs(ctx);

    if (prereq) {
        return prereq;
    }

    const cost = skillPointCost(ctx.skill, ctx.index);

    if (ctx.remainingPoints < cost) {
        return { ok: false, issue: AllocationIssue.INSUFFICIENT_POINTS };
    }

    return { ok: true, issue: AllocationIssue.OK };
}

/**
 * Can the character remove one point from this skill? Returns list of dependent
 * skills that would cascade-deallocate if this removal brought the skill below
 * a level required by another allocated skill.
 */
export function canDecrement(ctx: ValidationContext): AllocationResult {
    const current = ctx.allocations[ctx.skill.id] ?? 0;

    if (current <= 0) {
        return { ok: false, issue: AllocationIssue.SKILL_MIN };
    }

    const nextLevel = current - 1;
    const cascade: number[] = [];

    for (const [depIdStr, depLevel] of Object.entries(ctx.allocations)) {
        if (depLevel <= 0) {
            continue;
        }

        const depId = Number(depIdStr);

        if (depId === ctx.skill.id) {
            continue;
        }

        const dep = ctx.skillsById.get(depId);

        if (!dep || !dep.requirements) {
            continue;
        }

        for (const req of dep.requirements) {
            if (req.skill === ctx.skill.id && nextLevel < req.level) {
                cascade.push(depId);
                break;
            }
        }
    }

    return { ok: true, issue: AllocationIssue.OK, cascade: cascade.length ? cascade : undefined };
}
