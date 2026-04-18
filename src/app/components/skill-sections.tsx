import { Group, Paper, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SkillRecord } from '@engine/types';
import { getSkillMaxLevel } from '@engine/class-tree';
import { SkillNode } from './skill-node';
import { useIsMobile } from '../hooks/use-responsive';

interface Props {
    title: string;
    emptyHint?: string;
    skills: SkillRecord[];
    allocations: Record<number, number>;
    canIncrement: (skillId: number) => boolean;
    selectedSkillId: number | null;
    onSelect: (skillId: number) => void;
    onMax?: (skillId: number) => void;
}

function SkillGrid({ title, emptyHint, skills, allocations, canIncrement, selectedSkillId, onSelect, onMax }: Props) {
    const { t } = useTranslation();
    const isMobile = useIsMobile();

    return (
        <Paper p={isMobile ? 'xs' : 'md'} radius="md" bg="var(--mantine-color-default-hover)">
            <Stack gap="sm" align="center">
                <Text fw={600} size="sm" ta="center">
                    {title}
                </Text>
                {skills.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center">
                        {emptyHint ?? t('simulator.selectSkill')}
                    </Text>
                ) : (
                    // Constrain to tree canvas width so 9+ icons wrap onto a 2nd row.
                    <Group justify="center" gap={isMobile ? 'xs' : 'md'} wrap="wrap" maw={572}>
                        {skills.map((skill) => {
                            const level = allocations[skill.id] ?? 0;

                            return (
                                <SkillNode
                                    key={skill.id}
                                    skill={skill}
                                    currentLevel={level}
                                    maxLevel={getSkillMaxLevel(skill)}
                                    canIncrement={canIncrement(skill.id)}
                                    selected={selectedSkillId === skill.id}
                                    onSelect={() => onSelect(skill.id)}
                                    onContextAction={onMax ? () => onMax(skill.id) : undefined}
                                    size={isMobile ? 40 : 48}
                                />
                            );
                        })}
                    </Group>
                )}
            </Stack>
        </Paper>
    );
}

export function MasterVariationsSection(props: Props) {
    return <SkillGrid {...props} />;
}

export function PassiveSkillsSection(props: Props) {
    return <SkillGrid {...props} />;
}
