import { Badge, Divider, Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { I18nString, SkillRecord } from '@engine/types';
import { Icon } from './icon';
import { getLocalized } from '../data/i18n-util';
import { useFlyffData } from '../hooks/use-flyff-data';
import { useEngineStore } from '../stores/engine-store';
import { getParamLabel } from './param-labels';
import {
    abilityIdentityKey,
    diffEntries,
    scalingIdentityKey,
    type AbilityEntry,
    type LevelLike,
    type ScalingParam,
    type SynergyEntry,
} from './skill-tooltip-diff';

interface Props {
    skill: SkillRecord;
    currentLevel: number;
    /** Suppress the icon+name+level header. Useful when the tooltip body is
     *  rendered alongside another component (like SkillControls) that already
     *  shows that information. */
    hideHeader?: boolean;
    /** Drop the default max-width cap so content fills the parent. Floating
     *  hover tooltips keep the default cap; panels that already constrain
     *  width pass true. */
    fullWidth?: boolean;
}

// Color tokens — pulled together so base vs. variation styling stays in sync.
const COLOR_SCALING = 'orange.4';
const COLOR_BUFF = 'cyan.3';
const COLOR_SYNERGY = 'teal.4';
const COLOR_VARIATION = 'violet.4';

// --- Formatting helpers ---

function formatDurationSeconds(total: number): string {
    if (!Number.isFinite(total) || total <= 0) {
        return `${total}s`;
    }

    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const rawSec = total - h * 3600 - m * 60;
    const sec = Math.round(rawSec * 10) / 10;
    const parts: string[] = [];

    if (h) {
        parts.push(`${h}h`);
    }

    if (m) {
        parts.push(`${m}m`);
    }

    if (sec || parts.length === 0) {
        parts.push(`${sec}s`);
    }

    return parts.join(' ');
}

// rate=true: `add` is a percentage (add=1 -> +1%). rate=false: flat value.
function formatAdd(value: number, rate: boolean | undefined): string {
    const sign = value > 0 ? '+' : value < 0 ? '' : '';

    if (rate) {
        const rounded = Math.round(value * 100) / 100;

        return `${sign}${rounded}%`;
    }

    return `${sign}${value}`;
}

function scalingLabel(
    param: string | undefined,
    locale: string,
    labels: Record<string, I18nString>,
    t: (k: string) => string,
): string {
    const p = param ?? '';

    // Hack: Mentalist skills (Hexe's Lament, Chimera's Curse, Cimetiere's
    // Scream, Lillith's Gaze) ship with an empty `parameter` on their
    // scalingParameters. The game labels these as "Dec. Charging Time Scaling"
    // (UI_TOOLTIP_SCALE_CHARGE), so we map empty → that key.
    if (p === '') {
        return t('tooltip.chargeScaling');
    }

    if (p === 'attack') {
        return t('tooltip.attackScaling');
    }

    if (p === 'hp') {
        return t('tooltip.healScaling');
    }

    if (p === 'duration') {
        return t('tooltip.timeScaling');
    }

    return `${getParamLabel(p, locale, labels)} ${t('tooltip.scaling')}`;
}

// `parameter: "attack"` with a `part` field points at a weapon/equipment slot
// rather than a stat. Hand-mapped to i18n keys because the API's parameter
// endpoint doesn't cover these slot keys.
const PART_LABEL_KEYS: Record<string, string> = {
    righthandweapon: 'tooltip.rightHandWeaponAttack',
    lefthandweapon: 'tooltip.leftHandWeaponAttack',
    shield: 'tooltip.shieldDefense',
};

function formatScalingBody(
    scp: ScalingParam,
    locale: string,
    labels: Record<string, I18nString>,
    t: (k: string) => string,
): string {
    // Prefer the part label when present; slot-based scalings set `part` and
    // leave `stat` empty.
    if (scp.part && PART_LABEL_KEYS[scp.part]) {
        const scale = scp.scale ?? 0;
        const max = scp.maximum !== undefined ? ` (max ${scp.maximum})` : '';

        return `${t(PART_LABEL_KEYS[scp.part])} × ${scale}${max}`;
    }

    const raw = scp.stat ?? scp.part ?? '';
    const isCoreStat = raw === 'int' || raw === 'str' || raw === 'dex' || raw === 'sta';
    const stat = isCoreStat ? raw.toUpperCase() : getParamLabel(raw, locale, labels);
    const scale = scp.scale ?? 0;
    const max = scp.maximum !== undefined ? ` (max ${scp.maximum})` : '';

    return `${stat} × ${scale}${max}`;
}

function scopeTag(a: AbilityEntry, t: (k: string) => string): string {
    if (a.pvp === false && a.pve !== false) {
        return ` (${t('tooltip.pve')})`;
    }

    if (a.pve === false && a.pvp !== false) {
        return ` (${t('tooltip.pvp')})`;
    }

    return '';
}

function formatAbility(
    a: AbilityEntry,
    resolveSkillName: (id: number) => string,
    locale: string,
    labels: Record<string, I18nString>,
    t: (k: string) => string,
): string | null {
    const tag = scopeTag(a, t);

    if (a.parameter === 'hp' && a.rate === false && typeof a.add === 'number' && a.add > 0) {
        return `${t('tooltip.baseHeal')}: +${a.add}${tag}`;
    }

    if (a.parameter === 'skillchance' && a.skill !== undefined) {
        const chance = typeof a.add === 'number' ? formatAdd(a.add, a.rate) : '?';
        const target = resolveSkillName(a.skill);

        return `${chance} ${t('tooltip.chanceToTrigger')} ${target}${tag}`;
    }

    if ((a.parameter === 'autohp' || a.parameter === 'autohppvp') && typeof a.add === 'number') {
        const text = t('tooltip.recoverHpWhenBelow').replace('{{value}}', String(a.add));

        return `${text}${tag}`;
    }

    if (a.parameter === 'attribute' && a.attribute) {
        const attrLabel = a.attribute.charAt(0).toUpperCase() + a.attribute.slice(1);
        const base = `${t('tooltip.applies')} ${attrLabel}`;

        if (a.dotMode && typeof a.dotValue === 'number') {
            const mode = a.dotMode.charAt(0).toUpperCase() + a.dotMode.slice(1);

            return `${base} (${mode}: ${a.dotValue}%)${tag}`;
        }

        return `${base}${tag}`;
    }

    const label = getParamLabel(a.parameter, locale, labels);

    if (typeof a.set === 'number') {
        const val = a.rate ? `${a.set}%` : `${a.set}`;

        return `${label} ${t('tooltip.setTo')} ${val}${tag}`;
    }

    if (typeof a.add === 'number') {
        return `${label} ${formatAdd(a.add, a.rate)}${tag}`;
    }

    return null;
}

function renderSynergyLines(
    s: SynergyEntry,
    targetName: string,
    locale: string,
    labels: Record<string, I18nString>,
    t: (k: string) => string,
): { heading: string; body: string } {
    const heading = `${targetName} (${t('tooltip.lvShort')} ${s.minLevel}+)`;
    const label = scalingLabel(s.parameter, locale, labels, t);
    const perLv = t('tooltip.perLv');
    let value: string;

    if (s.add) {
        if (s.parameter === 'duration') {
            const seconds = Math.round((s.scale / 100) * 100) / 100;

            value = `+ ${seconds}s`;
        } else {
            value = `+ ${s.scale}`;
        }
    } else {
        value = `× ${(Math.round((1 + s.scale / 100) * 100) / 100).toFixed(2)}`;
    }

    return { heading, body: `${label} ${perLv}: ${value}` };
}

// --- SkillBody: the tooltip content below the header. When `compareWith` is
// set (i.e. the main skill is a master variation), the body becomes a diff
// view: unchanged fields render from the base in default colors; changed
// fields render from the variation in violet; added entries are violet;
// removed base entries are violet + strikethrough. ---

interface BodyCtx {
    locale: string;
    labels: Record<string, I18nString>;
    resolveSkillName: (id: number) => string;
    t: (k: string, opts?: Record<string, unknown>) => string;
}

function getLevels(skill: SkillRecord): LevelLike[] {
    return (skill as unknown as { levels?: LevelLike[] }).levels ?? [];
}

function levelData(skill: SkillRecord, currentLevel: number): LevelLike {
    const lvls = getLevels(skill);

    return lvls[Math.max(0, Math.min(lvls.length - 1, currentLevel - 1))] ?? {};
}

interface ScalarPick<T> {
    /** Value from the base skill at its MAX level (for scalars + abilities)
     *  or the same level as the variation (for scalings). Undefined if the
     *  base has no value at that level. */
    base: T | undefined;
    /** Variation's value at its current level. Only populated in diff mode. */
    variation?: T;
    /** True when base's and variation's values (as displayed) differ. */
    changed: boolean;
}

/** True when `a` and `b` display as the same scalar value. Primitives are
 *  compared with ===; the one array-valued scalar we care about
 *  (`damageMultiplier`) compares by its first multiplier. */
function scalarEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }

    if (a === undefined || b === undefined) {
        return false;
    }

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

