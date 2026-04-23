import { ActionIcon, Button, Group } from '@mantine/core';
import type { ClassRecord } from '@engine/types';
import { Icon } from './icon';
import { useTranslation } from 'react-i18next';
import { getLocalized } from '../data/i18n-util';
import { useIsCompact, useIsMobile } from '../hooks/use-responsive';

interface Props {
    chain: ClassRecord[];
    characterLevel: number;
    activeId: number;
    onChange: (classId: number) => void;
}

/**
 * Class-tier selector — always exactly 4 entries (Vagrant/1st/2nd/3rd). On
 * narrow widths (portrait phones) only the active class shows its name and
 * the rest collapse into icon-only buttons. Compact-but-not-narrow viewports
 * (landscape phones) keep the names — there's room for them — but borrow the
 * smaller button/icon sizing so the row stays tight.
 */
export function ClassTabs({ chain, characterLevel, activeId, onChange }: Props) {
    const { i18n } = useTranslation();
    const isMobile = useIsMobile();
    const isCompact = useIsCompact();
    const lang = i18n.language;
    const iconSize = isCompact ? 28 : 32;

    return (
        <Group justify="center" gap={isCompact ? 6 : 'xs'} wrap="nowrap">
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
                        size={isCompact ? 'sm' : 'md'}
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
