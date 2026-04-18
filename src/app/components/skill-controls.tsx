import { Button, Group, Stack, Text, Tooltip as MantineTooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SkillRecord } from '@engine/types';
import { AllocationIssue } from '@engine/types';
import { getSkillMaxLevel } from '@engine/class-tree';
import { Icon } from './icon';
import { getLocalized } from '../data/i18n-util';

interface Props {
    skill: SkillRecord;
    currentLevel: number;
    canIncrementIssue: AllocationIssue | null;
    canDecrementIssue: AllocationIssue | null;
    onIncrement: () => void;
    onDecrement: () => void;
    onMax: () => void;
    onReset: () => void;
    /** Center the +/-/Max/Reset row (used in the mobile sticky panel). */
    centerActions?: boolean;
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
    centerActions = false,
}: Props) {
    const { t, i18n } = useTranslation();
    const max = getSkillMaxLevel(skill);
    // `canIncrementIssue` here is the CASCADE-aware issue: `OK` when clicking +
    // would succeed (including any auto-fill / auto-max), or the exact blocker
    // otherwise. So button state is mechanically accurate.
    const incDisabled = canIncrementIssue !== null && canIncrementIssue !== AllocationIssue.OK;
    const decDisabled = canDecrementIssue !== null && canDecrementIssue !== AllocationIssue.OK;
    const incReason = incDisabled && canIncrementIssue ? t(`issue.${canIncrementIssue}`) : undefined;

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

            <Group gap="xs" justify={centerActions ? 'center' : undefined}>
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
                <Button variant="filled" color="cyan" size="md" onClick={onMax} disabled={incDisabled && currentLevel === 0}>
                    {t('simulator.max')}
                </Button>
                <Button variant="subtle" color="red" size="md" onClick={onReset} disabled={currentLevel <= 0}>
                    {t('simulator.reset')}
                </Button>
            </Group>
        </Stack>
    );
}