/** Compares base[max] vs variation[max]. A variation inherits base's value
 *  for any field it doesn't explicitly override (undefined on the variation
 *  side falls back to the base's), so we treat "variation undefined" as
 *  "variation equals base" — no diff.
 *
 *  Returns the final *displayable* values for both sides: `base` is always
 *  base[max], and `variation` is the variation's current-level value with
 *  base[max] as fallback when the variation doesn't override the field.
 *  That way compound rows (damage min/max, duration/PvP, etc.) always have
 *  a complete pair — a half-overridden damage range like
 *  `{ min: undefined, max: 234 }` renders as "123 ~ 124 ➜ 123 ~ 234" with
 *  the inherited `123` filled in, not "? ~ 234". */
function pickScalar<K extends keyof LevelLike>(
    mainSkill: SkillRecord,
    mainLevel: number,
    compareWith: SkillRecord | undefined,
    field: K,
): ScalarPick<LevelLike[K]> {
    if (!compareWith) {
        const v = levelData(mainSkill, mainLevel)[field];

        return { base: v, variation: v, changed: false };
    }

    const baseMaxVal = levelData(compareWith, getLevels(compareWith).length)[field];
    const varMaxVal = levelData(mainSkill, getLevels(mainSkill).length)[field];
    const varCurVal = levelData(mainSkill, mainLevel)[field];

    // Variation inherits base for fields it doesn't override.
    const effectiveVarMax = varMaxVal !== undefined ? varMaxVal : baseMaxVal;
    const effectiveVarCur = varCurVal !== undefined ? varCurVal : baseMaxVal;
    const changed = !scalarEqual(baseMaxVal, effectiveVarMax);

    return {
        base: baseMaxVal,
        variation: effectiveVarCur,
        changed,
    };
}

