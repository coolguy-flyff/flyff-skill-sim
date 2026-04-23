import { Alert, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useFlyffData } from '../hooks/use-flyff-data';
import { ClassCard } from '../components/class-card';
import { LanguageSelector } from '../components/language-selector';
import { ColorSchemeToggle } from '../components/color-scheme-toggle';
import { CopyrightFooter } from '../components/copyright-footer';
import { LoadingScreen } from '../components/loading-screen';
import { THIRD_CLASS_NAMES } from '@engine/constants';
import type { ClassRecord } from '@engine/types';
import { slugifyClass } from '../data/class-slug';

export function HomePage() {
    const { t } = useTranslation();
    const { data, loading, error } = useFlyffData();
    const navigate = useNavigate();

    const thirdClasses: Array<{ thirdClass: ClassRecord; parent: ClassRecord | undefined }> = [];

    if (data) {
        for (const name of THIRD_CLASS_NAMES) {
            const tc = data.classesByEnName.get(name);

            if (!tc) {
                continue;
            }

            const parent = tc.parent != null ? data.classesById.get(tc.parent) : undefined;
            thirdClasses.push({ thirdClass: tc, parent });
        }
    }

    const handlePick = (thirdClass: ClassRecord) => {
        navigate(`/c/${slugifyClass(thirdClass.name.en)}`);
    };

    if (loading) {
        return <LoadingScreen />;
    }

    return (
        <>
            <Container size="lg" py="md">
                <Group justify="flex-end" gap="xs">
                    <LanguageSelector compact />
                    <ColorSchemeToggle />
                </Group>
            </Container>
            <Container size="lg" py="xl">
                <Stack align="center" gap="md" mb="xl">
                    <Title order={1} ta="center">
                        {t('app.title')}
                    </Title>
                    <Text c="dimmed" ta="center" size="lg">
                        {t('app.subtitle')}
                    </Text>
                </Stack>

                <Text size="sm" c="dimmed" ta="center" mb="lg">
                    {t('home.pickClass')}
                </Text>

                {error ? (
                    <Alert color="red" title="Failed to load data">
                        {error.message}
                    </Alert>
                ) : null}

                {data ? (
                    <SimpleGrid cols={{ base: 1, xs: 2, sm: 2, md: 4 }} spacing="md">
                        {thirdClasses.map(({ thirdClass, parent }) => (
                            <ClassCard
                                key={thirdClass.id}
                                thirdClass={thirdClass}
                                parentClass={parent}
                                onSelect={handlePick}
                            />
                        ))}
                    </SimpleGrid>
                ) : null}
            </Container>
            <CopyrightFooter />
        </>
    );
}
