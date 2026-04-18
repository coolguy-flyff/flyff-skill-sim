import { Anchor, Container, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export const AUTHOR_NAME = 'coolguy';
export const AUTHOR_DISCORD = 'c.o.o.l.g.u.y';
export const SOURCE_CODE_URL = 'https://github.com/coolguy-flyff/flyff-skill-sim';

export function CopyrightFooter() {
    const { t } = useTranslation();

    return (
        <Container size="lg" py="md" component="footer" mt="auto">
            <Stack gap={4}>
                <Text size="sm">
                    {t('footer.madeBy')} <strong>{AUTHOR_NAME}</strong> ({t('footer.discord')}: <code>{AUTHOR_DISCORD}</code>) ·{' '}
                    <Anchor href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer">
                        {t('footer.sourceCode')}
                    </Anchor>
                </Text>
                <Text size="sm" c="dimmed">
                    {t('footer.disclaimer')}{' '}
                    <Anchor href="https://universe.flyff.com" target="_blank" rel="noopener noreferrer">
                        {t('footer.officialSite')}
                    </Anchor>
                </Text>
                <Text size="xs" c="dimmed">
                    {t('footer.legal')}
                </Text>
            </Stack>
        </Container>
    );
}
