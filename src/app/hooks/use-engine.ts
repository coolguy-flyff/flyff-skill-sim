import { useEngineStore } from '../stores/engine-store';
import type { SkillEngine } from '@engine/engine';

/**
 * Returns the live engine + version counter. Components destructure what they
 * need; the version dependency ensures re-renders on every mutation without
 * paying for JSON-diff checks in the store.
 */
export function useEngine(): { engine: SkillEngine | null; version: number } {
    const engine = useEngineStore((s) => s.engine);
    const version = useEngineStore((s) => s.version);

    return { engine, version };
}
