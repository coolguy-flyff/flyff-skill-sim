import { THIRD_CLASS_NAMES, type ThirdClassName } from '@engine/constants';

export function slugifyClass(enName: string): string {
    return enName.toLowerCase();
}

export function deslugClass(slug: string): ThirdClassName | null {
    const lower = slug.toLowerCase();

    for (const name of THIRD_CLASS_NAMES) {
        if (name.toLowerCase() === lower) {
            return name;
        }
    }

    return null;
}
