import { create } from 'zustand';
import { SkillEngine, createInitialState } from '@engine/engine';
import type { CharacterState } from '@engine/types';
import type { FlyffData } from '../data/flyff-data';

interface EngineStoreState {
    engine: SkillEngine | null;
    state: CharacterState | null;
    /** Monotonic version counter — bumped on every engine mutation to trigger re-renders. */
    version: number;
}

interface EngineStoreActions {
    initEngine: (data: FlyffData, classId: number, initialState?: CharacterState) => void;
    hydrateFromState: (data: FlyffData, classId: number, initialState: CharacterState) => void;
    setLevel: (level: number) => void;
    increment: (skillId: number, delta?: number) => void;
    max: (skillId: number) => void;
    reset: (skillId: number) => void;
    resetAll: () => void;
    addPage: (name?: string) => void;
    removePage: (index: number) => void;
    renamePage: (index: number, name: string) => void;
    setActivePage: (index: number) => void;
    duplicatePage: (index: number) => void;
}

export type EngineStore = EngineStoreState & EngineStoreActions;

/**
 * Centralized store that owns a SkillEngine instance. Components consume derived
 * slices via selectors. All mutations funnel through the engine (which runs its
 * own refit) and then bump `version` so Zustand broadcasts to subscribers.
 */
export const useEngineStore = create<EngineStore>((set, get) => {
    const bump = () => {
        const e = get().engine;

        if (e) {
            set({ state: e.getState(), version: get().version + 1 });
        }
    };

    return {
        engine: null,
        state: null,
        version: 0,

        initEngine: (data, classId, initialState) => {
            const engine = new SkillEngine({
                skills: data.skills,
                classes: data.classes,
                initialState: initialState ?? createInitialState(classId),
            });
            set({ engine, state: engine.getState(), version: get().version + 1 });
        },

        hydrateFromState: (data, classId, initialState) => {
            const engine = new SkillEngine({
                skills: data.skills,
                classes: data.classes,
                initialState,
            });

            if (initialState.classId !== classId) {
                engine.setClass(classId);
            }

            set({ engine, state: engine.getState(), version: get().version + 1 });
        },

        setLevel: (level) => {
            get().engine?.setLevel(level);
            bump();
        },
        increment: (skillId, delta = 1) => {
            get().engine?.increment(skillId, delta);
            bump();
        },
        max: (skillId) => {
            get().engine?.max(skillId);
            bump();
        },
        reset: (skillId) => {
            get().engine?.reset(skillId);
            bump();
        },
        resetAll: () => {
            get().engine?.resetAll();
            bump();
        },
        addPage: (name) => {
            get().engine?.addPage(name);
            bump();
        },
        removePage: (index) => {
            get().engine?.removePage(index);
            bump();
        },
        renamePage: (index, name) => {
            get().engine?.renamePage(index, name);
            bump();
        },
        setActivePage: (index) => {
            get().engine?.setActivePage(index);
            bump();
        },
        duplicatePage: (index) => {
            get().engine?.duplicatePage(index);
            bump();
        },
    };
});
