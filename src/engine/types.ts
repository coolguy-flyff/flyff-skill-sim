/**
 * Minimal shapes the engine depends on. The scraper's JSON output is a superset;
 * anything not referenced here is ignored by the engine (but available to the UI).
 */

export type LangCode = 'en' | string;

export type I18nString = {
    en: string;
    [lang: string]: string | undefined;
};

export type ClassTier = 'vagrant' | 'first' | 'second' | 'third';

export interface ClassRecord {
    id: number;
    name: I18nString;
    type: string;
    parent: number | null;
    icon: string;
    tree?: string;
    minLevel: number;
    maxLevel: number;
}

export interface SkillRequirement {
    skill: number;
    level: number;
}

export interface SkillRecord {
    id: number;
    name: I18nString;
    description: I18nString;
    icon: string;
    class: number;
    level: number;
    /** Per-level skill-point cost. Matches the tier cost (1/2/3/10). NOT the max level. */
    skillPoints: number;
    /** Per-level stats. `levels.length` is the authoritative max allocatable level. */
    levels?: Array<Record<string, unknown>>;
    passive?: boolean;
    treePosition?: { x: number; y: number };
    requirements?: SkillRequirement[];
    /** IDs of this skill's master variations (3rd class, API v1.9.0+). */
    masterVariations?: number[];
    /** ID of the base skill this variation inherits from (3rd class, API v1.9.0+). */
    inheritSkill?: number;
    [extra: string]: unknown;
}

export interface SkillPage {
    name: string;
    allocations: Record<number, number>;
}

export interface CharacterState {
    classId: number;
    level: number;
    pages: SkillPage[];
    activePageIndex: number;
}

export enum AllocationIssue {
    OK = 'OK',
    CLASS_NOT_LEARNED = 'CLASS_NOT_LEARNED',
    CHARACTER_LEVEL_TOO_LOW = 'CHARACTER_LEVEL_TOO_LOW',
    SKILL_MAX = 'SKILL_MAX',
    SKILL_MIN = 'SKILL_MIN',
    INSUFFICIENT_POINTS = 'INSUFFICIENT_POINTS',
    PREREQ_MISSING = 'PREREQ_MISSING',
    PREREQ_LEVEL_TOO_LOW = 'PREREQ_LEVEL_TOO_LOW',
    MASTER_VARIATION_CONFLICT = 'MASTER_VARIATION_CONFLICT',
    BASE_SKILL_NOT_MAXED = 'BASE_SKILL_NOT_MAXED',
    LOCKED_BY_OTHER_SKILL = 'LOCKED_BY_OTHER_SKILL',
    UNKNOWN_SKILL = 'UNKNOWN_SKILL',
}

export interface AllocationResult {
    ok: boolean;
    issue: AllocationIssue;
    /** Skills that would cascade-deallocate as a side effect (e.g., dependents). */
    cascade?: number[];
}
