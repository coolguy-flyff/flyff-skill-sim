import { useMemo } from 'react';
import type { SkillRecord } from '@engine/types';
import { SkillNode } from './skill-node';
import { classifySkill } from '@engine/variations';
import { ClassIndex, getSkillMaxLevel } from '@engine/class-tree';
import classes from './skill-tree.module.css';

interface Props {
    skills: SkillRecord[];
    classIndex: ClassIndex;
    allocations: Record<number, number>;
    canIncrement: (skillId: number) => boolean;
    selectedSkillId: number | null;
    onSelect: (skillId: number) => void;
    onMax?: (skillId: number) => void;
    /** Pixel scale applied to treePosition.x (horizontal columns). */
    scaleX?: number;
    /** Pixel scale applied to treePosition.y (vertical rows). Useful on mobile
     *  where we want extra breathing room between rows without widening the
     *  canvas past the viewport. */
    scaleY?: number;
    /** Size of each skill node in pixels. */
    nodeSize?: number;
}

interface Node {
    skill: SkillRecord;
    x: number;
    y: number;
}

export function SkillTree({
    skills,
    classIndex,
    allocations,
    canIncrement,
    selectedSkillId,
    onSelect,
    onMax,
    scaleX = 2.6,
    scaleY = 2.6,
    nodeSize = 52,
}: Props) {
    const { nodes, bounds } = useMemo(() => {
        // The canvas is pinned to a fixed 5-column game width — 5 columns covers
        // the widest tree in the data (Elementor/Billposter at x=200). Narrower
        // trees center within it, so the container doesn't resize per class and
        // every tree looks balanced.
        const FIXED_MAX_X = 200;
        const COLUMN_SPACING = 50;

        const raw: Node[] = [];

        for (const skill of skills) {
            const role = classifySkill(skill, classIndex);

            if (role === 'passive' || role === 'variation') {
                continue;
            }

            const pos = skill.treePosition ?? { x: 0, y: 0 };
            raw.push({ skill, x: pos.x, y: pos.y });
        }

        // Some classes declare multiple bases at the same grid cell (most often
        // (0,0) — Arcanist has 4). Nudge duplicates right by one column so they
        // don't stack on top of each other.
        const placed = new Map<string, number>();
        const nudged: Node[] = raw.map((n) => {
            const key = `${n.x},${n.y}`;
            const count = placed.get(key) ?? 0;
            placed.set(key, count + 1);

            return count === 0 ? n : { ...n, x: n.x + count * COLUMN_SPACING };
        });

        let actualMaxX = 0;
        let maxY = 0;

        for (const n of nudged) {
            if (n.x > actualMaxX) {
                actualMaxX = n.x;
            }

            if (n.y > maxY) {
                maxY = n.y;
            }
        }

        // Center content inside the fixed-width canvas.
        const xShift = Math.max(0, (FIXED_MAX_X - actualMaxX) / 2);
        const nodes: Node[] = nudged.map((n) => ({ ...n, x: n.x + xShift }));

        return {
            nodes,
            bounds: {
                width: FIXED_MAX_X * scaleX + nodeSize,
                height: (maxY + 10) * scaleY + nodeSize,
            },
        };
    }, [skills, classIndex, scaleX, scaleY, nodeSize]);

    const connectorPaths = useMemo(() => {
        const nodeById = new Map(nodes.map((n) => [n.skill.id, n] as const));
        const paths: Array<{ key: string; d: string; active: boolean }> = [];

        for (const node of nodes) {
            for (const req of node.skill.requirements ?? []) {
                const source = nodeById.get(req.skill);

                if (!source) {
                    continue;
                }

                const sx = source.x * scaleX + nodeSize / 2;
                const sy = source.y * scaleY + nodeSize / 2;
                const tx = node.x * scaleX + nodeSize / 2;
                const ty = node.y * scaleY + nodeSize / 2;
                const active = (allocations[req.skill] ?? 0) >= req.level;
                paths.push({
                    key: `${source.skill.id}-${node.skill.id}`,
                    d: `M ${sx} ${sy} L ${tx} ${ty}`,
                    active,
                });
            }
        }

        return paths;
    }, [nodes, scaleX, scaleY, nodeSize, allocations]);

    return (
        <div className={classes.wrapper}>
            <div className={classes.canvas} style={{ width: bounds.width, height: bounds.height }}>
                <svg
                    className={classes.connectors}
                    width={bounds.width}
                    height={bounds.height}
                    viewBox={`0 0 ${bounds.width} ${bounds.height}`}
                >
                    {connectorPaths.map((p) => (
                        <path
                            key={p.key}
                            d={p.d}
                            strokeWidth={2}
                            fill="none"
                            className={p.active ? classes.connectorActive : classes.connector}
                        />
                    ))}
                </svg>
                {nodes.map((node) => {
                    const level = allocations[node.skill.id] ?? 0;

                    return (
                        <div
                            key={node.skill.id}
                            className={classes.nodePlacement}
                            style={{ left: node.x * scaleX, top: node.y * scaleY }}
                        >
                            <SkillNode
                                skill={node.skill}
                                currentLevel={level}
                                maxLevel={getSkillMaxLevel(node.skill)}
                                canIncrement={canIncrement(node.skill.id)}
                                selected={selectedSkillId === node.skill.id}
                                onSelect={() => onSelect(node.skill.id)}
                                onContextAction={onMax ? () => onMax(node.skill.id) : undefined}
                                size={nodeSize}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
