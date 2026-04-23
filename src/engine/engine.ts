import { MAX_CHARACTER_LEVEL, MAX_SKILL_PAGES, SKILL_PAGE_NAME_MAX_LENGTH } from './constants';
import { ClassIndex, getSkillMaxLevel } from './class-tree';
import { getTotalPoints } from './skill-points';
import { buildVariationGroups, classifySkill, findVariationBase, type SkillRole } from './variations';
import { canDecrement, canIncrement, skillPointCost } from './validation';
import { getLockingSkills } from './skill-overrides';
import { refit } from './refit';
import {
    AllocationIssue,
    type AllocationResult,
    type CharacterState,
    type ClassRecord,
    type SkillPage,
    type SkillRecord,
} from './types';

export interface EngineInit {
    skills: SkillRecord[];
    classes: ClassRecord[];
    initialState: CharacterState;
}

/** A single allocation in a cascade plan. */
export interface PlanStep {
    skillId: number;
    levels: number;
}

/** Result of a cascade feasibility check. On success, every step that would
 *  be applied (deepest prereqs first) plus the total point cost. On failure,
 *  the single issue that blocked the cascade. */
export type AllocationPlan =
    | { ok: true; totalCost: number; steps: PlanStep[] }
    | { ok: false; issue: AllocationIssue };

/**
 * The public façade of the skill system. Immutable-flavored — every mutating
 * method replaces the internal state atomically and re-runs `refit`. Listeners
 * registered via `subscribe` receive the new state.
 */
export class SkillEngine {
    private state: CharacterState;
    private readonly skillsById: Map<number, SkillRecord>;
    private readonly skillsByClass: Map<number, SkillRecord[]>;
    private readonly classIndex: ClassIndex;
    private readonly listeners = new Set<(s: CharacterState) => void>();

    private cachedLearnedClassIds: Set<number> = new Set();
    private cachedAvailableSkills: SkillRecord[] = [];
    private cachedVariationGroups: Map<number, SkillRecord[]> = new Map();
    private cachedTotalPoints = 0;

    constructor({ skills, classes, initialState }: EngineInit) {
        this.skillsById = new Map(skills.map((s) => [s.id, s]));
        this.skillsByClass = new Map();

        for (const s of skills) {
            const bucket = this.skillsByClass.get(s.class);

            if (bucket) {
                bucket.push(s);
            } else {
                this.skillsByClass.set(s.class, [s]);
            }
        }

        this.classIndex = new ClassIndex(classes);
        this.state = normalizeState(initialState);
        this.recomputeCaches();
    }

    // ---------- Subscription ----------

    subscribe(listener: (s: CharacterState) => void): () => void {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    }

    private emit() {
        for (const l of this.listeners) {
            l(this.state);
        }
    }

    // ---------- Caches ----------

    private recomputeCaches() {
        const chain = this.classIndex.getChain(this.state.classId);
        const learned: ClassRecord[] = [];

        for (const c of chain) {
            if (c.minLevel <= this.state.level) {
                learned.push(c);
            }
        }

        this.cachedLearnedClassIds = new Set(learned.map((c) => c.id));
        this.cachedAvailableSkills = chain.flatMap((c) => this.skillsByClass.get(c.id) ?? []);
        this.cachedVariationGroups = buildVariationGroups(this.cachedAvailableSkills, this.skillsById, this.classIndex);

        const currentTier = this.classIndex.getCurrentTierClass(this.state.classId, this.state.level);
        this.cachedTotalPoints = getTotalPoints(this.state.level, currentTier);
    }

    // ---------- Read API ----------

    getState(): CharacterState {
        return this.state;
    }

    getAllocations(): Record<number, number> {
        return this.state.pages[this.state.activePageIndex].allocations;
    }

    getSkill(id: number): SkillRecord | undefined {
        return this.skillsById.get(id);
    }

    getClassChain(): ClassRecord[] {
        return this.classIndex.getChain(this.state.classId);
    }

    getCurrentTierClass(): ClassRecord | undefined {
        return this.classIndex.getCurrentTierClass(this.state.classId, this.state.level);
    }

    getAvailableSkills(): SkillRecord[] {
        return this.cachedAvailableSkills;
    }

    getSkillsForClass(classId: number): SkillRecord[] {
        return this.skillsByClass.get(classId) ?? [];
    }

    getMasterVariations(baseSkillId: number): SkillRecord[] {
        return this.cachedVariationGroups.get(baseSkillId) ?? [];
    }

