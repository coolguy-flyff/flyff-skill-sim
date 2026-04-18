import { Card, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { ClassRecord } from '@engine/types';
import { Icon } from './icon';
import { getLocalized } from '../data/i18n-util';
import classes from './class-card.module.css';

interface Props {
    thirdClass: ClassRecord;
    parentClass: ClassRecord | undefined;
    onSelect: (thirdClass: ClassRecord) => void;
}

export function ClassCard({ thirdClass, parentClass, onSelect }: Props) {
    const { i18n } = useTranslation();
    const lang = i18n.language;

    return (
        <Card
            withBorder
            shadow="sm"
            radius="md"
            padding="lg"
            className={classes.card}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(thirdClass)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(thirdClass);
                }
            }}
        >
            <Stack align="center" gap="xs">
                <Icon kind="class" name={thirdClass.icon} size={80} />
                <Text fw={700} size="lg">
                    {getLocalized(thirdClass.name, lang)}
                </Text>
                {parentClass ? (
                    <Text size="sm" c="dimmed">
                        ({getLocalized(parentClass.name, lang)})
                    </Text>
                ) : null}
            </Stack>
        </Card>
    );
}
