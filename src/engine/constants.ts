import type { ClassTier } from './types';

/** Character level cap. Treat as a constant that moves between major patches. */
export const MAX_CHARACTER_LEVEL = 190;

/** Per-tier skill-point cost per skill level. */
export const POINT_COSTS: Record<ClassTier, number> = {
    vagrant: 1,
    first: 2,
    second: 3,
    third: 10,
};

export const MAX_SKILL_PAGES = 4;
export const SKILL_PAGE_NAME_MAX_LENGTH = 24;

/**
 * Cumulative extra skill points awarded by class-change for each class in a chain.
 * These are looked up by the character's *current* class (based on level),
 * not by the 3rd-class endpoint — so the values are inclusive of ancestors.
 *
 * Sourced from init.md spec.
 */
export const CLASS_BONUSES: Record<string, number> = {
    Vagrant: 0,
    Mercenary: 60,
    Acrobat: 50,
    Assist: 60,
    Magician: 90,
    Knight: 140,
    Blade: 140,
    Ranger: 150,
    Jester: 150,
    Ringmaster: 160,
    Billposter: 180,
    Psykeeper: 180,
    Elementor: 390,
    Templar: 270,
    Slayer: 370,
    Harlequin: 350,
    Crackshooter: 400,
    Seraph: 560,
    Forcemaster: 600,
    Mentalist: 480,
    Arcanist: 1190,
};

/** The 8 3rd-class entry points used on the home page class picker. */
export const THIRD_CLASS_NAMES = [
    'Templar',
    'Slayer',
    'Crackshooter',
    'Harlequin',
    'Seraph',
    'Forcemaster',
    'Mentalist',
    'Arcanist',
] as const;

export type ThirdClassName = (typeof THIRD_CLASS_NAMES)[number];