    getSelectedVariation(baseSkillId: number): SkillRecord | null {
        const alloc = this.getAllocations();

        for (const variation of this.getMasterVariations(baseSkillId)) {
            if ((alloc[variation.id] ?? 0) > 0) {
                return variation;
            }
        }

        return null;
    }

    getVariationBase(variationId: number): SkillRecord | null {
        const variation = this.skillsById.get(variationId);

        if (!variation) {
            return null;
        }

        return findVariationBase(variation, this.skillsById, this.classIndex);
    }

    classifySkill(skillId: number): SkillRole | null {
        const skill = this.skillsById.get(skillId);

        if (!skill) {
            return null;
        }

        return classifySkill(skill, this.classIndex);
    }

    getTotalPoints(): number {
        return this.cachedTotalPoints;
    }

    getSpentPoints(): number {
        const alloc = this.getAllocations();
        let total = 0;

        for (const [idStr, level] of Object.entries(alloc)) {
            const skill = this.skillsById.get(Number(idStr));

            if (skill) {
                total += skillPointCost(skill, this.classIndex) * level;
            }
        }

        return total;
    }

    getRemainingPoints(): number {
        return this.cachedTotalPoints - this.getSpentPoints();
    }

    getSkillLevel(skillId: number): number {
        return this.getAllocations()[skillId] ?? 0;
    }

    /**
     * Strict, non-cascading check: can one more level be added to `skillId`
     * **right now**, with no automatic filling of prereqs or base-maxing?
     * Used internally by the validator and by tests that assert on the raw
     * issue (e.g., PREREQ_MISSING). For UI "can I click +?" decisions,
     * prefer `canIncrementCascade()` which accounts for auto-fill.
     */
    canIncrement(skillId: number): AllocationResult {
        const skill = this.skillsById.get(skillId);

        if (!skill) {
            return { ok: false, issue: AllocationIssue.UNKNOWN_SKILL };
        }

        return canIncrement({
            skill,
            skillsById: this.skillsById,
            index: this.classIndex,
            learnedClassIds: this.cachedLearnedClassIds,
            characterLevel: this.state.level,
            allocations: this.getAllocations(),
            variationGroups: this.cachedVariationGroups,
            remainingPoints: this.getRemainingPoints(),
        });
    }

    /**
     * Cascade-aware: would a click on `+` succeed? This computes the full set
     * of allocations that would be applied (target + prereqs + base-maxing),
     * their total point cost, and returns OK only if every step passes and
     * the total fits the remaining budget.
     */
    canIncrementCascade(skillId: number): AllocationResult {
        const plan = this.planIncrement(skillId, 1);

        return plan.ok ? { ok: true, issue: AllocationIssue.OK } : { ok: false, issue: plan.issue };
    }

    /**
     * Projected total skill-point cost of clicking `+` once on `skillId`,
     * including any auto-filled prereqs or auto-maxed base skill. Returns
     * null if the cascade is infeasible.
     */
    getIncrementCost(skillId: number): number | null {
        const plan = this.planIncrement(skillId, 1);

        return plan.ok ? plan.totalCost : null;
    }

    canDecrement(skillId: number): AllocationResult {
        const skill = this.skillsById.get(skillId);

        if (!skill) {
            return { ok: false, issue: AllocationIssue.UNKNOWN_SKILL };
        }

        return canDecrement({
            skill,
            skillsById: this.skillsById,
            index: this.classIndex,
            learnedClassIds: this.cachedLearnedClassIds,
            characterLevel: this.state.level,
            allocations: this.getAllocations(),
            variationGroups: this.cachedVariationGroups,
            remainingPoints: this.getRemainingPoints(),
        });
    }

    // ---------- Write API ----------

    setClass(classId: number) {
        const c = this.classIndex.getById(classId);

        if (!c) {
            return;
        }

        this.state = { ...this.state, classId, pages: this.state.pages.map((p) => ({ ...p, allocations: {} })) };
        this.recomputeCaches();
        this.applyRefit();
        this.emit();
    }

    setLevel(level: number) {
        const bounded = Math.max(1, Math.min(MAX_CHARACTER_LEVEL, Math.floor(level)));

        if (bounded === this.state.level) {
            return;
        }

        this.state = { ...this.state, level: bounded };
        this.recomputeCaches();
        this.applyRefit();
        this.emit();
    }

