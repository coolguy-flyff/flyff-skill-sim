import { ActionIcon, Alert, Box, Container, Group, Paper, Stack, Text, Transition } from '@mantine/core';
import { IconArrowLeft, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { ClassRecord, SkillRecord } from '@engine/types';
import { AllocationIssue } from '@engine/types';
import { classifySkill } from '@engine/variations';
import { ClassIndex, getSkillMaxLevel } from '@engine/class-tree';
import { decodeState } from '@engine/serializer';
import { useFlyffData } from '../hooks/use-flyff-data';
import { useEngineStore } from '../stores/engine-store';
import { useEngine } from '../hooks/use-engine';
import { useHashSync } from '../hooks/use-hash-sync';
import { useIsMobile } from '../hooks/use-responsive';
import { ClassTabs } from '../components/class-tabs';
import { CurrentClassDisplay } from '../components/current-class-display';
import { LevelInput } from '../components/level-input';
import { PointsIndicator } from '../components/points-indicator';
import { SkillTree } from '../components/skill-tree';
import { SkillNode } from '../components/skill-node';
import { SkillControls } from '../components/skill-controls';
import { SkillTooltipBody } from '../components/skill-tooltip';
import { MasterVariationsSection, PassiveSkillsSection } from '../components/skill-sections';
import { PageMenu } from '../components/page-menu';
import { SimulatorActions } from '../components/simulator-actions';
import { CopyrightFooter } from '../components/copyright-footer';
import { LoadingScreen } from '../components/loading-screen';
import { deslugClass } from '../data/class-slug';

export function SimulatorPage() {
    const { classKey } = useParams<{ classKey: string }>();
    const { t } = useTranslation();
    const { data, loading, error } = useFlyffData();
    const isMobile = useIsMobile();

    const englishClassName = classKey ? deslugClass(classKey) : null;

    const { engine, version } = useEngine();
    const initEngine = useEngineStore((s) => s.initEngine);
    const hydrateFromState = useEngineStore((s) => s.hydrateFromState);
    const setLevel = useEngineStore((s) => s.setLevel);
    const incrementAction = useEngineStore((s) => s.increment);
    const maxAction = useEngineStore((s) => s.max);
    const resetAction = useEngineStore((s) => s.reset);
    const resetAllAction = useEngineStore((s) => s.resetAll);
    const addPage = useEngineStore((s) => s.addPage);
    const removePage = useEngineStore((s) => s.removePage);
    const renamePage = useEngineStore((s) => s.renamePage);
    const setActivePage = useEngineStore((s) => s.setActivePage);
    const duplicatePage = useEngineStore((s) => s.duplicatePage);

    useHashSync();

    const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null);
    const [activeClassTab, setActiveClassTab] = useState<number | null>(null);
    const [shareCopied, setShareCopied] = useState(false);
    // Cache the most recent mobile-selected skill so the bottom panel keeps
    // rendering its content during the slide-down exit transition (when
    // selectedSkill has already become null). Declared up here, before any
    // early returns, so the hook order is stable across renders.
    const [lastMobileSkill, setLastMobileSkill] = useState<SkillRecord | null>(null);
    const initializedFor = useRef<string | null>(null);

    const thirdClass: ClassRecord | null = useMemo(() => {
        if (!data || !englishClassName) {
            return null;
        }

        return data.classesByEnName.get(englishClassName) ?? null;
    }, [data, englishClassName]);

    useEffect(() => {
        if (!data || !thirdClass) {
            return;
        }

        if (initializedFor.current === classKey) {
            return;
        }

        const hash = window.location.hash.slice(1);
        const decoded = hash ? decodeState(hash, { skills: data.skills }) : null;

        // URL path is the ground truth for class. If the hash was left over from
        // a different class (e.g. /c/mentalist → home → /c/slayer without the
        // hash being cleared), ignore it entirely and init fresh. This prevents
        // leaked allocations or level when switching classes.
        if (decoded && decoded.classId === thirdClass.id) {
            hydrateFromState(data, thirdClass.id, {
                classId: thirdClass.id,
                level: decoded.level,
                pages: decoded.pages,
                activePageIndex: decoded.activePageIndex,
            });
        } else {
            initEngine(data, thirdClass.id);
        }

        initializedFor.current = classKey ?? null;
    }, [data, thirdClass, classKey, hydrateFromState, initEngine]);

    const classIndex = useMemo(() => (data ? new ClassIndex(data.classes) : null), [data]);

    useEffect(() => {
        if (!engine || activeClassTab !== null) {
            return;
        }

        const current = engine.getCurrentTierClass();

        if (current) {
            setActiveClassTab(current.id);
        }
    }, [engine, version, activeClassTab]);

    // Track the most recent mobile-selected skill so the bottom panel keeps
    // its content during the slide-down exit transition. Lives up here (with
    // other top-level hooks) so the hook count stays stable across the
    // loading-vs-loaded early returns below.
    useEffect(() => {
        if (selectedSkillId == null || !isMobile || !engine) {
            return;
        }

        const skill = engine.getSkill(selectedSkillId);

        if (skill) {
            setLastMobileSkill(skill);
        }
    }, [selectedSkillId, isMobile, engine]);

    const getSelectedTabClassSkills = useCallback((): SkillRecord[] => {
        if (!engine || activeClassTab === null) {
            return [];
        }

        return engine.getSkillsForClass(activeClassTab);
    }, [engine, activeClassTab, version]);

    if (error) {
        return (
            <Container py="xl">
                <Alert color="red">Failed to load data: {error.message}</Alert>
            </Container>
        );
    }

    if (loading || !data || !engine || !thirdClass || !classIndex) {
        return <LoadingScreen />;
    }

    const state = engine.getState();
    const chain = engine.getClassChain();
    const currentTierClass = engine.getCurrentTierClass();
    const classSkills = getSelectedTabClassSkills();
    const allocations = engine.getAllocations();
    const total = engine.getTotalPoints();
    const remaining = engine.getRemainingPoints();

    const selectedSkill = selectedSkillId != null ? engine.getSkill(selectedSkillId) : null;
    const selectedIncrementIssue = selectedSkill ? engine.canIncrementCascade(selectedSkill.id).issue : null;
    const selectedDecrementIssue = selectedSkill ? engine.canDecrement(selectedSkill.id).issue : null;
    const selectedLevelGated =
        selectedIncrementIssue === AllocationIssue.CHARACTER_LEVEL_TOO_LOW ||
        selectedIncrementIssue === AllocationIssue.CLASS_NOT_LEARNED;

    const mobilePanelSkill = selectedSkill ?? lastMobileSkill;
    const mobilePanelIncrementIssue = mobilePanelSkill
        ? engine.canIncrementCascade(mobilePanelSkill.id).issue
        : null;
    const mobilePanelDecrementIssue = mobilePanelSkill
        ? engine.canDecrement(mobilePanelSkill.id).issue
        : null;

    const onClassTabChange = (classId: number) => {
        setActiveClassTab(classId);
        setSelectedSkillId(null);
    };

    const onSelectSkill = (skillId: number) => {
        setSelectedSkillId(skillId);
    };

    const onCloseSelection = () => setSelectedSkillId(null);

    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 1500);
        } catch {
            // Clipboard denied — fall back to select-and-alert flow later if needed.
        }
    };

    // Cascade-aware: OK iff clicking + would actually succeed — points, prereqs,
    // base-maxing, locks, everything checked up front. No phantom clicks.
    const canIncrementSkill = (skillId: number) => engine.canIncrementCascade(skillId).ok;

    const isThirdClassTab = activeClassTab === thirdClass.id;

    // If a base skill is selected, show its variations. If a variation is
    // selected, resolve to its base and show the sibling group — so clicking a
    // variation doesn't blank the panel it came from.
    const variationSkillsForSelected: SkillRecord[] = (() => {
        if (!isThirdClassTab || !selectedSkill) {
            return [];
        }

        const role = classifySkill(selectedSkill, classIndex);

        if (role === 'base') {
            return engine.getMasterVariations(selectedSkill.id);
        }

        if (role === 'variation') {
            const base = engine.getVariationBase(selectedSkill.id);

            return base ? engine.getMasterVariations(base.id) : [];
        }

        return [];
    })();

    // Mobile panel shows [base, ...variations] inline when a 3rd-class base or
    // variation is selected, replacing the desktop-only Master Variations grid.
    // Uses `mobilePanelSkill` (= selectedSkill ?? lastMobileSkill) so the strip
    // stays populated during the panel's slide-down exit animation.
    const mobilePanelVariationStrip: SkillRecord[] = (() => {
        if (!isMobile || !isThirdClassTab || !mobilePanelSkill) {
            return [];
        }

        const role = classifySkill(mobilePanelSkill, classIndex);

        if (role === 'base') {
            return [mobilePanelSkill, ...engine.getMasterVariations(mobilePanelSkill.id)];
        }

        if (role === 'variation') {
            const base = engine.getVariationBase(mobilePanelSkill.id);

            return base ? [base, ...engine.getMasterVariations(base.id)] : [];
        }

        return [];
    })();

    const passiveSkills: SkillRecord[] = isThirdClassTab
        ? classSkills.filter((s) => classifySkill(s, classIndex) === 'passive')
        : [];

    return (
        <>
            <Box pos="sticky" top={0} style={{ zIndex: 10 }} bg="var(--mantine-color-body)">
                <Container size="xl" py="sm">
                    {isMobile ? (
                        // Mobile: two stacked rows — identity + actions on top, stats on the second row.
                        <Stack gap="xs">
                            <Group justify="space-between" align="center" wrap="nowrap">
                                <Group gap="xs" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
                                    <ActionIcon
                                        component={Link}
                                        to="/"
                                        variant="default"
                                        size="lg"
                                        aria-label={t('simulator.back')}
                                    >
                                        <IconArrowLeft size={18} />
                                    </ActionIcon>
                                    <CurrentClassDisplay currentClass={currentTierClass} targetClass={thirdClass} />
                                </Group>
                                <Group gap={4} wrap="nowrap" align="center">
                                    <PageMenu
                                        pages={state.pages}
                                        activeIndex={state.activePageIndex}
                                        onChange={setActivePage}
                                        onAdd={addPage}
                                        onRemove={removePage}
                                        onRename={renamePage}
                                        onDuplicate={duplicatePage}
                                    />
                                    <SimulatorActions
                                        onShare={handleShare}
                                        onResetAll={resetAllAction}
                                        shareCopied={shareCopied}
                                    />
                                </Group>
                            </Group>
                            <Group justify="space-between" gap="md" align="center" wrap="nowrap">
                                <LevelInput level={state.level} onChange={setLevel} highlight={selectedLevelGated} />
                                <PointsIndicator remaining={remaining} total={total} />
                            </Group>
                        </Stack>
                    ) : (
                        // Desktop: left cluster (back + class + page menu) is pinned
                        // to the container's left edge, right cluster (share, reset,
                        // language, theme) to the right. Level/points sit at 50% via
                        // absolute positioning so neither side's width drift can move
                        // them. The relative wrapper reserves enough height for the
                        // level/points labels (input + label ≈ 58px) so they never
                        // bleed into the class tabs below.
                        <Box style={{ position: 'relative', minHeight: 60 }}>
                            <Group justify="space-between" align="flex-start" gap="md" wrap="nowrap">
                                <Group gap="sm" align="center" wrap="nowrap">
                                    <ActionIcon
                                        component={Link}
                                        to="/"
                                        variant="default"
                                        size="lg"
                                        aria-label={t('simulator.back')}
                                    >
                                        <IconArrowLeft size={18} />
                                    </ActionIcon>
                                    <CurrentClassDisplay currentClass={currentTierClass} targetClass={thirdClass} />
                                    <PageMenu
                                        pages={state.pages}
                                        activeIndex={state.activePageIndex}
                                        onChange={setActivePage}
                                        onAdd={addPage}
                                        onRemove={removePage}
                                        onRename={renamePage}
                                        onDuplicate={duplicatePage}
                                    />
                                </Group>

                                <SimulatorActions
                                    onShare={handleShare}
                                    onResetAll={resetAllAction}
                                    shareCopied={shareCopied}
                                />
                            </Group>

                            <Group
                                gap="md"
                                align="flex-start"
                                wrap="nowrap"
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: 0,
                                    transform: 'translateX(-50%)',
                                }}
                            >
                                <LevelInput level={state.level} onChange={setLevel} highlight={selectedLevelGated} />
                                <PointsIndicator remaining={remaining} total={total} />
                            </Group>
                        </Box>
                    )}
                </Container>
            </Box>

            <Container size="xl" pb="xl">
                <Stack gap="md">
                    <ClassTabs
                        chain={chain}
                        characterLevel={state.level}
                        activeId={activeClassTab ?? thirdClass.id}
                        onChange={onClassTabChange}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 320px', gap: 16 }}>
                        <Stack gap="md">
                            <SkillTree
                                skills={classSkills}
                                classIndex={classIndex}
                                allocations={allocations}
                                canIncrement={canIncrementSkill}
                                selectedSkillId={selectedSkillId}
                                onSelect={onSelectSkill}
                                onMax={maxAction}
                                scaleX={isMobile ? 1.6 : 2.6}
                                scaleY={isMobile ? 2.2 : 2.6}
                                nodeSize={isMobile ? 40 : 52}
                            />

                            {isThirdClassTab ? (
                                <>
                                    {isMobile ? null : (
                                        <MasterVariationsSection
                                            title={t('simulator.masterVariations')}
                                            emptyHint={t('simulator.selectBaseForVariations')}
                                            skills={variationSkillsForSelected}
                                            allocations={allocations}
                                            canIncrement={canIncrementSkill}
                                            selectedSkillId={selectedSkillId}
                                            onSelect={onSelectSkill}
                                            onMax={maxAction}
                                        />
                                    )}
                                    <PassiveSkillsSection
                                        title={t('simulator.passiveSkills')}
                                        skills={passiveSkills}
                                        allocations={allocations}
                                        canIncrement={canIncrementSkill}
                                        selectedSkillId={selectedSkillId}
                                        onSelect={onSelectSkill}
                                        onMax={maxAction}
                                    />
                                </>
                            ) : null}
                        </Stack>

                        {!isMobile ? (
                            <Paper p="md" radius="md" bg="var(--mantine-color-default-hover)" style={{ position: 'sticky', top: 92, alignSelf: 'start' }}>
                                {selectedSkill ? (
                                    <Stack gap="sm">
                                        <SkillControls
                                            skill={selectedSkill}
                                            currentLevel={allocations[selectedSkill.id] ?? 0}
                                            canIncrementIssue={selectedIncrementIssue}
                                            canDecrementIssue={selectedDecrementIssue}
                                            onIncrement={() => incrementAction(selectedSkill.id, 1)}
                                            onDecrement={() => incrementAction(selectedSkill.id, -1)}
                                            onMax={() => maxAction(selectedSkill.id)}
                                            onReset={() => resetAction(selectedSkill.id)}
                                        />
                                        <SkillTooltipBody
                                            skill={selectedSkill}
                                            currentLevel={allocations[selectedSkill.id] ?? 0}
                                            hideHeader
                                        />
                                    </Stack>
                                ) : (
                                    <Text size="sm" c="dimmed">
                                        {t('simulator.selectSkill')}
                                    </Text>
                                )}
                            </Paper>
                        ) : null}
                    </div>
                </Stack>
            </Container>

            <CopyrightFooter />

            {/* Fixed to the viewport bottom; slides up from below on open and
                back down on dismiss via Mantine's Transition. We render against
                `mobilePanelSkill` (cached last selection) so the slide-down
                exit doesn't blank the panel mid-animation. */}
            <Transition
                mounted={isMobile && selectedSkill !== null}
                transition="slide-up"
                duration={220}
                timingFunction="ease-out"
            >
                {(transitionStyles) => (
                    <Box
                        style={{
                            position: 'fixed',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 15,
                            borderTop: '1px solid var(--mantine-color-default-border)',
                            boxShadow: '0 -8px 24px -12px rgba(0, 0, 0, 0.55)',
                            ...transitionStyles,
                        }}
                        bg="var(--mantine-color-body)"
                    >
                        {mobilePanelSkill ? (
                            <Container size="xl" py="xs">
                                <Stack gap="xs">
                                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                                        <SkillControls
                                            skill={mobilePanelSkill}
                                            currentLevel={allocations[mobilePanelSkill.id] ?? 0}
                                            canIncrementIssue={mobilePanelIncrementIssue}
                                            canDecrementIssue={mobilePanelDecrementIssue}
                                            onIncrement={() => incrementAction(mobilePanelSkill.id, 1)}
                                            onDecrement={() => incrementAction(mobilePanelSkill.id, -1)}
                                            onMax={() => maxAction(mobilePanelSkill.id)}
                                            onReset={() => resetAction(mobilePanelSkill.id)}
                                        />
                                        <ActionIcon
                                            variant="subtle"
                                            size="sm"
                                            onClick={onCloseSelection}
                                            aria-label="Close selection"
                                        >
                                            <IconX size={16} />
                                        </ActionIcon>
                                    </Group>
                                    {mobilePanelVariationStrip.length > 0 ? (
                                        <Group gap="xs" wrap="wrap" justify="center">
                                            {mobilePanelVariationStrip.map((s) => (
                                                <SkillNode
                                                    key={s.id}
                                                    skill={s}
                                                    currentLevel={allocations[s.id] ?? 0}
                                                    maxLevel={getSkillMaxLevel(s)}
                                                    canIncrement={canIncrementSkill(s.id)}
                                                    selected={selectedSkillId === s.id}
                                                    onSelect={() => onSelectSkill(s.id)}
                                                    onContextAction={() => maxAction(s.id)}
                                                    size={40}
                                                />
                                            ))}
                                        </Group>
                                    ) : null}
                                    <SkillTooltipBody
                                        skill={mobilePanelSkill}
                                        currentLevel={allocations[mobilePanelSkill.id] ?? 0}
                                        hideHeader
                                        fullWidth
                                    />
                                </Stack>
                            </Container>
                        ) : null}
                    </Box>
                )}
            </Transition>

        </>
    );
}
