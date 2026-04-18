/**
 * Manual overrides for known API data bugs.
 *
 * The Flyff API sometimes marks passive skills as `passive: false`. Rather
 * than guess with a heuristic, we list the known-bad skill IDs here — once
 * reported and fixed upstream, this file can be deleted.
 *
 * Bug reported: 3rd-class conditional passives returning `passive: false` +
 * `treePosition: (0,0)` despite appearing in the game's Passive Skills panel.
 * Verified in-game for all entries below.
 */

/** Skill IDs to treat as passive regardless of what the API reports. */
export const FORCED_PASSIVE_SKILL_IDS = new Set<number>([
    21565, // Arcanist — Earthen Fortitude
    22764, // Mentalist — Enhanced Blinkpool
    23074, // Arcanist — Zephyr's Grace
    28870, // Harlequin — Agility
    29907, // Arcanist — Enhanced Blinkpool
]);

export function isForcedPassive(skillId: number): boolean {
    return FORCED_PASSIVE_SKILL_IDS.has(skillId);
}

/**
 * Pairs of skills that lock each other out. Allocating one prevents the other
 * from being allocated, regardless of tier or class. The game encodes these as
 * `lockedBy` in its internal data, but the public API does not expose it.
 *
 * Currently the only known 3rd-class independent pair (verified via a full
 * game-data sweep, excluding master-variation siblings) is:
 *   - Templar: Enhanced Physical Defense (22039) ↔ Enhanced Magical Defense (26116)
 *
 * Add more here as they're discovered. Master-variation conflicts are handled
 * by the variation logic — do NOT list those here.
 */
export const LOCKED_PAIRS: ReadonlyArray<readonly [number, number]> = [[22039, 26116]];

const LOCKED_BY_INDEX: ReadonlyMap<number, ReadonlySet<number>> = (() => {
    const map = new Map<number, Set<number>>();

    for (const [a, b] of LOCKED_PAIRS) {
        if (!map.has(a)) {
            map.set(a, new Set());
        }

        if (!map.has(b)) {
            map.set(b, new Set());
        }

        map.get(a)!.add(b);
        map.get(b)!.add(a);
    }

    return map;
})();

/** Returns the set of skill IDs that lock the given skill (i.e., if any of
 * these is allocated, the given skill is disabled). */
export function getLockingSkills(skillId: number): ReadonlySet<number> {
    return LOCKED_BY_INDEX.get(skillId) ?? EMPTY_SET;
}

const EMPTY_SET: ReadonlySet<number> = new Set();
