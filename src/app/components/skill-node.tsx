import { Tooltip } from '@mantine/core';
import type { SkillRecord } from '@engine/types';
import { Icon } from './icon';
import { SkillTooltipBody } from './skill-tooltip';
import { useLongPress } from '../hooks/use-long-press';
import classes from './skill-node.module.css';

interface Props {
    skill: SkillRecord;
    currentLevel: number;
    maxLevel: number;
    canIncrement: boolean;
    selected: boolean;
    onSelect: () => void;
    /** Right-click (desktop) / long-press (mobile). Typically wired to max. */
    onContextAction?: () => void;
    size?: number;
}

export function SkillNode({
    skill,
    currentLevel,
    maxLevel,
    canIncrement,
    selected,
    onSelect,
    onContextAction,
    size = 48,
}: Props) {
    const allocated = currentLevel > 0;
    const maxed = currentLevel >= maxLevel;
    const longPress = useLongPress(() => onContextAction?.());
    const nodeClasses = [
        classes.node,
        allocated ? classes.allocated : '',
        maxed ? classes.maxed : '',
        !allocated && !canIncrement ? classes.locked : '',
        selected ? classes.selected : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <Tooltip
            label={<SkillTooltipBody skill={skill} currentLevel={currentLevel} />}
            events={{ hover: true, focus: false, touch: false }}
            position="top"
            withArrow
            withinPortal
            openDelay={200}
            closeDelay={50}
            color="dark"
            p="sm"
            radius="md"
        >
            <button
                type="button"
                className={nodeClasses}
                onClick={(e) => {
                    // If a long-press just fired, swallow the trailing synthetic click.
                    if (longPress.wasTriggered()) {
                        e.preventDefault();
                        return;
                    }

                    onSelect();
                }}
                onContextMenu={(e) => {
                    if (!onContextAction) {
                        return;
                    }

                    e.preventDefault();
                    onContextAction();
                }}
                onTouchStart={longPress.onTouchStart}
                onTouchEnd={longPress.onTouchEnd}
                onTouchMove={longPress.onTouchMove}
                onTouchCancel={longPress.onTouchCancel}
                style={{ width: size, height: size, touchAction: 'manipulation' }}
                data-skill-id={skill.id}
                aria-label={skill.name.en}
            >
                <Icon kind="skill" name={skill.icon} size={size} />
                <span className={classes.badge}>
                    {maxed ? 'MAX' : `${currentLevel}/${maxLevel}`}
                </span>
            </button>
        </Tooltip>
    );
}