    increment(skillId: number, delta = 1) {
        const skill = this.skillsById.get(skillId);

        if (!skill) {
            return;
        }

        if (delta > 0) {
            for (let i = 0; i < delta; i++) {
                const plan = this.planIncrement(skillId, 1);

                if (!plan.ok) {
                    break;
                }

                this.mutateAllocations((alloc) => {
                    for (const step of plan.steps) {
                        alloc[step.skillId] = (alloc[step.skillId] ?? 0) + step.levels;
                    }
                });
            }
        } else if (delta < 0) {
            const current = this.getSkillLevel(skillId);
            const target = Math.max(0, current + delta);

            if (target === current) {
                return;
            }

            this.mutateAllocations((alloc) => {
                if (target === 0) {
                    delete alloc[skillId];
                } else {
                    alloc[skillId] = target;
                }
            });
            this.applyRefit();
        }

        this.emit();
    }

    max(skillId: number) {
        const skill = this.skillsById.get(skillId);

        if (!skill) {
            return;
        }

        const needed = getSkillMaxLevel(skill) - this.getSkillLevel(skillId);

        if (needed > 0) {
            this.increment(skillId, needed);
        }
    }

    reset(skillId: number) {
        const current = this.getSkillLevel(skillId);

        if (current <= 0) {
            return;
        }

        this.increment(skillId, -current);
    }

    resetAll() {
        this.mutateAllocations((alloc) => {
            for (const k of Object.keys(alloc)) {
                delete alloc[Number(k)];
            }
        });
        this.emit();
    }

    // ---------- Skill pages ----------

    addPage(name?: string): number {
        if (this.state.pages.length >= MAX_SKILL_PAGES) {
            return this.state.pages.length - 1;
        }

        const page: SkillPage = { name: clampName(name ?? ''), allocations: {} };
        const pages = [...this.state.pages, page];
        this.state = { ...this.state, pages, activePageIndex: pages.length - 1 };
        this.emit();

        return pages.length - 1;
    }

    removePage(index: number) {
        if (this.state.pages.length <= 1 || index < 0 || index >= this.state.pages.length) {
            return;
        }

        const pages = this.state.pages.filter((_, i) => i !== index);
        const active = Math.min(this.state.activePageIndex, pages.length - 1);
        this.state = { ...this.state, pages, activePageIndex: active };
        this.recomputeCaches();
        this.emit();
    }

    renamePage(index: number, name: string) {
        if (index < 0 || index >= this.state.pages.length) {
            return;
        }

        const pages = this.state.pages.map((p, i) => (i === index ? { ...p, name: clampName(name) } : p));
        this.state = { ...this.state, pages };
        this.emit();
    }

    setActivePage(index: number) {
        if (index < 0 || index >= this.state.pages.length || index === this.state.activePageIndex) {
            return;
        }

        this.state = { ...this.state, activePageIndex: index };
        this.recomputeCaches();
        this.emit();
    }

    duplicatePage(index: number): number {
        if (this.state.pages.length >= MAX_SKILL_PAGES || index < 0 || index >= this.state.pages.length) {
            return -1;
        }

        const source = this.state.pages[index];
        const page: SkillPage = { name: clampName(`${source.name} (copy)`), allocations: { ...source.allocations } };
        const pages = [...this.state.pages, page];
        this.state = { ...this.state, pages, activePageIndex: pages.length - 1 };
        this.emit();

        return pages.length - 1;
    }

    // ---------- Internals ----------

    private mutateAllocations(mutator: (alloc: Record<number, number>) => void) {
        const pages = this.state.pages.map((p, i) => {
            if (i !== this.state.activePageIndex) {
                return p;
            }

            const next = { ...p.allocations };
            mutator(next);

            return { ...p, allocations: next };
        });

        this.state = { ...this.state, pages };
    }