function SkillBody({
    skill,
    currentLevel,
    compareWith,
    ctx,
}: {
    skill: SkillRecord;
    currentLevel: number;
    compareWith?: SkillRecord;
    ctx: BodyCtx;
}) {
    const { locale, labels, t } = ctx;
    const isDiff = compareWith !== undefined;

    // Single source of truth: base at MAX vs variation at MAX. Whatever
    // differs between those two end-states IS what the variation changes.
    // That classification drives both scalar diff markers and the array
    // diffs below. Synergies are assumed invariant so they don't diff.
    const mainData = levelData(skill, currentLevel);
    const baseMaxData = compareWith ? levelData(compareWith, getLevels(compareWith).length) : undefined;
    const varMaxData = compareWith ? levelData(skill, getLevels(skill).length) : undefined;

    const mp = pickScalar(skill, currentLevel, compareWith, 'consumedMP');
    const fp = pickScalar(skill, currentLevel, compareWith, 'consumedFP');
    const cooldown = pickScalar(skill, currentLevel, compareWith, 'cooldown');
    const casting = pickScalar(skill, currentLevel, compareWith, 'casting');
    const spellRange = pickScalar(skill, currentLevel, compareWith, 'spellRange');
    const duration = pickScalar(skill, currentLevel, compareWith, 'duration');
    const durationPVP = pickScalar(skill, currentLevel, compareWith, 'durationPVP');
    const dotTick = pickScalar(skill, currentLevel, compareWith, 'dotTick');
    const probability = pickScalar(skill, currentLevel, compareWith, 'probability');
    const probabilityPVP = pickScalar(skill, currentLevel, compareWith, 'probabilityPVP');
    const flyBack = pickScalar(skill, currentLevel, compareWith, 'flyBackProbability');
    const minAttack = pickScalar(skill, currentLevel, compareWith, 'minAttack');
    const maxAttack = pickScalar(skill, currentLevel, compareWith, 'maxAttack');
    const dmgMultArr = pickScalar(skill, currentLevel, compareWith, 'damageMultiplier');

    // Damage min/max are shown together; changed if EITHER is.
    const damageChanged = minAttack.changed || maxAttack.changed;

    // Duration line combines duration + PVP.
    const durationChanged = duration.changed || durationPVP.changed;

    const probabilityChanged = probability.changed || probabilityPVP.changed;

    // Classification driven by max-vs-max.
    const scalingDiff = isDiff
        ? diffEntries<ScalingParam>(
              (baseMaxData?.scalingParameters ?? []).filter((sc) => sc.pve !== false && (sc.stat || sc.part)),
              (varMaxData?.scalingParameters ?? []).filter((sc) => sc.pve !== false && (sc.stat || sc.part)),
              scalingIdentityKey,
          )
        : null;
    const abilityDiff = isDiff
        ? diffEntries<AbilityEntry>(baseMaxData?.abilities ?? [], varMaxData?.abilities ?? [], abilityIdentityKey)
        : null;
    // Synergies are assumed invariant between variation and base, so just
    // render the current-level synergies unchanged.
    const synergiesToRender = mainData.synergies ?? [];

    const mainElement = (skill as { element?: string }).element;
    const baseElement = compareWith ? (compareWith as { element?: string }).element : undefined;
    const elementToShow = isDiff ? mainElement : mainElement;
    const elementChanged = isDiff && mainElement !== baseElement;
    const showElement = elementToShow && elementToShow !== 'none';

    const mainDesc = getLocalized(skill.description, locale);
    const baseDesc = compareWith ? getLocalized(compareWith.description, locale) : '';

    // --- Row helpers. `scalarRow` renders one "Label: value" line. When the
    // field is changed by the variation AND the formatted base/variation
    // strings differ, it renders "Label: baseText → variationText" with the
    // arrow + variationText tinted violet. Same-string cases fall through to
    // the plain unchanged rendering. ---
    const scalarRow = <T,>(
        key: string,
        label: string,
        format: (v: T) => string,
        pick: ScalarPick<T | undefined>,
    ): ReactNode => {
        const baseDefined = pick.base !== undefined && pick.base !== null;
        const varDefined = pick.variation !== undefined && pick.variation !== null;

        if (!baseDefined && !varDefined) {
            return null;
        }

        const baseText = baseDefined ? format(pick.base as T) : null;
        const varText = varDefined ? format(pick.variation as T) : null;

        // Not changed, or the two sides format to the same text — render once.
        // Prefer the variation's value (current-level) over base[max] so the
        // tooltip reports what the player actually sees at their level.
        if (!pick.changed || baseText === varText) {
            return (
                <Text key={key} size="xs">
                    {label}: {varText ?? baseText}
                </Text>
            );
        }

        // Base missing but variation has something (variation-only scalar) —
        // render the whole line in violet (purely an "added" field).
        if (baseText === null) {
            return (
                <Text key={key} size="xs" c={COLOR_VARIATION}>
                    {label}: {varText}
                </Text>
            );
        }

        // Variation removed the field — strikethrough the base value.
        if (varText === null) {
            return (
                <Text key={key} size="xs" c={COLOR_VARIATION} style={{ textDecoration: 'line-through' }}>
                    {label}: {baseText}
                </Text>
            );
        }

        // Standard changed case — "base → variation" with only the arrow +
        // new value tinted violet.
        return (
            <Text key={key} size="xs">
                {label}: {baseText}{' '}
                <Text span c={COLOR_VARIATION} fw={700}>
                    ➜ {varText}
                </Text>
            </Text>
        );
    };

    // Compound-field picks — the formatter takes the tuple [primary, pvp] and
    // produces the combined display text (e.g. "20s / 6s (PvP)"). Used for
    // duration and probability so the arrow respects the whole line changing.
    const formatDurationPair = (d: [number | undefined, number | undefined]): string | null => {
        const [dur, pvp] = d;

        if (dur === undefined || dur === null) {
            return null;
        }

        const formatted = formatDurationSeconds(dur);
        const showPvp = pvp !== undefined && pvp !== null && pvp !== dur;

        return showPvp ? `${formatted} / ${formatDurationSeconds(pvp!)} (${t('tooltip.pvp')})` : formatted;
    };

    const formatProbabilityPair = (p: [number | undefined, number | undefined]): string | null => {
        const [pve, pvp] = p;

        if (pve === undefined || pve === null) {
            return null;
        }

        const showPvp = pvp !== undefined && pvp !== null && pvp !== pve;

        return showPvp ? `${pve}% / ${pvp}% (${t('tooltip.pvp')})` : `${pve}%`;
    };

    const formatDamagePair = (d: [number | undefined, number | undefined]): string | null => {
        const [mn, mx] = d;

        if (mn === undefined && mx === undefined) {
            return null;
        }

        return `${mn ?? '?'} ~ ${mx ?? '?'}`;
    };

    // Assemble ScalarPicks for the compound rows. Both sides are always
    // populated so a half-changed pair (e.g. variation only overrides
    // maxAttack) renders with base's value filled into the unchanged slot.
    const durationPair: ScalarPick<[number | undefined, number | undefined]> = {
        base: [duration.base, durationPVP.base],
        variation: [duration.variation, durationPVP.variation],
        changed: durationChanged,
    };
    const probabilityPair: ScalarPick<[number | undefined, number | undefined]> = {
        base: [probability.base, probabilityPVP.base],
        variation: [probability.variation, probabilityPVP.variation],
        changed: probabilityChanged,
    };
    const damagePair: ScalarPick<[number | undefined, number | undefined]> = {
        base: [minAttack.base, maxAttack.base],
        variation: [minAttack.variation, maxAttack.variation],
        changed: damageChanged,
    };
    const dmgMultPick: ScalarPick<number | undefined> = {
        base: dmgMultArr.base?.[0]?.multiplier,
        variation: dmgMultArr.variation?.[0]?.multiplier,
        changed: dmgMultArr.changed,
    };

    // Row wrappers that early-exit when formatted text is null on both sides.
    const compoundRow = <T,>(
        key: string,
        label: string,
        pick: ScalarPick<T>,
        format: (v: T) => string | null,
    ): ReactNode => {
        const baseText = pick.base !== undefined ? format(pick.base) : null;
        const varText = pick.variation !== undefined ? format(pick.variation) : null;

        if (baseText === null && varText === null) {
            return null;
        }

        if (!pick.changed || baseText === varText) {
            return (
                <Text key={key} size="xs">
                    {label}: {varText ?? baseText}
                </Text>
            );
        }

        if (baseText === null) {
            return (
                <Text key={key} size="xs" c={COLOR_VARIATION}>
                    {label}: {varText}
                </Text>
            );
        }

        if (varText === null) {
            return (
                <Text key={key} size="xs" c={COLOR_VARIATION} style={{ textDecoration: 'line-through' }}>
                    {label}: {baseText}
                </Text>
            );
        }

        return (
            <Text key={key} size="xs">
                {label}: {baseText}{' '}
                <Text span c={COLOR_VARIATION} fw={700}>
                    ➜ {varText}
                </Text>
            </Text>
        );
    };

    return (
        <>
            <Stack gap={2}>
                {scalarRow('mp', t('tooltip.mpCost'), (v: number) => String(v), mp)}
                {scalarRow('fp', t('tooltip.fpCost'), (v: number) => String(v), fp)}
                {scalarRow('cd', t('tooltip.cooldown'), formatDurationSeconds, cooldown)}
                {scalarRow('cast', t('tooltip.casting'), formatDurationSeconds, casting)}
                {scalarRow('range', t('tooltip.range'), (v: number) => `${v}m`, spellRange)}
                {compoundRow('dur', t('tooltip.baseTime'), durationPair, formatDurationPair)}
                {scalarRow('dot', t('tooltip.dotTick'), formatDurationSeconds, dotTick)}
                {compoundRow('prob', t('tooltip.probability'), probabilityPair, formatProbabilityPair)}
                {scalarRow('flyback', t('tooltip.knockdownProbability'), (v: number) => `${v}%`, flyBack)}
                {compoundRow('dmg', t('tooltip.baseDamage'), damagePair, formatDamagePair)}
                {scalarRow('mult', t('tooltip.damageMultiplier'), (v: number) => v.toFixed(2), dmgMultPick)}
            </Stack>

            {renderScalings(mainData, baseMaxData, scalingDiff, isDiff, locale, labels, t)}
            {renderAbilities(mainData, baseMaxData, abilityDiff, isDiff, ctx)}
            {renderSynergiesSimple(synergiesToRender, ctx)}

            {showElement ? (
                <Badge
                    variant="light"
                    color={elementChanged ? 'violet' : 'violet'}
                    size="xs"
                    w="fit-content"
                    c={elementChanged ? COLOR_VARIATION : undefined}
                >
                    {t('tooltip.element')}: {elementToShow}
                </Badge>
            ) : null}

            {baseDesc || mainDesc ? (
                <>
                    <Divider />
                    {baseDesc ? (
                        <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                            {baseDesc}
                        </Text>
                    ) : null}
                    {isDiff && mainDesc ? (
                        <Text size="xs" c={COLOR_VARIATION} style={{ whiteSpace: 'pre-wrap' }}>
                            {mainDesc}
                        </Text>
                    ) : null}
                    {!isDiff && mainDesc ? (
                        // Non-diff mode: main skill owns the single description line.
                        null
                    ) : null}
                </>
            ) : null}
        </>
    );
}

