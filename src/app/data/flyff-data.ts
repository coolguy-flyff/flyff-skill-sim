import type { ClassRecord, SkillRecord, I18nString } from '@engine/types';

export interface FlyffData {
    classes: ClassRecord[];
    skills: SkillRecord[];
    classesById: Map<number, ClassRecord>;
    classesByEnName: Map<string, ClassRecord>;
    skillsById: Map<number, SkillRecord>;
    /** API-sourced display labels for ability/scaling/synergy `parameter`
     *  strings, keyed by the lowercase parameter name. Each entry holds every
     *  locale the API returns (same shape as `I18nString`). */
    parameterLabels: Record<string, I18nString>;
}

let cached: Promise<FlyffData> | null = null;

/** Lazily loads and memoizes the scraped game data. */
export function loadFlyffData(): Promise<FlyffData> {
    if (cached) {
        return cached;
    }

    cached = (async () => {
        const [classesRes, skillsRes, paramsRes] = await Promise.all([
            fetch('/data/class.json'),
            fetch('/data/skill.json'),
            fetch('/data/parameter-labels.json'),
        ]);

        if (!classesRes.ok || !skillsRes.ok || !paramsRes.ok) {
            throw new Error('Failed to load Flyff data');
        }

        const [classes, skills, parameterLabels] = (await Promise.all([
            classesRes.json(),
            skillsRes.json(),
            paramsRes.json(),
        ])) as [ClassRecord[], SkillRecord[], Record<string, I18nString>];

        return {
            classes,
            skills,
            classesById: new Map(classes.map((c) => [c.id, c])),
            classesByEnName: new Map(classes.map((c) => [c.name.en, c])),
            skillsById: new Map(skills.map((s) => [s.id, s])),
            parameterLabels,
        };
    })();

    return cached;
}
