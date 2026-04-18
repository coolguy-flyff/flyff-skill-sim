import type { ClassRecord, SkillRecord, I18nString } from '../types';

function name(en: string): I18nString {
    return { en };
}

/**
 * Pads a skill with a `levels` array of the given length so the engine's
 * `getSkillMaxLevel` reads the correct cap. Each entry is an empty stub —
 * tests don't care about per-level stats.
 */
function levels(n: number): Array<Record<string, unknown>> {
    return Array.from({ length: n }, () => ({}));
}

/**
 * Minimal 4-tier class chain: Vagrant → Mercenary → Knight → Templar.
 * Classes are id-stable so tests can reference them directly.
 */
export const testClasses: ClassRecord[] = [
    { id: 1, name: name('Vagrant'), type: 'beginner', parent: null, icon: 'vagrant.png', minLevel: 1, maxLevel: 15 },
    { id: 2, name: name('Mercenary'), type: 'expert', parent: 1, icon: 'merc.png', minLevel: 15, maxLevel: 60 },
    { id: 3, name: name('Knight'), type: 'expert', parent: 2, icon: 'knight.png', minLevel: 60, maxLevel: 120 },
    { id: 4, name: name('Templar'), type: '', parent: 3, icon: 'templar.png', minLevel: 165, maxLevel: 190 },
];

/**
 * Skill fixtures cover every pattern the engine cares about:
 *   - plain base skills (100, 200, 300, 400)
 *   - prereq chain (200 → 201, 300 → 301)
 *   - master variations (401, 402 → base 400)
 *   - 3rd-class passive (500)
 *
 * `skillPoints` is the per-level COST (matches the tier in real data);
 * `levels.length` is the real max — what the engine reads via getSkillMaxLevel.
 */
export const testSkills: SkillRecord[] = [
    {
        id: 100,
        name: name('Basic Swing'),
        description: name('Vagrant starter'),
        icon: 'swing.png',
        class: 1,
        level: 1,
        skillPoints: 1,
        levels: levels(5),
        treePosition: { x: 10, y: 10 },
    },
    {
        id: 200,
        name: name('Power Strike'),
        description: name('Mercenary damage'),
        icon: 'power.png',
        class: 2,
        level: 15,
        skillPoints: 2,
        levels: levels(10),
        treePosition: { x: 10, y: 10 },
    },
    {
        id: 201,
        name: name('Follow-Up'),
        description: name('needs Power Strike'),
        icon: 'follow.png',
        class: 2,
        level: 20,
        skillPoints: 2,
        levels: levels(5),
        treePosition: { x: 60, y: 10 },
        requirements: [{ skill: 200, level: 3 }],
    },
    {
        id: 300,
        name: name('Iron Guard'),
        description: name('Knight tank'),
        icon: 'guard.png',
        class: 3,
        level: 60,
        skillPoints: 3,
        levels: levels(20),
        treePosition: { x: 10, y: 10 },
    },
    {
        id: 301,
        name: name('Riposte'),
        description: name('needs Iron Guard'),
        icon: 'riposte.png',
        class: 3,
        level: 80,
        skillPoints: 3,
        levels: levels(10),
        treePosition: { x: 60, y: 10 },
        requirements: [{ skill: 300, level: 5 }],
    },
    {
        id: 400,
        name: name('Divine Strike'),
        description: name('Templar base'),
        icon: 'divine.png',
        class: 4,
        level: 165,
        skillPoints: 10,
        levels: levels(10),
        treePosition: { x: 50, y: 50 },
        masterVariations: [401, 402],
    },
    {
        id: 401,
        name: name('Divine Strike (Crit)'),
        description: name('variation'),
        icon: 'divine.png',
        class: 4,
        level: 166,
        skillPoints: 10,
        levels: levels(5),
        treePosition: { x: 0, y: 0 },
        requirements: [{ skill: 400, level: 5 }],
        inheritSkill: 400,
    },
    {
        id: 402,
        name: name('Divine Strike (Burn)'),
        description: name('variation'),
        icon: 'divine.png',
        class: 4,
        level: 166,
        skillPoints: 10,
        levels: levels(5),
        treePosition: { x: 0, y: 0 },
        requirements: [{ skill: 400, level: 5 }],
        inheritSkill: 400,
    },
    {
        id: 500,
        name: name('Passive Aura'),
        description: name('Templar passive'),
        icon: 'aura.png',
        class: 4,
        level: 170,
        skillPoints: 10,
        levels: levels(10),
        passive: true,
        treePosition: { x: 0, y: 0 },
    },
];
