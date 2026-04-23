/**
 * Scrapes skills + classes from the Flyff Universe API and writes output to
 * public/data so Vite serves it statically.
 *
 * Usage: yarn scrape
 */
import axios, { type AxiosRequestConfig } from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Jimp } from 'jimp';

const API_BASE = 'https://api.flyff.com';
const OUT_DIR = path.resolve(process.cwd(), 'public/data');
const BATCH_SIZE = 200;
const IMAGE_MAX_RETRIES = 10;

interface I18nString {
    en: string;
    [lang: string]: string | undefined;
}

interface ClassRecord {
    id: number;
    name: I18nString;
    type: string;
    tree?: string;
    parent: number | null;
    icon: string;
    minLevel: number;
    maxLevel: number;
    [k: string]: unknown;
}

interface SkillRecord {
    id: number;
    name: I18nString;
    description: I18nString;
    icon: string;
    class: number;
    level: number;
    treePosition?: { x: number; y: number };
    requirements?: Array<{ skill: number; level: number }>;
    passive?: boolean;
    skillPoints: number;
    levels?: Array<{
        scalingParameters?: Array<{ parameter?: string; stat?: string }>;
        abilities?: Array<{ parameter?: string }>;
        synergies?: Array<{ parameter?: string }>;
        [k: string]: unknown;
    }>;
    [k: string]: unknown;
}

async function apiGet<T = unknown>(relPath: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await axios.get(`${API_BASE}/${relPath}`, config);

    return res.data as T;
}

async function ensureDir() {
    await fs.mkdir(OUT_DIR, { recursive: true });
}

async function save(filename: string, data: unknown) {
    const filePath = path.join(OUT_DIR, filename);
    await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
    console.log(`  → wrote ${path.relative(process.cwd(), filePath)} (${((JSON.stringify(data).length / 1024) | 0)} KB)`);
}

function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * Walks every scraped skill and collects the unique `parameter` strings from
 * scalingParameters, abilities, synergies, plus any non-core `stat` values
 * that scaling rows reference (e.g. "disableeffect"). Core stats `str`, `sta`,
 * `dex`, `int` are included too so the Flyff API translations drive every
 * tooltip label without hand-curation.
 */
function collectParameterNames(skills: SkillRecord[]): string[] {
    const names = new Set<string>();

    for (const s of skills) {
        for (const lv of s.levels ?? []) {
            for (const sc of lv.scalingParameters ?? []) {
                if (sc.parameter) {
                    names.add(sc.parameter);
                }

                if (sc.stat) {
                    names.add(sc.stat);
                }
            }

            for (const a of lv.abilities ?? []) {
                if (a.parameter) {
                    names.add(a.parameter);
                }
            }

            for (const sy of lv.synergies ?? []) {
                if (sy.parameter) {
                    names.add(sy.parameter);
                }
            }
        }
    }

    return [...names].sort();
}

/**
 * Fetches `/language/parameter/<name,name,...>` for every unique parameter
 * string in the scraped data. The endpoint accepts a comma-delimited list and
 * returns an array of per-locale objects in the same order. Unknown parameter
 * names are skipped (the API returns 404 on unknowns — we retry in smaller
 * batches down to singles so a single bad name doesn't poison a whole batch).
 */
async function downloadParameterLabels(names: string[]): Promise<Record<string, I18nString>> {
    const result: Record<string, I18nString> = {};
    const BATCH = 80;

    async function fetchBatch(batch: string[]): Promise<void> {
        if (batch.length === 0) {
            return;
        }

        try {
            const res = await apiGet<I18nString | I18nString[]>(`language/parameter/${batch.join(',')}`);
            const arr = Array.isArray(res) ? res : [res];

            for (let i = 0; i < batch.length; i++) {
                const entry = arr[i];

                if (entry && typeof entry === 'object') {
                    result[batch[i]] = entry;
                }
            }
        } catch {
            // A 404 on any name fails the whole batch — fall back to halves,
            // then singles, so unknown names are dropped silently.
            if (batch.length === 1) {
                console.warn(`  !! parameter not found: ${batch[0]}`);
                return;
            }

            const mid = Math.floor(batch.length / 2);
            await fetchBatch(batch.slice(0, mid));
            await fetchBatch(batch.slice(mid));
        }
    }

    for (let i = 0; i < names.length; i += BATCH) {
        await fetchBatch(names.slice(i, i + BATCH));
        console.log(`  · parameter labels: ${Object.keys(result).length}/${names.length}`);
    }

    return result;
}

