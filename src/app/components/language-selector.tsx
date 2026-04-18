import { Button, Menu } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_UI_LANGUAGES } from '../i18n';

const LANGUAGE_LABELS: Record<string, string> = {
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    cns: '简体中文',
    sp: 'Español',
};

const LANGUAGE_DATA = SUPPORTED_UI_LANGUAGES.map((code) => ({
    value: code,
    label: LANGUAGE_LABELS[code] ?? code,
}));

/**
 * Language dropdown — click-to-open menu listing every UI-translated locale.
 * We only expose languages that have a local `locales/*.json`; everything else
 * would just fall back to English and confuse the picker. Flags intentionally
 * omitted (country flags for languages get messy around Chinese/Spanish etc.).
 */
export function LanguageSelector({ compact }: { compact?: boolean }) {
    const { i18n, t } = useTranslation();
    const current = LANGUAGE_DATA.find((l) => l.value === i18n.language) ?? LANGUAGE_DATA[0];

    return (
        <Menu shadow="md" width={180} position="bottom-end" withinPortal>
            <Menu.Target>
                <Button
                    size={compact ? 'xs' : 'sm'}
                    variant="default"
                    rightSection={<IconChevronDown size={12} />}
                    aria-label={t('language.label')}
                    style={{ flex: '0 0 auto' }}
                >
                    {current.label}
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                {LANGUAGE_DATA.map((lang) => (
                    <Menu.Item key={lang.value} onClick={() => void i18n.changeLanguage(lang.value)}>
                        {lang.label}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
}
