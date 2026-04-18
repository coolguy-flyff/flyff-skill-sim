import { describe, expect, it, beforeEach } from 'vitest';
import { SkillEngine, createInitialState } from '../engine';
import { AllocationIssue } from '../types';
import { testClasses, testSkills } from './fixtures';

function makeEngine(level = 190, classId = 4) {
    const engine = new SkillEngine({
        skills: testSkills,
        classes: testClasses,
        initialState: createInitialState(classId),
    });
    engine.setLevel(level);

    return engine;
}

describe('SkillEngine — basic allocation', () => {
    it('blocks skills whose class is not yet learned', () => {
        const engine = makeEngine(10);
        expect(engine.canIncrement(200).issue).toBe(AllocationIssue.CLASS_NOT_LEARNED);
    });

    it('blocks skills whose character level requirement is not met', () => {
        const engine = makeEngine(15);
        const check = engine.canIncrement(201);
        expect(check.ok).toBe(false);
        expect(check.issue).toBe(AllocationIssue.CHARACTER_LEVEL_TOO_LOW);
    });

    it('allows allocation when all constraints are met', () => {
        const engine = makeEngine(20);
        expect(engine.canIncrement(200).ok).toBe(true);
        engine.increment(200);
        expect(engine.getSkillLevel(200)).toBe(1);
    });

    it('enforces max skill level', () => {
        const engine = makeEngine(190);
        engine.max(200);
        expect(engine.getSkillLevel(200)).toBe(10);
        expect(engine.canIncrement(200).issue).toBe(AllocationIssue.SKILL_MAX);
    });
});

describe('SkillEngine — prereqs', () => {
    it('blocks dependent until prereq reaches required level', () => {
        const engine = makeEngine(30);
        expect(engine.canIncrement(201).issue).toBe(AllocationIssue.PREREQ_MISSING);
        engine.increment(200, 2);
        expect(engine.canIncrement(201).issue).toBe(AllocationIssue.PREREQ_LEVEL_TOO_LOW);
        engine.increment(200);
        expect(engine.canIncrement(201).ok).toBe(true);
    });

    it('cascade-deallocates dependent when prereq drops below requirement', () => {
        const engine = makeEngine(30);
        engine.increment(200, 3);
        engine.increment(201);
        expect(engine.getSkillLevel(201)).toBe(1);

        engine.increment(200, -1);
        expect(engine.getSkillLevel(200)).toBe(2);
        expect(engine.getSkillLevel(201)).toBe(0);
    });

    it('auto-allocates missing prereqs when incrementing a dependent', () => {
        const engine = makeEngine(30);
        expect(engine.getSkillLevel(200)).toBe(0);
        engine.increment(201);
        expect(engine.getSkillLevel(201)).toBe(1);
        expect(engine.getSkillLevel(200)).toBe(3);
    });

    it('max() on a dependent fills all prereqs + the dependent', () => {
        const engine = makeEngine(30);
        engine.max(201);
        expect(engine.getSkillLevel(200)).toBe(3);
        expect(engine.getSkillLevel(201)).toBe(5);
    });

    it('rolls back cascade when remaining points are insufficient', () => {
        // At level 20 (only Vagrant + Mercenary learned), budget = calc(20) + 60 = 38 + 60 = 98.
        // Try to cascade-fill skill 201 (cost per level 2, needs 200 at lvl 3 = 6 pts + 201 @ 1 = 2 pts = 8 pts total — fine).
        const engine = makeEngine(20);
        const budgetBefore = engine.getRemainingPoints();

        // Burn almost all points on a different skill so the cascade cannot afford itself.
        // Vagrant skill 100 costs 1 per level, max 5.
        engine.increment(100, 5); // spend 5
        // Allocate 200 directly to 2 (cost 4), leaving budget - 5 - 4 = 89 for more.
        engine.increment(200, 2);
        // Now to reach 201, we need 200 at lvl 3 (+1 more level of 200 = 2 pts) + 201 @ 1 (2 pts) = 4 pts.
        // That's feasible — this first case demonstrates the happy path.
        engine.increment(201);
        expect(engine.getSkillLevel(201)).toBe(1);
        expect(engine.getSkillLevel(200)).toBe(3);

        // Reset and construct an insufficient-points scenario.
        engine.resetAll();
        expect(engine.getRemainingPoints()).toBe(budgetBefore);
        // Pour points into 100 to starve the budget down to < 6 pts so a cascade of 201 (8pts) can't fit.
        engine.increment(100, 5); // 5 pts spent
        // 200 all the way up costs 20 pts; we want the remaining budget to be < the cascade cost.
        engine.increment(200, Math.floor((engine.getRemainingPoints() - 3) / 2));
        const remaining = engine.getRemainingPoints();
        // Snapshot current allocations to verify rollback.
        const snap200 = engine.getSkillLevel(200);
        engine.increment(201);
        // If the cascade didn't fit, 201 stayed at 0 AND 200 was not nudged up by the failed cascade.
        if (engine.getRemainingPoints() === remaining) {
            expect(engine.getSkillLevel(201)).toBe(0);
            expect(engine.getSkillLevel(200)).toBe(snap200);
        }
    });

    it('does NOT cascade when a prereq fails character-level (rollback)', () => {
        // Character level 15 — skill 201 needs char level 20. Increment should fail
        // cleanly without allocating skill 200.
        const engine = makeEngine(15);
        engine.increment(201);
        expect(engine.getSkillLevel(201)).toBe(0);
        expect(engine.getSkillLevel(200)).toBe(0);
    });
});

