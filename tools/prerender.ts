/**
 * Post-build static site generator: boots a local static server with SPA
 * fallback against `dist/`, points headless Chromium at each route, captures
 * the fully-rendered `#root`, and writes per-route HTML files. Compared to a
 * simple head-only template swap, this also inlines real content into the
 * body — so non-JS crawlers and social-embed bots see something meaningful.
 *
 * Usage: yarn build (invoked automatically after `vite build`).
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { ROUTES, canonicalFor, type RouteMeta } from './seo-routes';
import { encodeState } from '../src/engine/serializer';
import { MAX_CHARACTER_LEVEL } from '../src/engine/constants';
import type { CharacterState } from '../src/engine/types';

interface MinimalClassRecord {
    id: number;
    name: { en: string };
}

const DIST = path.resolve(process.cwd(), 'dist');
const TEMPLATE = path.join(DIST, 'index.html');
const PORT = 4174;
const HOST = '127.0.0.1';
const NAV_TIMEOUT_MS = 30_000;
const MIN_ROOT_LENGTH = 64;

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
};

/**
 * Build a static file server with SPA fallback. The original Vite-built
 * `dist/index.html` is snapshot into memory at startup so that later writes
 * (our own per-route outputs) don't feed back into the server's response for
 * unknown paths — every SPA fallback serves the pristine template.
 */
async function startServer(): Promise<{ close: () => Promise<void> }> {
    const fallbackBody = await fsp.readFile(TEMPLATE);

    const handler = (req: IncomingMessage, res: ServerResponse) => {
        const urlPath = new URL(req.url ?? '/', `http://${HOST}`).pathname;
        const ext = path.extname(urlPath).toLowerCase();

        // Serve real files only for known static asset extensions. Any HTML
        // navigation — including route paths like `/c/templar` — falls back
        // to the SPA template so the client router can take over.
        if (ext && ext !== '.html' && MIME[ext]) {
            const filePath = path.join(DIST, urlPath);

            if (!filePath.startsWith(DIST)) {
                res.writeHead(403).end();
                return;
            }

            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                res.writeHead(200, { 'content-type': MIME[ext] });
                fs.createReadStream(filePath).pipe(res);
                return;
            }

            res.writeHead(404).end();
            return;
        }

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fallbackBody);
    };

    return new Promise((resolve, reject) => {
        const server = createServer(handler);
        server.once('error', reject);
        server.listen(PORT, HOST, () => {
            resolve({
                close: () =>
                    new Promise<void>((res, rej) => {
                        server.close((err) => (err ? rej(err) : res()));
                    }),
            });
        });
    });
}