// --- Array-section renderers. In diff mode: unchanged entries in section
// color, modified/added in violet, removed with strikethrough violet. ---

function renderScalings(
    mainData: LevelLike,
    baseData: LevelLike | undefined,
    diff: ReturnType<typeof diffEntries<ScalingParam>> | null,
    isDiff: boolean,
    locale: string,
    labels: Record<string, I18nString>,
    t: (k: string) => string,
): ReactNode {
    const formatLine = (sc: ScalingParam) => ({
        label: scalingLabel(sc.parameter, locale, labels, t),
        body: formatScalingBody(sc, locale, labels, t),
    });

    if (!isDiff || !diff) {
        const lines = (mainData.scalingParameters ?? [])
            .filter((sc) => sc.pve !== false && (sc.stat || sc.part))
            .map(formatLine);

        if (lines.length === 0) {
            return null;
        }

        return (
            <Stack gap={2}>
                {lines.map((line, i) => (
                    <Text key={i} size="xs" c={COLOR_SCALING}>
                        {line.label}: {line.body}
                    </Text>
                ))}
            </Stack>
        );
    }

    // Diff mode: base-level list in section color if "unchanged," otherwise
    // the diff rules apply.
    const all: { key: string; text: string; color: string; strike: boolean }[] = [];

    for (const sc of diff.unchanged) {
        const line = formatLine(sc);
        all.push({ key: `u-${all.length}`, text: `${line.label}: ${line.body}`, color: COLOR_SCALING, strike: false });
    }

    for (const sc of diff.modified) {
        const line = formatLine(sc);
        all.push({
            key: `m-${all.length}`,
            text: `${line.label}: ${line.body}`,
            color: COLOR_VARIATION,
            strike: false,
        });
    }

    for (const sc of diff.added) {
        const line = formatLine(sc);
        all.push({ key: `a-${all.length}`, text: `${line.label}: ${line.body}`, color: COLOR_VARIATION, strike: false });
    }

    for (const sc of diff.removed) {
        const line = formatLine(sc);
        all.push({ key: `r-${all.length}`, text: `${line.label}: ${line.body}`, color: COLOR_VARIATION, strike: true });
    }

    // Avoid unused-var warning when baseData is passed through but not used here.
    void baseData;

    if (all.length === 0) {
        return null;
    }

    return (
        <Stack gap={2}>
            {all.map((r) => (
                <Text key={r.key} size="xs" c={r.color} style={r.strike ? { textDecoration: 'line-through' } : undefined}>
                    {r.text}
                </Text>
            ))}
        </Stack>
    );
}

