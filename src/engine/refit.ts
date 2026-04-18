import type { ClassIndex } from './class-tree';
import { skillPointCost } from './validation';
import type { SkillRecord } from './types';

interface RefitContext {
    allocations: Record<number, number>;
    skillsById: Map<number, SkillRecord>;
    index: ClassIndex;
    learnedClassIds: Set<number>;
    characterLevel: number;
    totalPoints: number;
}

interface RefitResult {
    allocations: Record<number, number>;
    refunded: number[];
}

function spentPoints(alloc: Record<number, number>, skillsById: Map<number, SkillRecord>, index: ClassIndex): number {
    let total = 0;

    for (const [idStr, level] of Object.entries(alloc)) {
        const skill = skillsById.get(Number(idStr));

        if (skill) {
            total += skillPointCost(skill, index) * level;
        }
    }

    return total;
}

function cascadeDeallocate(targetId: number, alloc: Record<number, number>, skillsById: Map<number, SkillRecord>): number[] {
    const removed: number[] = [];
    const queue: number[] = [targetId];

    while (queue.length > 0) {
        const id = queue.shift()!;

        if ((alloc[id] ?? 0) > 0) {
            alloc[id] = 0;
            removed.push(id);
        }

        for (const [depIdStr, depLevel] of Object.entries(alloc)) {
            if (depLevel <= 0) {
                continue;
            }

            const depId = Number(depIdStr);
            const dep = skillsById.get(depId);

            if (!dep || !dep.requirements) {
                continue;
            }

            for (const req of dep.requirements) {
                if (req.skill === id) {
                    queue.push(depId);
                    break;
                }
            }
        }
    }

    return removed;
}

/**
 * Re-establish constraints after a level change or similar state shift:
 *   1. Refund any skill whose character-level requirement is no longer met.
 *   2. Refund any skill whose class is no longer learned.
 *   3. Cascade-refund skills whose prereqs have been broken.
 *   4. If we're still over-budget, refund from the highest-level-requirement
 *      skills first until within the points budget.
 */
export function refit(ctx: RefitContext): RefitResult {
    const alloc: Record<number, number> = { ...ctx.allocations };
    const refunded: number[] = [];

    for (const [idStr, level] of Object.entries(alloc)) {
        if (level <= 0) {
            continue;
        }

        const id = Number(idStr);
        const skill = ctx.skillsById.get(id);

        if (!skill) {
            delete alloc[id];
            continue;
        }

        const classLearned = ctx.learnedClassIds.has(skill.class);
        const levelOk = ctx.characterLevel >= skill.level;

        if (!classLearned || !levelOk) {
            const removed = cascadeDeallocate(id, alloc, ctx.skillsById);
            refunded.push(...removed);
        }
    }

    let changed = true;

    while (changed) {
        changed = false;

        for (const [idStr, level] of Object.entries(alloc)) {
            if (level <= 0) {
                continue;
            }

            const skill = ctx.skillsById.get(Number(idStr));

            if (!skill || !skill.requirements) {
                continue;
            }

            for (const req of skill.requirements) {
                if ((alloc[req.skill] ?? 0) < req.level) {
                    const removed = cascadeDeallocate(Number(idStr), alloc, ctx.skillsById);
                    refunded.push(...removed);
                    changed = true;
                    break;
                }
            }
        }
    }

    while (spentPoints(alloc, ctx.skillsById, ctx.index) > ctx.totalPoints) {
        let pickId = -1;
        let pickLevelReq = -1;

        for (const [idStr, level] of Object.entries(alloc)) {
            if (level <= 0) {
                continue;
            }

            const id = Number(idStr);
            const skill = ctx.skillsById.get(id);

            if (!skill) {
                continue;
            }

            if (skill.level > pickLevelReq || (skill.level === pickLevelReq && id > pickId)) {
                pickLevelReq = skill.level;
                pickId = id;
            }
        }

        if (pickId < 0) {
            break;
        }

        const removed = cascadeDeallocate(pickId, alloc, ctx.skillsById);
        refunded.push(...removed);
    }

    const cleaned: Record<number, number> = {};

    for (const [idStr, level] of Object.entries(alloc)) {
        if (level > 0) {
            cleaned[Number(idStr)] = level;
        }
    }

    return { allocations: cleaned, refunded: [...new Set(refunded)] };
}
