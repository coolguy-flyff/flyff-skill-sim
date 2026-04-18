import { CLASS_BONUSES, MAX_CHARACTER_LEVEL } from './constants';
import type { ClassRecord } from './types';

/**
 * Skill points earned from character level alone. Level 1 = 0 points
 * (character starts at lvl 1 with nothing), then tiered per-level grants.
 * Source: init.md spec.
 */
export function calculateLevelPoints(level: number): number {
    const l = Math.max(1, Math.min(level, MAX_CHARACTER_LEVEL));
    const clamp = (low: number, high: number) => Math.min(Math.max(l - low, 0), high - low);

    return (
        clamp(1, 20) * 2 +
        clamp(20, 40) * 3 +
        clamp(40, 60) * 4 +
        clamp(60, 80) * 5 +
        clamp(80, 100) * 6 +
        clamp(100, 120) * 7 +
        clamp(120, 140) * 8 +
        clamp(140, 150) * 1 +
        clamp(150, 166) * 2 +
        clamp(166, 190) * 10
    );
}

/**
 * The class-change bonus for the player's *current* class. Chains are pre-walked
 * so the caller passes the already-resolved current class.
 */
export function getClassBonus(className: string): number {
    return CLASS_BONUSES[className] ?? 0;
}

/**
 * Total skill points the character has earned at this level, given their current
 * class in the chain. The second arg is the class matching the character's level
 * (the "visible" class in-game), not necessarily the 3rd class the user picked.
 */
export function getTotalPoints(level: number, currentClass: ClassRecord | undefined): number {
    const levelPts = calculateLevelPoints(level);
    const classBonus = currentClass ? getClassBonus(currentClass.name.en) : 0;

    return levelPts + classBonus;
}
