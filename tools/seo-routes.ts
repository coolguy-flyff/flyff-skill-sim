/**
 * Per-route SEO metadata consumed by the build-time prerender. Each entry
 * becomes its own `dist/<outPath>` HTML file with a route-specific <head>,
 * so crawlers and social-embed bots see distinct titles / descriptions /
 * canonicals without needing JS to execute.
 *
 * `preloadImages` / `prefetchImages` drive resource hints injected at the
 * `<!-- prerender:hints -->` marker:
 *   - `preload` → high priority, fetch now (visible on this route).
 *   - `prefetch` → low priority, fetch when idle (likely needed soon).
 */
import { THIRD_CLASS_NAMES } from '../src/engine/constants';

export const SITE_URL = 'https://flyff-skill-sim.pages.dev';

export interface RouteMeta {
    /** URL path (used for canonical + og:url). */
    urlPath: string;
    /** Path under `dist/` where the rendered file is written. */
    outPath: string;
    title: string;
    description: string;
    preloadImages: ReadonlyArray<string>;
    prefetchImages: ReadonlyArray<string>;
}

const CLASS_SPRITE = '/data/class.png';
const SKILL_SPRITE = '/data/skill.png';

function canonical(urlPath: string): string {
    return `${SITE_URL}${urlPath}`;
}

const HOME: RouteMeta = {
    urlPath: '/',
    outPath: 'index.html',
    title: 'Skill Simulator for Flyff Universe — Plan Your Build',
    description:
        'Plan your Flyff Universe build across every 1st, 2nd, and 3rd class tree. Master variations, level-gated skill point budgeting, and shareable build URLs.',
    // Home shows the class grid immediately; skill sprite is only needed after
    // the user drills into a class, so prefetch keeps it idle-priority.
    preloadImages: [CLASS_SPRITE],
    prefetchImages: [SKILL_SPRITE],
};

function classRoute(className: string): RouteMeta {
    const slug = className.toLowerCase();

    return {
        urlPath: `/c/${slug}`,
        // Emit `c/<slug>.html` rather than `c/<slug>/index.html` so the no-
        // trailing-slash URL serves the prerendered file directly. Both sirv
        // (vite preview, default `extensions: ['html', 'htm']`) and Cloudflare
        // Pages auto-resolve `.html` for extensionless requests, avoiding the
        // 308-redirect-to-trailing-slash dance that an `/index.html` layout
        // would trigger.
        outPath: `c/${slug}.html`,
        title: `${className} Build Planner — Skill Simulator for Flyff Universe`,
        description: `Plan your ${className} build in Flyff Universe. Allocate skills across the full class tree with master variations, shareable URLs, and level-gated SP budgeting.`,
        // Class pages paint both sprites on first render.
        preloadImages: [CLASS_SPRITE, SKILL_SPRITE],
        prefetchImages: [],
    };
}

export const ROUTES: ReadonlyArray<RouteMeta> = [HOME, ...THIRD_CLASS_NAMES.map(classRoute)];

export function canonicalFor(route: RouteMeta): string {
    return canonical(route.urlPath);
}
