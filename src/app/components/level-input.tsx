import { Group, NumberInput, Stack, Text } from '@mantine/core';
import { MAX_CHARACTER_LEVEL } from '@engine/constants';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../hooks/use-responsive';

interface Props {
    level: number;
    onChange: (level: number) => void;
    /** When true, the input gets a warm accent border to signal that raising
     *  the character level unblocks the currently selected skill. */
    highlight?: boolean;
}

export function LevelInput({ level, onChange, highlight = false }: Props) {
    const { t } = useTranslation();
    const isMobile = useIsMobile();

    const accent = 'var(--mantine-color-red-6)';
    const inputStyles = highlight
        ? { input: { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` } }
        : undefined;
    const labelColor = highlight ? 'red.4' : 'dimmed';

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
            styles={inputStyles}
        />
    );

    if (isMobile) {
        return (
            <Group gap={6} align="center" wrap="nowrap">
                <Text size="xs" c={labelColor} fw={highlight ? 600 : undefined}>
                    {t('simulator.level')}
                </Text>
                {input}
            </Group>
        );
    }

    return (
        <Stack gap={2} align="center">
            {input}
            <Text size="xs" c={labelColor} fw={highlight ? 600 : undefined}>
                {t('simulator.level')}
            </Text>
        </Stack>
    );
}