/**
 * The Flyff client rescaled the `magicattack` rate parameter so that values
 * are stored at 10× the displayed percentage. The public API still emits the
 * pre-rescale numbers, so e.g. Kyrie Eleison level 5 reports +80% magic atk
 * when the in-game tooltip shows +8%. Divide every `magicattack` rate ability
 * by 10 to match what players actually see. Remove this once the API catches
 * up.
 */
function normalizeMagicAttackScale(skills: SkillRecord[]) {
    let patched = 0;

    for (const s of skills) {
        for (const lv of s.levels ?? []) {
            for (const a of (lv.abilities ?? []) as Array<Record<string, unknown>>) {
                if (a.parameter === 'magicattack' && a.rate === true && typeof a.add === 'number') {
                    a.add = (a.add as number) / 10;
                    patched++;
                }
            }
        }
    }

    console.log(`  · normalized ${patched} magicattack rate values (÷10)`);
}

async function downloadMany<T>(endpoint: string): Promise<T[]> {
    const ids = await apiGet<number[]>(endpoint);
    const all: T[] = [];

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const slice = ids.slice(i, i + BATCH_SIZE).join(',');
        const batch = await apiGet<T[]>(`${endpoint}/${slice}`);
        all.push(...batch);
        console.log(`  · ${endpoint}: ${all.length}/${ids.length}`);
    }

    return all;
}

async function downloadImage(
    imgPath: string,
    retry = 0,
): Promise<InstanceType<typeof Jimp>> {
    try {
        const data = await apiGet<ArrayBuffer>(imgPath, { responseType: 'arraybuffer' });

        return (await Jimp.fromBuffer(data)) as InstanceType<typeof Jimp>;
    } catch (err) {
        if (retry >= IMAGE_MAX_RETRIES) {
            console.warn(`  !! image failed after retries: ${imgPath}`);
            return new Jimp({ width: 1, height: 1 });
        }

        await sleep(Math.floor(1000 + Math.random() * 1000));
        return downloadImage(imgPath, retry + 1);
    }
}

/**
 * Downloads every icon in `icons`, composes them into a square-ish sprite sheet,
 * writes `{outName}.png` + `{outName}.css` (the CSS maps icon filename → offset).
 */
async function downloadIconMap(icons: string[], prefix: string, outName: string) {
    const unique = [...new Set(icons)].filter(Boolean);
    console.log(`  sprite: fetching ${unique.length} icons for '${outName}'`);

    const images = await Promise.all(unique.map((name) => downloadImage(`${prefix}${name}`)));

    const perRow = Math.ceil(Math.sqrt(unique.length));
    const rows: Array<Array<{ name: string; image: InstanceType<typeof Jimp> }>> = [];

    for (let r = 0; r * perRow < unique.length; r++) {
        const row: Array<{ name: string; image: InstanceType<typeof Jimp> }> = [];

        for (let c = 0; c < perRow; c++) {
            const idx = r * perRow + c;

            if (idx < unique.length) {
                row.push({ name: unique[idx], image: images[idx] });
            }
        }

        rows.push(row);
    }

    const rowDims = rows.map((row) =>
        row.reduce<[number, number]>(
            ([w, h], cell) => [w + cell.image.width, Math.max(h, cell.image.height)],
            [0, 0],
        ),
    );

    const [mapW, mapH] = rowDims.reduce<[number, number]>(
        ([mw, th], [w, h]) => [Math.max(mw, w), th + h],
        [0, 0],
    );

    const sheet = new Jimp({ width: mapW, height: mapH });
    let css = `.${outName}-icon {
    --width: var(--icon-width);
    --height: var(--icon-height);
    --scale-x: calc(var(--width) / var(--icon-width));
    --scale-y: calc(var(--height) / var(--icon-height));
    background-size: calc(${mapW}px * var(--scale-x)) calc(${mapH}px * var(--scale-y));
    background-position: calc(1px * var(--icon-offset-x) * var(--scale-x)) calc(1px * var(--icon-offset-y) * var(--scale-y));
}

`;
    let y = 0;

    for (let r = 0; r < rows.length; r++) {
        let x = 0;

        for (const cell of rows[r]) {
            sheet.blit({ src: cell.image, x, y });
            css += `.${outName}-icon[data-icon="${cell.name}"] {
    --icon-width: ${cell.image.width};
    --icon-height: ${cell.image.height};
    --icon-offset-x: ${-x};
    --icon-offset-y: ${-y};
}

`;
            x += cell.image.width;
        }

        y += rowDims[r][1];
    }

    await sheet.write(path.join(OUT_DIR, `${outName}.png`) as `${string}.png`);
    await fs.writeFile(path.join(OUT_DIR, `${outName}.css`), css, 'utf-8');
    console.log(`  → wrote ${outName}.png (${mapW}×${mapH}) + ${outName}.css`);
}

