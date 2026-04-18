import { Group, NumberInput, Stack, Text } from '@mantine/core';
import { MAX_CHARACTER_LEVEL } from '@engine/constants';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../hooks/use-responsive';

interface Props {
    level: number;
    onChange: (level: number) => void;
}

export function LevelInput({ level, onChange }: Props) {
    const { t } = useTranslation();
    const isMobile = useIsMobile();

    const input = (
        <NumberInput
            value={level}
            min={1}
            max={MAX_CHARACTER_LEVEL}
            step={1}
            allowDecimal={false}
            allowNegative={false}
            clampBehavior="strict"
            onChange={(v) => {
                if (typeof v === 'number' && Number.isFinite(v)) {
                    onChange(Math.trunc(v));
                }
            }}
            aria-label={t('simulator.level')}
            w={isMobile ? 80 : 110}
            size="sm"
        />
    );

    if (isMobile) {
        return (
            <Group gap={6} align="center" wrap="nowrap">
                <Text size="xs" c="dimmed">
                    {t('simulator.level')}
                </Text>
                {input}
            </Group>
        );
    }

    return (
        <Stack gap={2} align="center">
            {input}
            <Text size="xs" c="dimmed">
                {t('simulator.level')}
            </Text>
        </Stack>
    );
}