function renderAbilities(
    mainData: LevelLike,
    baseData: LevelLike | undefined,
    diff: ReturnType<typeof diffEntries<AbilityEntry>> | null,
    isDiff: boolean,
    ctx: BodyCtx,
): ReactNode {
    const { locale, labels, resolveSkillName, t } = ctx;

    if (!isDiff || !diff) {
        const lines = (mainData.abilities ?? [])
            .map((a) => formatAbility(a, resolveSkillName, locale, labels, t))
            .filter((x): x is string => x !== null);

        if (lines.length === 0) {
            return null;
        }

        return (
            <Stack gap={2}>
                {lines.map((line, i) => (
                    <Text key={i} size="xs" c={COLOR_BUFF}>
                        {line}
                    </Text>
                ))}
            </Stack>
        );
    }

    const fmt = (a: AbilityEntry) => formatAbility(a, resolveSkillName, locale, labels, t);
    const rows: { key: string; text: string; color: string; strike: boolean }[] = [];

    for (const a of diff.unchanged) {
        const line = fmt(a);

        if (line) {
            rows.push({ key: `u-${rows.length}`, text: line, color: COLOR_BUFF, strike: false });
        }
    }

    for (const a of diff.modified) {
        const line = fmt(a);

        if (line) {
            rows.push({ key: `m-${rows.length}`, text: line, color: COLOR_VARIATION, strike: false });
        }
    }

    for (const a of diff.added) {
        const line = fmt(a);

        if (line) {
            rows.push({ key: `a-${rows.length}`, text: line, color: COLOR_VARIATION, strike: false });
        }
    }

    for (const a of diff.removed) {
        const line = fmt(a);

        if (line) {
            rows.push({ key: `r-${rows.length}`, text: line, color: COLOR_VARIATION, strike: true });
        }
    }

    void baseData;

    if (rows.length === 0) {
        return null;
    }

    return (
        <Stack gap={2}>
            {rows.map((r) => (
                <Text key={r.key} size="xs" c={r.color} style={r.strike ? { textDecoration: 'line-through' } : undefined}>
                    {r.text}
                </Text>
            ))}
        </Stack>
    );
}