/**
 * Walks the class tree and keeps only classes reachable from Vagrant (depth 0-3).
 * Drops system/hidden classes the skill sim doesn't use.
 */
function filterUsableClasses(classes: ClassRecord[]): Set<number> {
    const byId = new Map(classes.map((c) => [c.id, c]));
    const roots = classes.filter((c) => c.parent === null || c.parent === undefined);
    const usable = new Set<number>();
    const queue: number[] = roots.map((r) => r.id);

    while (queue.length) {
        const id = queue.shift()!;

        if (usable.has(id)) {
            continue;
        }

        usable.add(id);

        for (const child of classes) {
            if (child.parent === id && byId.has(child.id)) {
                queue.push(child.id);
            }
        }
    }

    return usable;
}

/**
 * Reports i18n coverage so we can decide which languages to offer in the UI.
 * A language "covers" a record if its value exists and differs from the English value.
 */
function reportI18nCoverage(skills: SkillRecord[], classes: ClassRecord[]) {
    const sample = [...skills.map((s) => s.name), ...skills.map((s) => s.description), ...classes.map((c) => c.name)];
    const langs = new Set<string>();

    for (const obj of sample) {
        for (const k of Object.keys(obj)) {
            langs.add(k);
        }
    }

    console.log('\ni18n coverage (distinct from English):');
    const results: Array<{ lang: string; coverage: string }> = [];

    for (const lang of [...langs].sort()) {
        if (lang === 'en') {
            continue;
        }

        let localized = 0;
        let present = 0;

        for (const obj of sample) {
            const v = (obj as Record<string, string | undefined>)[lang];

            if (v !== undefined && v !== null && v !== '') {
                present++;

                if (v !== obj.en) {
                    localized++;
                }
            }
        }

        const pct = ((localized / sample.length) * 100).toFixed(1);
        results.push({ lang, coverage: `${pct}% (${localized}/${sample.length}, ${present} present)` });
    }

    for (const r of results) {
        console.log(`  ${r.lang.padEnd(5)} ${r.coverage}`);
    }
}

async function main() {
    console.log(`Scraping Flyff Universe API → ${OUT_DIR}\n`);
    await ensureDir();

    console.log('Fetching classes');
    const classesRaw = await downloadMany<ClassRecord>('class');
    const usableIds = filterUsableClasses(classesRaw);
    const classes = classesRaw.filter((c) => usableIds.has(c.id));
    console.log(`  kept ${classes.length}/${classesRaw.length} classes (reachable from Vagrant)`);
    await save('class.json', classes);

    console.log('\nFetching skills');
    const skillsRaw = await downloadMany<SkillRecord>('skill');
    // Keep every skill. Some of them (e.g. trigger debuffs like Stun) belong
    // to classes outside the 4 UI chains but are referenced by abilities /
    // synergies — the tooltip needs their names for resolution. The engine
    // buckets skills by class, so non-UI skills simply never land in any
    // tree/picker bucket.
    normalizeMagicAttackScale(skillsRaw);
    await save('skill.json', skillsRaw);

    const uiSkills = skillsRaw.filter((s) => usableIds.has(s.class));
    reportI18nCoverage(uiSkills, classes);

    console.log('\nFetching parameter labels');
    const paramNames = collectParameterNames(skillsRaw);
    console.log(`  · ${paramNames.length} unique parameter names referenced`);
    const parameterLabels = await downloadParameterLabels(paramNames);
    await save('parameter-labels.json', parameterLabels);

    // Only generate icon assets for UI-visible skills. Non-UI skills are name-
    // lookup only — an "icon" sprite that includes every monster/debuff skill
    // would balloon the payload for no visible benefit.
    console.log('\nFetching skill icon sprite');
    await downloadIconMap(uiSkills.map((s) => s.icon), 'image/skill/colored/', 'skill');

    console.log('\nFetching class icon sprite');
    await downloadIconMap(classes.map((c) => c.icon), 'image/class/target/', 'class');

    console.log('\nDone.');
}

main().catch((err) => {
    console.error('Scrape failed:');
    console.error(err);
    process.exit(1);
});
