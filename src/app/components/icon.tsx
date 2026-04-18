import type { CSSProperties } from 'react';

export type IconKind = 'skill' | 'class';

interface IconProps {
    kind: IconKind;
    name: string;
    /** Rendered pixel size. Icons scale crisply via CSS vars. */
    size?: number;
    title?: string;
    className?: string;
    style?: CSSProperties;
}

/**
 * Renders a single icon from the generated sprite sheet. The CSS file emitted
 * by the scraper defines --icon-width/--icon-height/--icon-offset-x/y per icon,
 * and the base rule multiplies them against --scale-x/--scale-y to produce the
 * final size. Setting --width / --height here drives the scale.
 */
export function Icon({ kind, name, size = 48, title, className, style }: IconProps) {
    const vars: CSSProperties = {
        ['--width' as string]: size,
        ['--height' as string]: size,
        ...style,
    };

    const classes = [`${kind}-icon`, className].filter(Boolean).join(' ');

    return <span className={classes} data-icon={name} title={title} style={vars} aria-label={title} role="img" />;
}