/** Synergies are invariant between a variation and its base — we never
 *  diff them. This just renders whatever list we were handed in the section
 *  color. */
function renderSynergiesSimple(synergies: SynergyEntry[], ctx: BodyCtx): ReactNode {
    const { locale, labels, resolveSkillName, t } = ctx;
    const blocks = synergies
        .filter((sy) => sy.pve !== false)
        .map((sy) => renderSynergyLines(sy, resolveSkillName(sy.skill), locale, labels, t));

    if (blocks.length === 0) {
        return null;
    }

    return (
        <Stack gap={4}>
            {blocks.map((block, i) => (
                <Stack key={i} gap={0}>
                    <Text size="xs" c={COLOR_SYNERGY} fw={500}>
                        {block.heading}
                    </Text>
                    <Text size="xs" c={COLOR_SYNERGY}>
                        {block.body}
                    </Text>
                </Stack>
            ))}
        </Stack>
    );
}

/**
 * Skill tooltip body. Level-0 skills show Lv. 1 stats. For master variations
 * (skills with `inheritSkill`), renders a unified diff view — one body where
 * only the fields the variation actually changes appear in violet.
 */
export function SkillTooltipBody({ skill, currentLevel, hideHeader = false, fullWidth = false }: Props) {
    const { t, i18n } = useTranslation();
    const { data } = useFlyffData();
    const characterLevel = useEngineStore((s) => s.state?.level ?? 0);
    const effectiveLevel = currentLevel === 0 ? 1 : currentLevel;
    const locale = i18n.language;
    const labels: Record<string, I18nString> = data?.parameterLabels ?? {};
    const requirementMet = characterLevel >= skill.level;

    const resolveSkillName = (id: number): string => {
        const s = data?.skillsById.get(id);

        return s ? getLocalized(s.name, locale) : `#${id}`;
    };

    const ctx: BodyCtx = {
        locale,
        labels,
        resolveSkillName,
        t: t as BodyCtx['t'],
    };

    const inheritId = (skill as { inheritSkill?: number }).inheritSkill;
    const baseSkill = inheritId ? data?.skillsById.get(inheritId) : undefined;

    return (
        <Stack gap={6} maw={fullWidth ? undefined : 320}>
            {hideHeader ? null : (
                <>
                    <Group gap="xs" wrap="nowrap">
                        <Icon kind="skill" name={skill.icon} size={40} />
                        <Stack gap={0}>
                            <Text fw={700} size="sm" lh={1.1}>
                                {getLocalized(skill.name, locale)}
                            </Text>
                            <Text size="xs" c="dimmed" lh={1.1}>
                                {t('tooltip.level')} {effectiveLevel}
                            </Text>
                            <Text
                                size="xs"
                                c={requirementMet ? 'dimmed' : 'red.5'}
                                fw={requirementMet ? undefined : 600}
                                lh={1.1}
                            >
                                {t('simulator.requiredLevel', { level: skill.level })}
                            </Text>
                        </Stack>
                    </Group>
                    <Divider />
                </>
            )}

            {baseSkill ? (
                <Text size="xs" fw={700} c={COLOR_VARIATION}>
                    {t('tooltip.masterVariation')}
                </Text>
            ) : null}

            <SkillBody
                skill={skill}
                currentLevel={effectiveLevel}
                compareWith={baseSkill}
                ctx={ctx}
            />
        </Stack>
    );
}
