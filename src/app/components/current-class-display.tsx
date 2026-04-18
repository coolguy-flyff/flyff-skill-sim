import { Group, Text } from '@mantine/core';
import { Icon } from './icon';
import type { ClassRecord } from '@engine/types';
import { getLocalized } from '../data/i18n-util';
import { useTranslation } from 'react-i18next';

interface Props {
    currentClass: ClassRecord | undefined;
    targetClass: ClassRecord;
}

/**
 * Single-line label: "{current} ({target})" — no arrow, no stacked text.
 * The target-in-parens is dimmed and hidden when current equals target.
 */
export function CurrentClassDisplay({ currentClass, targetClass }: Props) {
    const { i18n } = useTranslation();
    const lang = i18n.language;

    if (!currentClass) {
        return null;
    }

    const currentName = getLocalized(currentClass.name, lang);
    const targetName = getLocalized(targetClass.name, lang);
    const showTarget = currentClass.id !== targetClass.id;

    return (
        <Group gap="xs" wrap="nowrap">
            <Icon kind="class" name={currentClass.icon} size={32} />
            <Text fw={600} size="md" lh={1.1}>
                {currentName}
                {showTarget ? (
                    <Text span c="dimmed" size="sm">
                        {' '}
                        ({targetName})
                    </Text>
                ) : null}
            </Text>
        </Group>
    );
}
