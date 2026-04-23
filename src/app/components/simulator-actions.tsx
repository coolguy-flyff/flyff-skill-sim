import { ActionIcon, Button, Group, Menu, Popover, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconDotsVertical, IconLink, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './language-selector';
import { ColorSchemeToggle } from './color-scheme-toggle';
import { useIsCompact } from '../hooks/use-responsive';

interface Props {
    onShare: () => void;
    onResetAll: () => void;
    shareCopied: boolean;
}

/**
 * The top-right cluster of simulator actions. On desktop they render inline;
 * on compact viewports (portrait phones + landscape phones) everything but
 * Share collapses into a kebab menu so the header stays readable.
 */
export function SimulatorActions({ onShare, onResetAll, shareCopied }: Props) {
    const { t } = useTranslation();
    const isCompact = useIsCompact();
    // Between the lg and xl Mantine breakpoints the header is tight enough that
    // the share button's text crowds the reset/language/theme trio, but not so
    // tight that the whole cluster needs to collapse into a kebab. Drop just
    // the share label in that range — icon-only share button, rest unchanged.
    const isMidWidth = useMediaQuery('(min-width: 992px) and (max-width: 1199px)') ?? false;

    if (isCompact) {
        return (
            <Group gap={4} wrap="nowrap">
                <Popover opened={shareCopied} position="bottom-end" withArrow>
                    <Popover.Target>
                        <ActionIcon variant="default" size="lg" onClick={onShare} aria-label={t('simulator.share')}>
                            <IconLink size={18} />
                        </ActionIcon>
                    </Popover.Target>
                    <Popover.Dropdown>
                        <Text size="xs">{t('simulator.shareCopied')}</Text>
                    </Popover.Dropdown>
                </Popover>

                <Menu position="bottom-end" shadow="md" width={220} withinPortal>
                    <Menu.Target>
                        <ActionIcon variant="default" size="lg" aria-label="Menu">
                            <IconDotsVertical size={18} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onResetAll}>
                            {t('simulator.resetAll')}
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Label>{t('language.label')}</Menu.Label>
                        <div style={{ padding: '4px 12px 8px' }}>
                            <LanguageSelector compact />
                        </div>
                        <Menu.Divider />
                        <div style={{ padding: '4px 12px 8px', display: 'flex', justifyContent: 'flex-start' }}>
                            <ColorSchemeToggle />
                        </div>
                    </Menu.Dropdown>
                </Menu>
            </Group>
        );
    }

    return (
        <Group gap="xs" align="center" wrap="nowrap" justify="flex-end">
            <Popover opened={shareCopied} position="bottom" withArrow>
                <Popover.Target>
                    {isMidWidth ? (
                        <ActionIcon
                            variant="default"
                            size="lg"
                            onClick={onShare}
                            aria-label={t('simulator.share')}
                            title={t('simulator.share')}
                        >
                            <IconLink size={18} />
                        </ActionIcon>
                    ) : (
                        <Button size="sm" leftSection={<IconLink size={14} />} onClick={onShare} variant="default">
                            {t('simulator.share')}
                        </Button>
                    )}
                </Popover.Target>
                <Popover.Dropdown>
                    <Text size="xs">{t('simulator.shareCopied')}</Text>
                </Popover.Dropdown>
            </Popover>
            <Button size="sm" variant="light" color="red" onClick={onResetAll}>
                {t('simulator.resetAll')}
            </Button>
            <LanguageSelector />
            <ColorSchemeToggle />
        </Group>
    );
}