function escapeHtmlAttr(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtmlText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHintsBlock(route: RouteMeta): string {
    const lines: string[] = [];

    for (const href of route.preloadImages) {
        lines.push(`<link rel="preload" as="image" href="${escapeHtmlAttr(href)}" />`);
    }

    for (const href of route.prefetchImages) {
        lines.push(`<link rel="prefetch" as="image" href="${escapeHtmlAttr(href)}" />`);
    }

    return lines.join('\n        ');
}

function patchHead(html: string, route: RouteMeta): string {
    const title = escapeHtmlText(route.title);
    const desc = escapeHtmlAttr(route.description);
    const url = escapeHtmlAttr(canonicalFor(route));
    const patches: Array<[RegExp, string]> = [
        [/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`],
        [
            /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
            `<meta name="description" content="${desc}" />`,
        ],
        [
            /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
            `<link rel="canonical" href="${url}" />`,
        ],
        [
            /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
            `<meta property="og:title" content="${title}" />`,
        ],
        [
            /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
            `<meta property="og:description" content="${desc}" />`,
        ],
        [
            /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/,
            `<meta property="og:url" content="${url}" />`,
        ],
        [
            /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/,
            `<meta name="twitter:title" content="${title}" />`,
        ],
        [
            /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/,
            `<meta name="twitter:description" content="${desc}" />`,
        ],
        [/<!-- prerender:hints -->/, buildHintsBlock(route)],
    ];

    let patched = html;

    for (const [pattern, replacement] of patches) {
        if (!pattern.test(patched)) {
            throw new Error(`Prerender pattern did not match template: ${pattern}`);
        }

        patched = patched.replace(pattern, replacement);
    }

    return patched;
}

function injectRoot(html: string, rootHtml: string): string {
    const pattern = /<div\s+id="root">\s*<\/div>/;

    if (!pattern.test(html)) {
        throw new Error('Template is missing <div id="root"></div>');
    }

    // Escape `$` in replacement so literal dollar signs in rendered HTML
    // aren't interpreted as regex back-references.
    return html.replace(pattern, () => rootHtml);
}

/**
 * Builds the URL that Puppeteer navigates to for a given route. Class-tree
 * routes get a fragment-identifier state-hash that hydrates the engine at
 * `MAX_CHARACTER_LEVEL` for the target third class. At that level the
 * simulator auto-selects the third-class tab (via `getCurrentTierClass`),
 * so the prerendered body contains the full class tree — not the default
 * tier-1 view a fresh engine would otherwise show.
 */
function buildNavUrl(
    baseUrl: string,
    route: RouteMeta,
    classesByEnName: Map<string, MinimalClassRecord>,
): string {
    const url = `${baseUrl}${route.urlPath}`;

    if (!route.urlPath.startsWith('/c/')) {
        return url;
    }

    const slug = route.urlPath.slice('/c/'.length);
    const record = [...classesByEnName.values()].find(
        (c) => c.name.en.toLowerCase() === slug,
    );

    if (!record) {
        throw new Error(`No class record matches slug '${slug}' in class.json`);
    }

    const state: CharacterState = {
        classId: record.id,
        level: MAX_CHARACTER_LEVEL,
        pages: [{ name: '', allocations: {} }],
        activePageIndex: 0,
    };

    return `${url}#${encodeState(state)}`;
}

/**
 * Extra disk locations the same rendered HTML should be written to so a route
 * resolves regardless of trailing-slash form. Class routes get mirrored from
 * `c/<slug>.html` to `c/<slug>/index.html` — both sirv and Cloudflare Pages
 * serve a flat `.html` for the no-slash URL, while `c/<slug>/index.html`
 * covers the trailing-slash URL without relying on host-specific slash
 * normalization. ~30KB per duplicate × 8 classes is negligible; canonical
 * tags consolidate the SEO signal on the no-slash form.
 */
function mirrorPaths(route: RouteMeta): string[] {
    if (!route.urlPath.startsWith('/c/')) {
        return [];
    }

    const slug = route.urlPath.slice('/c/'.length);

    return [`c/${slug}/index.html`];
}

async function loadClassIndex(): Promise<Map<string, MinimalClassRecord>> {
    const raw = await fsp.readFile(path.join(DIST, 'data/class.json'), 'utf-8');
    const records = JSON.parse(raw) as MinimalClassRecord[];
    const map = new Map<string, MinimalClassRecord>();

    for (const c of records) {
        map.set(c.name.en, c);
    }

    return map;
}

async function captureRoot(page: Page, url: string): Promise<string> {
    const errors: string[] = [];
    const onPageError = (err: unknown) => {
        errors.push(err instanceof Error ? err.message : String(err));
    };
    const onConsole = (msg: import('puppeteer').ConsoleMessage) => {
        if (msg.type() !== 'error') {
            return;
        }

        const url = msg.location().url ?? '';
        const text = msg.text();

        // Chromium auto-requests /favicon.ico; our static server returns 404
        // because there is no favicon. This isn't a real app error.
        if (url.endsWith('/favicon.ico') || text.includes('/favicon.ico')) {
            return;
        }

        errors.push(`${url ? `${url}: ` : ''}${text}`);
    };

    page.on('pageerror', onPageError);
    page.on('console', onConsole);

    try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT_MS });

        // Three signals have to be true before we capture:
        //   1. #root has rendered children (React mounted).
        //   2. No Mantine Loader is on screen — the app shows one while data
        //      fetches + engine initialization are still pending, and those
        //      complete AFTER networkidle0 because they're chained through
        //      useEffect re-renders.
        //   3. At least one icon element is present on non-home routes, so we
        //      don't capture a half-rendered tree.
        await page.waitForFunction(
            () => {
                const root = document.getElementById('root');

                if (!root || root.children.length === 0) {
                    return false;
                }

                const loader = document.querySelector('[class*="Loader-root"]');

                return loader === null;
            },
            { timeout: NAV_TIMEOUT_MS, polling: 50 },
        );

        // Small settle pass: Mantine/React can still flush one more paint after
        // the loader disappears (e.g. tree layout measuring phase). 250ms is
        // enough in practice without meaningfully slowing the build.
        await new Promise((r) => setTimeout(r, 250));

        const rootHtml = await page.$eval('#root', (el) => el.outerHTML);

        if (rootHtml.length < MIN_ROOT_LENGTH) {
            throw new Error(
                `Rendered root too small (${rootHtml.length} chars) for ${url}. ` +
                    `Browser errors: ${errors.join(' | ') || '(none)'}`,
            );
        }

        if (errors.length > 0) {
            console.warn(`  ⚠ ${url} rendered with browser errors:\n    ${errors.join('\n    ')}`);
        }

        return rootHtml;
    } finally {
        page.off('pageerror', onPageError);
        page.off('console', onConsole);
    }
}

async function main() {
    console.log(`Prerender starting (${ROUTES.length} routes)`);

    const server = await startServer();
    console.log(`  · static server up on http://${HOST}:${PORT}`);

    let browser: Browser | null = null;

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        console.log('  · headless Chromium launched');

        const template = await fsp.readFile(TEMPLATE, 'utf-8');
        const classesByEnName = await loadClassIndex();
        const page = await browser.newPage();
        const baseUrl = `http://${HOST}:${PORT}`;

        for (const route of ROUTES) {
            const url = buildNavUrl(baseUrl, route, classesByEnName);
            const rootHtml = await captureRoot(page, url);
            const rendered = injectRoot(patchHead(template, route), rootHtml);

            const targets = [route.outPath, ...mirrorPaths(route)];

            for (const rel of targets) {
                const outFile = path.join(DIST, rel);
                await fsp.mkdir(path.dirname(outFile), { recursive: true });
                await fsp.writeFile(outFile, rendered, 'utf-8');
            }

            console.log(
                `  → ${targets.join(' + ')}  (${rootHtml.length} chars rendered)`,
            );
        }

        await page.close();
        console.log('\nDone.');
    } finally {
        if (browser) {
            await browser.close();
        }

        await server.close();
    }
}

main().catch((err) => {
    console.error('Prerender failed:');
    console.error(err);
    process.exit(1);
});
