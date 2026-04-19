import { Button, Group, Stack, Text, Tooltip as MantineTooltip } from '@mantine/core';
import { IconArrowBackUp, IconChevronsUp } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { SkillRecord } from '@engine/types';
import { AllocationIssue } from '@engine/types';
import { getSkillMaxLevel } from '@engine/class-tree';
import { Icon } from './icon';
import { getLocalized } from '../data/i18n-util';

function isLevelGated(issue: AllocationIssue | null): boolean {
    return issue === AllocationIssue.CHARACTER_LEVEL_TOO_LOW || issue === AllocationIssue.CLASS_NOT_LEARNED;
}

interface Props {
    skill: SkillRecord;
    currentLevel: number;
    canIncrementIssue: AllocationIssue | null;
    canDecrementIssue: AllocationIssue | null;
    onIncrement: () => void;
    onDecrement: () => void;
    onMax: () => void;
    onReset: () => void;
}

export function SkillControls({
    skill,
    currentLevel,
    canIncrementIssue,
    canDecrementIssue,
    onIncrement,
    onDecrement,
    onMax,
    onReset,
}: Props) {
    const { t, i18n } = useTranslation();
    const max = getSkillMaxLevel(skill);
    // `canIncrementIssue` here is the CASCADE-aware issue: `OK` when clicking +
    // would succeed (including any auto-fill / auto-max), or the exact blocker
    // otherwise. So button state is mechanically accurate.
    const incDisabled = canIncrementIssue !== null && canIncrementIssue !== AllocationIssue.OK;
    const decDisabled = canDecrementIssue !== null && canDecrementIssue !== AllocationIssue.OK;
    const incReason = incDisabled && canIncrementIssue ? t(`issue.${canIncrementIssue}`) : undefined;
    const levelGated = isLevelGated(canIncrementIssue);

    return (
        <Stack gap="sm" w="100%">
            <Group gap="xs" align="center" wrap="nowrap">
                <Icon kind="skill" name={skill.icon} size={56} />
                <Stack gap={0}>
                    <Text fw={600} size="md" lh={1.1}>
                        {getLocalized(skill.name, i18n.language)}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {currentLevel} / {max}
                    </Text>
                </Stack>
            </Group>

            <Group gap="xs" justify="center">
                <MantineTooltip label={incReason} disabled={!incReason} withinPortal>
                    <Button variant="default" size="md" px={0} w={44} onClick={onIncrement} disabled={incDisabled} aria-label="+">
                        +
                    </Button>
                </MantineTooltip>
                <Button
                    variant="default"
                    size="md"
                    px={0}
                    w={44}
                    onClick={onDecrement}
                    disabled={decDisabled || currentLevel <= 0}
                    aria-label="−"
                >
                    −
                </Button>
                <MantineTooltip label={t('simulator.max')} withinPortal>
                    <Button
                        variant="filled"
                        color="cyan"
                        size="md"
                        px={0}
                        w={44}
                        onClick={onMax}
                        disabled={incDisabled && currentLevel === 0}
                        aria-label={t('simulator.max')}
                    >
                        <IconChevronsUp size={20} />
                    </Button>
                </MantineTooltip>
                <MantineTooltip label={t('simulator.reset')} withinPortal>
                    <Button
                        variant="light"
                        color="red"
                        size="md"
                        px={0}
                        w={44}
                        onClick={onReset}
                        disabled={currentLevel <= 0}
                        aria-label={t('simulator.reset')}
                    >
                        <IconArrowBackUp size={20} />
                    </Button>
                </MantineTooltip>
            </Group>

            <Text size="xs" c={levelGated ? 'red.5' : 'dimmed'} fw={levelGated ? 600 : undefined} ta="center">
                {t('simulator.requiredLevel', { level: skill.level })}
            </Text>
        </Stack>
    );
}