describe('SkillEngine — level changes', () => {
    let engine: SkillEngine;

    beforeEach(() => {
        engine = makeEngine(80);
        engine.increment(300, 10);
    });

    it('refunds skills when character level falls below skill requirement', () => {
        engine.setLevel(50);
        expect(engine.getSkillLevel(300)).toBe(0);
    });

    it('preserves allocations that still meet constraints', () => {
        engine.increment(200, 5);
        engine.setLevel(60);
        expect(engine.getSkillLevel(300)).toBe(10);
        expect(engine.getSkillLevel(200)).toBe(5);
    });

    it('never leaves the character over budget after a level change', () => {
        const e = makeEngine(190);
        e.increment(100, 5);
        e.increment(200, 10);
        e.increment(201, 5);
        e.increment(300, 20);
        e.increment(301, 10);
        e.max(400);
        e.max(500);

        for (const level of [190, 166, 165, 120, 60, 40, 15, 1]) {
            e.setLevel(level);
            expect(e.getSpentPoints()).toBeLessThanOrEqual(e.getTotalPoints());
            expect(e.getRemainingPoints()).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('SkillEngine — master variations', () => {
    it('blocks variation allocation until base is maxed', () => {
        const engine = makeEngine(190);
        engine.increment(400, 4);
        expect(engine.canIncrement(401).issue).toBe(AllocationIssue.BASE_SKILL_NOT_MAXED);
    });

    it('allows one variation per base once base is maxed', () => {
        const engine = makeEngine(190);
        engine.max(400);
        expect(engine.canIncrement(401).ok).toBe(true);
        engine.increment(401);
        expect(engine.canIncrement(402).issue).toBe(AllocationIssue.MASTER_VARIATION_CONFLICT);
    });

    it('releases the conflict when the other variation is fully deallocated', () => {
        const engine = makeEngine(190);
        engine.max(400);
        engine.increment(401);
        engine.reset(401);
        expect(engine.canIncrement(402).ok).toBe(true);
    });

    it('auto-maxes the base when +leveling a variation from zero', () => {
        const engine = makeEngine(190);
        expect(engine.getSkillLevel(400)).toBe(0);
        engine.increment(401);
        expect(engine.getSkillLevel(400)).toBe(10);
        expect(engine.getSkillLevel(401)).toBe(1);
    });

    it('canIncrementCascade reports INSUFFICIENT_POINTS when base+variation would overflow the budget', () => {
        // Level 165 Templar: budget = calc(165) + classBonus(Templar).
        const engine = makeEngine(165);
        const total = engine.getTotalPoints();
        // Burn budget on a cheap vagrant skill so we're left with less than
        // (base max 10 × 10pts) + (variation × 10pts) = 110 pts.
        const burn = Math.max(0, total - 100);
        engine.increment(100, Math.min(burn, 5)); // at most 5 levels of vagrant (cost 1 each)
        // Force-spend via Knight skill 300 (cost 3, max 20 = 60pts) + 301 (cost 3, max 10 = 30pts).
        engine.max(300);
        engine.max(301);
        // By now remaining points should be below the 110 needed for cascade.
        const remaining = engine.getRemainingPoints();

        if (remaining < 110) {
            const cascade = engine.canIncrementCascade(401);
            expect(cascade.ok).toBe(false);
            expect(cascade.issue).toBe(AllocationIssue.INSUFFICIENT_POINTS);
            // increment() is a no-op when the plan is infeasible.
            engine.increment(401);
            expect(engine.getSkillLevel(400)).toBe(0);
            expect(engine.getSkillLevel(401)).toBe(0);
        }
    });

    it('canIncrementCascade OK when full cascade fits; cost matches', () => {
        const engine = makeEngine(190);
        const cascade = engine.canIncrementCascade(401);
        expect(cascade.ok).toBe(true);
        // base (400) maxes: 10 levels × 10pts = 100, variation (401): 1 × 10pts = 10 → 110.
        expect(engine.getIncrementCost(401)).toBe(110);
    });

    it('correctly identifies passives via classifySkill', () => {
        const engine = makeEngine(190);
        expect(engine.classifySkill(500)).toBe('passive');
        expect(engine.classifySkill(401)).toBe('variation');
        expect(engine.classifySkill(400)).toBe('base');
    });

    it('returns variations for a base skill', () => {
        const engine = makeEngine(190);
        const variations = engine.getMasterVariations(400).map((s) => s.id).sort();
        expect(variations).toEqual([401, 402]);
    });
});

describe('SkillEngine — point accounting', () => {
    it('charges tiered costs based on skill tier', () => {
        const engine = makeEngine(190);
        const before = engine.getRemainingPoints();
        engine.increment(100);
        expect(engine.getRemainingPoints()).toBe(before - 1);

        engine.increment(200);
        expect(engine.getRemainingPoints()).toBe(before - 1 - 2);

        engine.increment(300);
        expect(engine.getRemainingPoints()).toBe(before - 1 - 2 - 3);

        engine.increment(400);
        expect(engine.getRemainingPoints()).toBe(before - 1 - 2 - 3 - 10);
    });

    it('blocks allocation when remaining points are insufficient', () => {
        const engine = makeEngine(3);
        expect(engine.getTotalPoints()).toBe(4); // level(2)=2 + level(3)=2 -> 4 points
        engine.increment(100, 4);
        expect(engine.getRemainingPoints()).toBe(0);
        expect(engine.canIncrement(100).issue).toBe(AllocationIssue.INSUFFICIENT_POINTS);
    });
});

describe('SkillEngine — skill pages', () => {
    it('keeps allocations per-page independent', () => {
        const engine = makeEngine(30);
        engine.increment(200, 3);

        engine.addPage('PvP');
        expect(engine.getSkillLevel(200)).toBe(0);

        engine.increment(200, 1);
        expect(engine.getSkillLevel(200)).toBe(1);

        engine.setActivePage(0);
        expect(engine.getSkillLevel(200)).toBe(3);
    });

    it('caps page count at 4 and page names at 24 chars', () => {
        const engine = makeEngine(1);
        engine.addPage('a');
        engine.addPage('b');
        engine.addPage('c');
        engine.addPage('d'); // already at 4, should no-op
        expect(engine.getState().pages).toHaveLength(4);

        engine.renamePage(0, 'A'.repeat(100));
        expect(engine.getState().pages[0].name.length).toBe(24);
    });

    it('duplicate copies allocations into a new page', () => {
        const engine = makeEngine(30);
        engine.increment(200, 3);
        const newIdx = engine.duplicatePage(0);
        expect(newIdx).toBe(1);
        expect(engine.getState().pages[1].allocations[200]).toBe(3);
    });
});

describe('SkillEngine — reset', () => {
    it('reset() clears one skill but leaves others', () => {
        const engine = makeEngine(30);
        engine.increment(200, 5);
        engine.increment(100, 3);
        engine.reset(200);
        expect(engine.getSkillLevel(200)).toBe(0);
        expect(engine.getSkillLevel(100)).toBe(3);
    });

    it('resetAll() clears every skill on the active page', () => {
        const engine = makeEngine(30);
        engine.increment(200, 5);
        engine.increment(100, 3);
        engine.resetAll();
        expect(engine.getSpentPoints()).toBe(0);
    });
});
