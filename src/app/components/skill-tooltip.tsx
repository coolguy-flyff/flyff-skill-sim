import { Badge, Divider, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { I18nString, SkillRecord } from '@engine/types';
import { Icon } from './icon';
import { getLocalized } from '../data/i18n-util';
import { useFlyffData } from '../hooks/use-flyff-data';
import { getParamLabel } from './param-labels';

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

// --- Skill level data schema, as surveyed from scraped skill.json. ---

interface ScalingParam {
    parameter?: string;
    stat?: string;
    scale?: number;
    pve?: boolean;
    pvp?: boolean;
    part?: string;
    maximum?: number;
}

interface AbilityEntry {
    parameter: string;
    add?: number;
    rate?: boolean;
    set?: number;
    attribute?: string;
    dotMode?: string;
    dotValue?: number;
    pve?: boolean;
    pvp?: boolean;
    skill?: number;
    skillLevel?: number;
}

interface SynergyEntry {
    parameter: string;
    skill: number;
    minLevel: number;
    add: boolean;
    scale: number;
    pve?: boolean;
    pvp?: boolean;
}

interface DamageMultEntry {
    multiplier?: number;
}

interface LevelLike {
    consumedMP?: number;
    consumedFP?: number;
    cooldown?: number;
    casting?: number;
    duration?: number;
    durationPVP?: number;
    dotTick?: number;
    spellRange?: number;
    minAttack?: number;
    maxAttack?: number;
    probability?: number;
    probabilityPVP?: number;
    flyBackProbability?: number;
    damageMultiplier?: DamageMultEntry[];
    abilities?: AbilityEntry[];
    synergies?: SynergyEntry[];
    scalingParameters?: ScalingParam[];
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

function formatScalingBody(
    scp: ScalingParam,
    locale: string,
    labels: Record<string, I18nString>,
): string {
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

/** Formats one ability (buff/debuff line). Keeps the game's "{Name} +{value}"
 *  word order (not "+{value} {Name}") for parity with in-game tooltips. */
function formatAbility(
    a: AbilityEntry,
    resolveSkillName: (id: number) => string,
    locale: string,
    labels: Record<string, I18nString>,
    t: (k: string) => string,
): string | null {
    const tag = scopeTag(a, t);

    // "Base Heal: %d" — the game has a dedicated label for this case.
    if (a.parameter === 'hp' && a.rate === false && typeof a.add === 'number' && a.add > 0) {
        return `${t('tooltip.baseHeal')}: +${a.add}${tag}`;
    }

    // Skillchance — % chance to trigger a referenced skill.
    if (a.parameter === 'skillchance' && a.skill !== undefined) {
        const chance = typeof a.add === 'number' ? formatAdd(a.add, a.rate) : '?';
        const target = resolveSkillName(a.skill);

        return `${chance} ${t('tooltip.chanceToTrigger')} ${target}${tag}`;
    }

    // Auto-HP: the API doesn't surface the recovery amount, only the HP
    // threshold via `add`. Render the phrase we know.
    if ((a.parameter === 'autohp' || a.parameter === 'autohppvp') && typeof a.add === 'number') {
        const text = t('tooltip.recoverHpWhenBelow').replace('{{value}}', String(a.add));

        return `${text}${tag}`;
    }

    // Attribute application (e.g. Moon Beam "applies" the moonbeam attribute).
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

    // "set to X" — rare, but e.g. Moon Beam tethers speed to 0.
    if (typeof a.set === 'number') {
        const val = a.rate ? `${a.set}%` : `${a.set}`;

        return `${label} ${t('tooltip.setTo')} ${val}${tag}`;
    }

    if (typeof a.add === 'number') {
        // Game order: name first, then value. "Weaken Effect +1%".
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
        // `duration` uses a 1s = 100 API-unit resolution; convert for display.
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

/** Renders everything below the header for a single skill+level: stats,
 *  scalings, buffs, synergies, element badge, description. Reused to stack
 *  a variation's body on top of its base. */
interface BodyCtx {
    locale: string;
    labels: Record<string, I18nString>;
    resolveSkillName: (id: number) => string;
    t: (k: string, opts?: Record<string, unknown>) => string;
}

function SkillBody({
    skill,
    currentLevel,
    ctx,
}: {
    skill: SkillRecord;
    currentLevel: number;
    ctx: BodyCtx;
}) {
    const { locale, labels, resolveSkillName, t } = ctx;
    const levels = (skill as unknown as { levels?: LevelLike[] }).levels ?? [];
    const levelData = levels[Math.max(0, Math.min(levels.length - 1, currentLevel - 1))] ?? {};

    const scalings = levelData.scalingParameters ?? [];
    const abilities = levelData.abilities ?? [];
    const synergies = levelData.synergies ?? [];
    const damageMult = levelData.damageMultiplier?.[0]?.multiplier;
    const element = (skill as { element?: string }).element;
    const showElement = element && element !== 'none';

    const scalingLines = scalings
        .filter((sc) => sc.pve !== false && (sc.stat || sc.part))
        .map((sc) => ({
            label: scalingLabel(sc.parameter, locale, labels, t),
            body: formatScalingBody(sc, locale, labels),
        }));

    const abilityLines = abilities
        .map((a) => formatAbility(a, resolveSkillName, locale, labels, t))
        .filter((line): line is string => line !== null);

    const synergyBlocks = synergies
        .filter((sy) => sy.pve !== false)
        .map((sy) => renderSynergyLines(sy, resolveSkillName(sy.skill), locale, labels, t));

    const desc = getLocalized(skill.description, locale);

    let durationText: string | null = null;

    if (levelData.duration !== undefined) {
        const base = formatDurationSeconds(levelData.duration);
        const showPvp =
            levelData.durationPVP !== undefined && levelData.durationPVP !== levelData.duration;

        durationText = showPvp
            ? `${base} / ${formatDurationSeconds(levelData.durationPVP!)} (${t('tooltip.pvp')})`
            : base;
    }

    // Probability line — PvE first, PvP appended when it differs.
    let probabilityText: string | null = null;

    if (levelData.probability !== undefined) {
        const pve = `${levelData.probability}%`;
        const showPvp =
            levelData.probabilityPVP !== undefined &&
            levelData.probabilityPVP !== levelData.probability;

        probabilityText = showPvp
            ? `${pve} / ${levelData.probabilityPVP}% (${t('tooltip.pvp')})`
            : pve;
    }

    return (
        <>
            <Stack gap={2}>
                {levelData.consumedMP !== undefined ? (
                    <Text size="xs">
                        {t('tooltip.mpCost')}: {levelData.consumedMP}
                    </Text>
                ) : null}
                {levelData.consumedFP !== undefined ? (
                    <Text size="xs">
                        {t('tooltip.fpCost')}: {levelData.consumedFP}
                    </Text>
                ) : null}
                {levelData.cooldown !== undefined ? (
                    <Text size="xs">
                        {t('tooltip.cooldown')}: {formatDurationSeconds(levelData.cooldown)}
                    </Text>
                ) : null}
                {levelData.casting !== undefined ? (
                    <Text size="xs">
                        {t('tooltip.casting')}: {formatDurationSeconds(levelData.casting)}
                    </Text>
                ) : null}
                {levelData.spellRange !== undefined ? (
                    <Text size="xs">
                        {t('tooltip.range')}: {levelData.spellRange}m
                    </Text>
                ) : null}
                {durationText !== null ? (
                    <Text size="xs">
                        {t('tooltip.baseTime')}: {durationText}
                    </Text>
                ) : null}
                {levelData.dotTick !== undefined ? (
                    <Text size="xs">
                        {t('tooltip.dotTick')}: {formatDurationSeconds(levelData.dotTick)}
                    </Text>
                ) : null}
                {probabilityText !== null ? (
                    <Text size="xs">
                        {t('tooltip.probability')}: {probabilityText}
                    </Text>
                ) : null}
                {levelData.flyBackProbability !== undefined ? (
                    <Text size="xs">
                        {t('tooltip.knockdownProbability')}: {levelData.flyBackProbability}%
                    </Text>
                ) : null}
                {levelData.minAttack !== undefined || levelData.maxAttack !== undefined ? (
                    <Text size="xs">
                        {t('tooltip.baseDamage')}: {levelData.minAttack ?? '?'} ~ {levelData.maxAttack ?? '?'}
                    </Text>
                ) : null}
                {damageMult !== undefined ? (
                    <Text size="xs">
                        {t('tooltip.damageMultiplier')}: {damageMult.toFixed(2)}
                    </Text>
                ) : null}
            </Stack>

            {scalingLines.length > 0 ? (
                <Stack gap={2}>
                    {scalingLines.map((line, i) => (
                        <Text key={i} size="xs" c={COLOR_SCALING}>
                            {line.label}: {line.body}
                        </Text>
                    ))}
                </Stack>
            ) : null}

            {abilityLines.length > 0 ? (
                <Stack gap={2}>
                    {abilityLines.map((line, i) => (
                        <Text key={i} size="xs" c={COLOR_BUFF}>
                            {line}
                        </Text>
                    ))}
                </Stack>
            ) : null}

            {synergyBlocks.length > 0 ? (
                <Stack gap={4}>
                    {synergyBlocks.map((block, i) => (
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
            ) : null}

            {showElement ? (
                <Badge variant="light" color="violet" size="xs" w="fit-content">
                    {t('tooltip.element')}: {element}
                </Badge>
            ) : null}

            {desc ? (
                <>
                    <Divider />
                    <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                        {desc}
                    </Text>
                </>
            ) : null}
        </>
    );
}

/**
 * Skill tooltip body. Level-0 skills show Lv. 1 stats. For master variations
 * (skills with `inheritSkill`), renders the BASE skill's body first, then a
 * purple "Master Variation" divider, then the variation's own body so the
 * player can compare both side-by-side.
 */
export function SkillTooltipBody({ skill, currentLevel, hideHeader = false, fullWidth = false }: Props) {
    const { t, i18n } = useTranslation();
    const { data } = useFlyffData();
    const effectiveLevel = currentLevel === 0 ? 1 : currentLevel;
    const locale = i18n.language;
    const labels: Record<string, I18nString> = data?.parameterLabels ?? {};

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
                        </Stack>
                    </Group>
                    <Divider />
                </>
            )}

            {baseSkill ? (
                <>
                    {/* Base skill info — stats that the variation shares or inherits. */}
                    <SkillBody
                        skill={baseSkill}
                        currentLevel={(baseSkill.levels as unknown as unknown[] | undefined)?.length ?? 1}
                        ctx={ctx}
                    />
                    <Divider color={COLOR_VARIATION} />
                    <Text size="xs" fw={700} c={COLOR_VARIATION}>
                        {t('tooltip.masterVariation')}
                    </Text>
                    {/* Variation overrides — tinted purple so differences vs. base pop. */}
                    <Stack gap={6} style={{ color: 'var(--mantine-color-violet-4)' }}>
                        <SkillBody skill={skill} currentLevel={effectiveLevel} ctx={ctx} />
                    </Stack>
                </>
            ) : (
                <SkillBody skill={skill} currentLevel={effectiveLevel} ctx={ctx} />
            )}
        </Stack>
    );
}
