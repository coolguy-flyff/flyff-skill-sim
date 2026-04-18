import { Button, Menu, TextInput } from '@mantine/core';
import { IconCheck, IconChevronDown, IconCopy, IconPencil, IconPlus, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SkillPage } from '@engine/types';
import { MAX_SKILL_PAGES, SKILL_PAGE_NAME_MAX_LENGTH } from '@engine/constants';
import { useIsMobile } from '../hooks/use-responsive';

interface Props {
    pages: SkillPage[];
    activeIndex: number;
    onChange: (index: number) => void;
    onAdd: (name?: string) => void;
    onRemove: (index: number) => void;
    onRename: (index: number, name: string) => void;
    onDuplicate: (index: number) => void;
}

export function PageMenu({ pages, activeIndex, onChange, onAdd, onRemove, onRename, onDuplicate }: Props) {
    const { t } = useTranslation();
    const isMobile = useIsMobile();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');

    const activePage = pages[activeIndex];
    const activeLabel = activePage?.name || `${t('simulator.pageLabel')} ${activeIndex + 1}`;

    const commit = () => {
        onRename(activeIndex, draft.trim());
        setEditing(false);
        setDraft('');
    };

    const cancel = () => {
        setEditing(false);
        setDraft('');
    };

    if (editing) {
        return (
            <TextInput
                size={isMobile ? 'xs' : 'sm'}
                w={isMobile ? 120 : 160}
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value.slice(0, SKILL_PAGE_NAME_MAX_LENGTH))}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        commit();
                    }

                    if (e.key === 'Escape') {
                        cancel();
                    }
                }}
            />
        );
    }

    return (
        <Menu shadow="md" width={220} position="bottom-end" withinPortal>
            <Menu.Target>
                <Button
                    size={isMobile ? 'xs' : 'sm'}
                    variant="default"
                    rightSection={<IconChevronDown size={12} />}
                    style={{ flex: '0 0 auto' }}
                >
                    <span
                        style={{
                            display: 'inline-block',
                            maxWidth: isMobile ? 90 : 90,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'middle',
                        }}
                    >
                        {activeLabel}
                    </span>
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                {pages.map((page, i) => (
                    <Menu.Item
                        key={i}
                        leftSection={
                            i === activeIndex ? (
                                <IconCheck size={14} />
                            ) : (
                                <span style={{ display: 'inline-block', width: 14 }} />
                            )
                        }
                        onClick={() => onChange(i)}
                    >
                        {page.name || `${t('simulator.pageLabel')} ${i + 1}`}
                    </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item
                    leftSection={<IconPencil size={14} />}
                    onClick={() => {
                        setEditing(true);
                        setDraft(activePage?.name ?? '');
                    }}
                >
                    {t('simulator.renamePage')}
                </Menu.Item>
                <Menu.Item
                    leftSection={<IconCopy size={14} />}
                    onClick={() => onDuplicate(activeIndex)}
                    disabled={pages.length >= MAX_SKILL_PAGES}
                >
                    {t('simulator.duplicatePage')}
                </Menu.Item>
                <Menu.Item
                    leftSection={<IconX size={14} />}
                    color="red"
                    onClick={() => onRemove(activeIndex)}
                    disabled={pages.length <= 1}
                >
                    {t('simulator.removePage')}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                    leftSection={<IconPlus size={14} />}
                    onClick={() => onAdd()}
                    disabled={pages.length >= MAX_SKILL_PAGES}
                >
                    {t('simulator.addPage')}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
}
