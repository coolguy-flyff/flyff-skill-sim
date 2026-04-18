import { ActionIcon, Button, Group } from '@mantine/core';
import type { ClassRecord } from '@engine/types';
import { Icon } from './icon';
import { useTranslation } from 'react-i18next';
import { getLocalized } from '../data/i18n-util';
import { useIsMobile } from '../hooks/use-responsive';

interface Props {
    chain: ClassRecord[];
    characterLevel: number;
    activeId: number;
    onChange: (classId: number) => void;
}

/**
 * Class-tier selector — always exactly 4 entries (Vagrant/1st/2nd/3rd). On
 * desktop every entry is a full button with icon + name. On mobile only the
 * active class shows its name; the rest collapse into icon-only buttons so
 * the whole row fits narrow viewports without wrapping or truncating.
 */
export function ClassTabs({ chain, characterLevel, activeId, onChange }: Props) {
    const { i18n } = useTranslation();
    const isMobile = useIsMobile();
    const lang = i18n.language;
    const iconSize = isMobile ? 28 : 32;

    return (
        <Group justify="center" gap={isMobile ? 6 : 'xs'} wrap="nowrap">
            {chain.map((c) => {
                const locked = characterLevel < c.minLevel;
                const active = c.id === activeId;
                const title = locked ? `Unlocks at level ${c.minLevel}` : undefined;
                const label = getLocalized(c.name, lang);
                const dim = locked ? { opacity: 0.55 } : undefined;

                if (isMobile && !active) {
                    return (
                        <ActionIcon
                            key={c.id}
                            variant="default"
                            size={40}
                            onClick={() => onChange(c.id)}
                            style={dim}
                            title={title}
                            aria-label={label}
                        >
                            <Icon kind="class" name={c.icon} size={iconSize} />
                        </ActionIcon>
                    );
                }

                return (
                    <Button
                        key={c.id}
                        variant={active ? 'filled' : 'default'}
                        color={active ? 'cyan' : undefined}
                        size={isMobile ? 'sm' : 'md'}
                        leftSection={<Icon kind="class" name={c.icon} size={iconSize} />}
                        onClick={() => onChange(c.id)}
                        style={dim}
                        title={title}
                    >
                        {label}
                    </Button>
                );
            })}
        </Group>
    );
}
