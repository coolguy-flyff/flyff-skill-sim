import { Container, Loader, Progress, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface LoadingScreenProps {
    /** i18n key for the message (defaults to "Loading skill data…"). */
    messageKey?: string;
}

/**
 * Full-viewport centered loader used while the simulator waits on data. Visual
 * language mirrors the prerender overlay (spinner + branded message + animated
 * indeterminate bar) so the React → DOM swap on initial load is imperceptible.
 */
export function LoadingScreen({ messageKey = 'loading.skillData' }: LoadingScreenProps) {
    const { t } = useTranslation();

    return (
        <Container
            size="sm"
            style={{
                // `flex: 1` (not minHeight: 100vh) so we fill whatever vertical
                // space the parent flex column provides without pushing the
                // document past viewport height — that would surface a
                // scrollbar even while the prerender overlay is up, since the
                // overlay is `position: fixed` and doesn't suppress body
                // scroll on its own.
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Stack align="center" gap="lg" w="100%" maw={320}>
                <Loader size="lg" />
                <Text size="md" c="dimmed" ta="center">
                    {t(messageKey)}
                </Text>
                <Progress value={100} animated striped w="100%" />
            </Stack>
        </Container>
    );
}
