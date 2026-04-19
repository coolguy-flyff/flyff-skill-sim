import type { SkillRecord } from '@engine/types';

// --- Shared level data shapes, sourced from scraped skill.json. Exported so
// the tooltip renderer and the diff logic agree on field names. ---

export interface ScalingParam {
    parameter?: string;
    stat?: string;
    scale?: number;
    pve?: boolean;
    pvp?: boolean;
    part?: string;
    maximum?: number;
}

export interface AbilityEntry {
    parameter: string;
    add?: number;
    rate?: boolean;
    set?: number;
    attribute?: string;
    dotMode?: string;
    dotValue?: number;
    pve?: boolean;
    pvp?: boolean;
    skill?: number;
    skillLevel?: number;
}

export interface SynergyEntry {
    parameter: string;
    skill: number;
    minLevel: number;
    add: boolean;
    scale: number;
    pve?: boolean;
    pvp?: boolean;
}

export interface DamageMultEntry {
    multiplier?: number;
}

export interface LevelLike {
    consumedMP?: number;
    consumedFP?: number;
    cooldown?: number;
    casting?: number;
    duration?: number;
    durationPVP?: number;
    dotTick?: number;
    spellRange?: number;
    minAttack?: number;
    maxAttack?: number;
    probability?: number;
    probabilityPVP?: number;
    flyBackProbability?: number;
    damageMultiplier?: DamageMultEntry[];
    abilities?: AbilityEntry[];
    synergies?: SynergyEntry[];
    scalingParameters?: ScalingParam[];
}

function getLevels(skill: SkillRecord): LevelLike[] {
    return (skill as unknown as { levels?: LevelLike[] }).levels ?? [];
}

/**
 * True when `field` differs between `base` and `variation` at any level
 * index they share. Used to decide whether a scalar tooltip field (MP,
 * cooldown, damage, etc.) is "really" changed by the variation — a
 * variation that inherits base's exact scaling curve returns false here
 * even if the currently-displayed levels happen to show different values.
 *
 * Comparison is shallow (===) on primitives. `damageMultiplier` entries
 * are compared by their `multiplier` value.
 */
export function fieldChangesAcrossLevels(
    base: SkillRecord,
    variation: SkillRecord,
    field: keyof LevelLike,
): boolean {
    const baseLvls = getLevels(base);
    const varLvls = getLevels(variation);
    const lenMismatch = baseLvls.length !== varLvls.length;

    if (lenMismatch) {
        // Length differences already signal a structural change, so any field
        // where either side has a value at a level index the other doesn't
        // reach is considered changed.
        return true;
    }

    for (let i = 0; i < baseLvls.length; i++) {
        if (!shallowFieldEqual(baseLvls[i]?.[field], varLvls[i]?.[field])) {
            return true;
        }
    }

    return false;
}

function shallowFieldEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }

    if (a === undefined || b === undefined) {
        return false;
    }

    // damageMultiplier is an array of { multiplier } — compare the first
    // multiplier value (all scraped samples have a single entry).
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }

        const aFirst = a[0] as { multiplier?: number } | undefined;
        const bFirst = b[0] as { multiplier?: number } | undefined;

        return aFirst?.multiplier === bFirst?.multiplier;
    }

    return false;
}

/**
 * Compares two lists of entries by an identity key, returning partitioned
 * sets: `unchanged` (same identity + deep-equal content), `modified` (same
 * identity, different content — variation's version is returned), `added`
 * (variation-only), `removed` (base-only). Used for abilities, synergies,
 * and scalings at the displayed level pair.
 */
export function diffEntries<T>(
    baseEntries: T[],
    variationEntries: T[],
    identityKey: (e: T) => string,
): {
    unchanged: T[];
    modified: T[];
    added: T[];
    removed: T[];
} {
    const baseMap = new Map<string, T>();
    const varMap = new Map<string, T>();

    for (const e of baseEntries) {
        baseMap.set(identityKey(e), e);
    }

    for (const e of variationEntries) {
        varMap.set(identityKey(e), e);
    }

    const unchanged: T[] = [];
    const modified: T[] = [];
    const added: T[] = [];
    const removed: T[] = [];

    for (const [key, varEntry] of varMap) {
        const baseEntry = baseMap.get(key);

        if (baseEntry === undefined) {
            added.push(varEntry);
            continue;
        }

        if (deepEqual(baseEntry, varEntry)) {
            unchanged.push(baseEntry);
        } else {
            modified.push(varEntry);
        }
    }

    for (const [key, baseEntry] of baseMap) {
        if (!varMap.has(key)) {
            removed.push(baseEntry);
        }
    }

    console.log('Modified:', baseEntries, variationEntries, modified);

    return { unchanged, modified, added, removed };
}

/** Minimal deep-equal for the plain data objects we diff (primitives +
 *  arrays + plain objects, no cycles). */
export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }

    if (typeof a !== typeof b) {
        return false;
    }

    if (a === null || b === null) {
        return false;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }

        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) {
                return false;
            }
        }

        return true;
    }

    if (typeof a === 'object' && typeof b === 'object') {
        const aKeys = Object.keys(a as object);
        const bKeys = Object.keys(b as object);

        if (aKeys.length !== bKeys.length) {
            return false;
        }

        for (const k of aKeys) {
            if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
                return false;
            }
        }

        return true;
    }

    return false;
}

// --- Identity-key builders: stable strings that identify an "entry" so we
// can match base vs. variation copies even when inner values drift. ---

export function abilityIdentityKey(a: AbilityEntry): string {
    // pve/pvp scope matters because Stonehand's skillchance splits into two
    // entries with the same parameter+skill but different scopes.
    return [
        a.parameter,
        a.attribute ?? '',
        a.skill ?? '',
        a.pve === false ? '0' : '1',
        a.pvp === false ? '0' : '1',
    ].join('|');
}

export function synergyIdentityKey(s: SynergyEntry): string {
    return `${s.skill}|${s.parameter}`;
}

export function scalingIdentityKey(sc: ScalingParam): string {
    return [sc.parameter ?? '', sc.stat ?? '', sc.part ?? ''].join('|');
}
