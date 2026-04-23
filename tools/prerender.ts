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

function injectCriticalCss(html: string, css: string | null): string {
    if (!css) {
        return html;
    }

    // Insert just before </head> so the inlined chunk participates in the
    // cascade after Vite's main stylesheet link, but before any body content.
    const marker = '</head>';
    const idx = html.indexOf(marker);

    if (idx === -1) {
        throw new Error('Template has no </head> — cannot inject critical CSS');
    }

    const block = `<style data-critical="true">${css}</style>`;

    return `${html.slice(0, idx)}        ${block}\n    ${html.slice(idx)}`;
}

/**
 * The loading overlay that masks the React-hydration content swap. Sits over
 * the prerendered #root, animates an indeterminate progress bar, and is removed
 * by `main.tsx` once `loadFlyffData()` resolves (with a fade transition so the
 * underlying React render — which by then matches the prerendered DOM — is
 * revealed smoothly). Includes a `<noscript>` style override so JS-disabled
 * visitors see the prerendered content rather than a stuck overlay.
 *
 * Theme colors are inlined (Mantine vars aren't yet defined when this paints)
 * and `prefers-color-scheme` matches the existing meta theme-color values.
 */
const PRERENDER_OVERLAY = `
        <noscript><style>#prerender-loading-overlay { display: none !important; }</style></noscript>
        <style>
            @keyframes prerender-bar {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(350%); }
            }
            /* Lock body scroll while the overlay is mounted so React's
               post-hydration layout swap (LoadingScreen → real content)
               can't briefly make the document taller than the viewport
               and surface a vertical scrollbar. The :has() selector is
               supported in all evergreen browsers we target. */
            body:has(> #prerender-loading-overlay) { overflow: hidden; }
            #prerender-loading-overlay {
                position: fixed;
                inset: 0;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 1.25rem;
                background: #1A1B1E;
                color: #adb5bd;
                font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
                transition: opacity 250ms ease-out;
            }
            @media (prefers-color-scheme: light) {
                #prerender-loading-overlay { background: #ffffff; color: #495057; }
            }
            #prerender-loading-overlay .title {
                margin: 0;
                font-size: 1.0625rem;
                font-weight: 500;
                text-align: center;
                padding: 0 1rem;
            }
            #prerender-loading-overlay .subtitle {
                margin: 0;
                font-size: 0.875rem;
                font-weight: 400;
                opacity: 0.65;
                text-align: center;
            }
            #prerender-loading-overlay .bar {
                width: 240px;
                max-width: 60vw;
                height: 4px;
                background: rgba(127, 127, 127, 0.18);
                border-radius: 2px;
                overflow: hidden;
            }
            #prerender-loading-overlay .bar > span {
                display: block;
                width: 30%;
                height: 100%;
                background: #15aabf;
                border-radius: 2px;
                animation: prerender-bar 1.4s ease-in-out infinite;
            }
        </style>
        <div id="prerender-loading-overlay" role="status" aria-busy="true" aria-live="polite">
            <p class="title">Loading Skill Simulator for Flyff Universe…</p>
            <p class="subtitle">Please wait</p>
            <div class="bar"><span></span></div>
        </div>`;

function injectPrerenderOverlay(html: string): string {
    const marker = '<!-- prerender:overlay -->';
    const idx = html.indexOf(marker);

    if (idx === -1) {
        throw new Error('Template missing <!-- prerender:overlay --> marker');
    }

    return html.slice(0, idx) + PRERENDER_OVERLAY.trim() + html.slice(idx + marker.length);
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

/**
 * Inlines the on-disk (decompressed) byte sizes of the data JSONs as
 * `window.__FLYFF_SIZES`. The runtime fetch progress tracker divides by
 * these — Cloudflare Pages serves the files compressed, so the
 * `Content-Length` header doesn't match the decompressed bytes the stream
 * reader gives us. Pre-compressed sizes from disk are the right denominator.
 */
async function readDataSizes(): Promise<{ class: number; skill: number; params: number }> {
    const dataDir = path.join(DIST, 'data');
    const [classStat, skillStat, paramsStat] = await Promise.all([
        fsp.stat(path.join(dataDir, 'class.json')),
        fsp.stat(path.join(dataDir, 'skill.json')),
        fsp.stat(path.join(dataDir, 'parameter-labels.json')),
    ]);

    return { class: classStat.size, skill: skillStat.size, params: paramsStat.size };
}

function injectDataSizes(html: string, sizes: { class: number; skill: number; params: number }): string {
    const block = `<script>window.__FLYFF_SIZES=${JSON.stringify(sizes)}</script>`;
    const marker = '</head>';
    const idx = html.indexOf(marker);

    if (idx === -1) {
        throw new Error('Template has no </head> — cannot inject data sizes');
    }

    return `${html.slice(0, idx)}        ${block}\n    ${html.slice(idx)}`;
}

/**
 * Reads the contents of a Vite-built CSS chunk by filename prefix (the part
 * before the content hash). Vite emits e.g. `dist/assets/simulator-0dZn0s3a.css`
 * — the prefix `simulator` is stable across builds, the hash is not, so we glob
 * for the current one. Returns null if no match, which we treat as "this route
 * has no lazy-loaded CSS to inline".
 */
async function readCssChunk(prefix: string): Promise<string | null> {
    const assetsDir = path.join(DIST, 'assets');
    const entries = await fsp.readdir(assetsDir);
    const match = entries.find(
        (f) => f.startsWith(`${prefix}-`) && f.endsWith('.css'),
    );

    if (!match) {
        return null;
    }

    return fsp.readFile(path.join(assetsDir, match), 'utf-8');
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
        try {
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
        } catch (err) {
            // Surface page state on timeout — otherwise the puppeteer error is
            // opaque and we can't tell whether the app errored, the loader is
            // still showing, or hydration never happened.
            const debug = await page.evaluate(() => {
                const root = document.getElementById('root');
                const loaders = document.querySelectorAll('[class*="Loader-root"]').length;
                return {
                    rootChildren: root?.children.length ?? -1,
                    loaders,
                    bodyTextSample: document.body.innerText.slice(0, 200),
                };
            });
            console.error(`Wait timed out for ${url}:`, debug);
            console.error('Browser errors so far:', errors.join('\n  ') || '(none)');
            throw err;
        }

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
        const dataSizes = await readDataSizes();
        const page = await browser.newPage();
        const baseUrl = `http://${HOST}:${PORT}`;

        const criticalCssCache = new Map<string, string | null>();

        for (const route of ROUTES) {
            const url = `${baseUrl}${route.urlPath}`;
            const rootHtml = await captureRoot(page, url);

            let css: string | null = null;

            if (route.criticalCssChunk) {
                if (!criticalCssCache.has(route.criticalCssChunk)) {
                    criticalCssCache.set(
                        route.criticalCssChunk,
                        await readCssChunk(route.criticalCssChunk),
                    );
                }

                css = criticalCssCache.get(route.criticalCssChunk) ?? null;
            }

            const headed = injectDataSizes(injectCriticalCss(patchHead(template, route), css), dataSizes);
            const withOverlay = injectPrerenderOverlay(headed);
            const rendered = injectRoot(withOverlay, rootHtml);

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
