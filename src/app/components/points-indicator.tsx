import { Badge, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../hooks/use-responsive';

interface Props {
    remaining: number;
    total: number;
}

export function PointsIndicator({ remaining, total }: Props) {
    const { t } = useTranslation();
    const isMobile = useIsMobile();
    const color = remaining > 0 ? 'cyan' : 'dimmed';

    const badge = (
        <Badge
            variant="filled"
            color={color}
            size="lg"
            radius="sm"
            h={36}
            px="md"
            miw={isMobile ? 100 : 130}
            style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}
        >
            {remaining} / {total}
        </Badge>
    );

    if (isMobile) {
        return (
            <Group gap={6} align="center" wrap="nowrap">
                <Text size="xs" c="dimmed">
                    {t('simulator.points')}
                </Text>
                {badge}
            </Group>
        );
    }

    return (
        <Stack gap={2} align="center">
            {badge}
            <Text size="xs" c="dimmed">
                {t('simulator.points')}
            </Text>
        </Stack>
    );
}