    /**
     * Pure-function cascade planner: computes every allocation that would be
     * applied if the user clicked `+` on `skillId` — the target itself, any
     * missing prereqs filled up to their required level, and (for variation
     * skills) the base skill maxed first. Nothing is mutated; the result is
     * either a success (ordered steps + total cost) or the single
     * `AllocationIssue` that blocks the cascade.
     *
     * Because this is mechanically accurate, the UI can disable `+` when the
     * plan reports a blocker — no more optimistic clicking.
     */
    private planIncrement(skillId: number, needLevels = 1): AllocationPlan {
        const realAllocs = this.getAllocations();
        const virt = new Map<number, number>();
        const visiting = new Set<number>();
        const steps: PlanStep[] = [];

        const effectiveLevel = (id: number) => (realAllocs[id] ?? 0) + (virt.get(id) ?? 0);

        const add = (id: number, levels: number): AllocationIssue | null => {
            if (levels <= 0) {
                return null;
            }

            if (visiting.has(id)) {
                // Cycle in the dependency graph — shouldn't happen in well-formed data.
                return AllocationIssue.UNKNOWN_SKILL;
            }

            const skill = this.skillsById.get(id);

            if (!skill) {
                return AllocationIssue.UNKNOWN_SKILL;
            }

            const current = effectiveLevel(id);
            const maxLevel = getSkillMaxLevel(skill);

            if (current + levels > maxLevel) {
                return AllocationIssue.SKILL_MAX;
            }

            if (!this.cachedLearnedClassIds.has(skill.class)) {
                return AllocationIssue.CLASS_NOT_LEARNED;
            }

            if (this.state.level < skill.level) {
                return AllocationIssue.CHARACTER_LEVEL_TOO_LOW;
            }

            for (const lockerId of getLockingSkills(id)) {
                if (effectiveLevel(lockerId) > 0) {
                    return AllocationIssue.LOCKED_BY_OTHER_SKILL;
                }
            }

            if (classifySkill(skill, this.classIndex) === 'variation') {
                const base = findVariationBase(skill, this.skillsById, this.classIndex);

                if (base) {
                    const siblings = this.cachedVariationGroups.get(base.id) ?? [];

                    for (const sibling of siblings) {
                        if (sibling.id === id) {
                            continue;
                        }

                        if (effectiveLevel(sibling.id) > 0) {
                            return AllocationIssue.MASTER_VARIATION_CONFLICT;
                        }
                    }

                    const baseMax = getSkillMaxLevel(base);
                    const baseDeficit = baseMax - effectiveLevel(base.id);

                    if (baseDeficit > 0) {
                        visiting.add(id);
                        const baseIssue = add(base.id, baseDeficit);
                        visiting.delete(id);

                        if (baseIssue) {
                            return baseIssue;
                        }
                    }
                }
            }

            for (const req of skill.requirements ?? []) {
                const deficit = req.level - effectiveLevel(req.skill);

                if (deficit > 0) {
                    visiting.add(id);
                    const reqIssue = add(req.skill, deficit);
                    visiting.delete(id);

                    if (reqIssue) {
                        return reqIssue;
                    }
                }
            }

            virt.set(id, (virt.get(id) ?? 0) + levels);
            steps.push({ skillId: id, levels });

            return null;
        };

        const issue = add(skillId, needLevels);

        if (issue) {
            return { ok: false, issue };
        }

        let totalCost = 0;

        for (const step of steps) {
            const skill = this.skillsById.get(step.skillId)!;
            totalCost += skillPointCost(skill, this.classIndex) * step.levels;
        }

        if (totalCost > this.getRemainingPoints()) {
            return { ok: false, issue: AllocationIssue.INSUFFICIENT_POINTS };
        }

        return { ok: true, totalCost, steps };
    }

    private applyRefit() {
        const result = refit({
            allocations: this.getAllocations(),
            skillsById: this.skillsById,
            index: this.classIndex,
            learnedClassIds: this.cachedLearnedClassIds,
            characterLevel: this.state.level,
            totalPoints: this.cachedTotalPoints,
        });

        this.mutateAllocations((alloc) => {
            for (const k of Object.keys(alloc)) {
                delete alloc[Number(k)];
            }

            for (const [k, v] of Object.entries(result.allocations)) {
                alloc[Number(k)] = v;
            }
        });
    }
}

function clampName(name: string): string {
    return name.slice(0, SKILL_PAGE_NAME_MAX_LENGTH);
}

function normalizeState(state: CharacterState): CharacterState {
    const pages = state.pages.length > 0 ? state.pages : [{ name: '', allocations: {} }];
    const active = Math.max(0, Math.min(pages.length - 1, state.activePageIndex));

    return {
        classId: state.classId,
        level: Math.max(1, Math.min(MAX_CHARACTER_LEVEL, Math.floor(state.level))),
        pages,
        activePageIndex: active,
    };
}

/**
 * Convenience factory for the common case: start a fresh character at level 1
 * with one empty skill page.
 */
export function createInitialState(classId: number): CharacterState {
    return {
        classId,
        // Default to max level so a fresh visit to `/c/<class>` shows the
        // full named-class tree rather than the tier-1 Vagrant subset —
        // matches user intent ("I'm on /c/templar to plan a Templar build")
        // and keeps the SSG prerender's content consistent with what the
        // client hydrates to, so there's no post-hydration content flip.
        level: MAX_CHARACTER_LEVEL,
        pages: [{ name: '', allocations: {} }],
        activePageIndex: 0,
    };
}
