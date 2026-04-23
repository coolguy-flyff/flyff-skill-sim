import { useMediaQuery } from '@mantine/hooks';

/**
 * Layout decisions split along two axes so landscape phones can get the
 * desktop *structure* (right side-pane, single-row header, full class-tab
 * labels) while still benefiting from the *density* tweaks mobile uses
 * (smaller skill nodes, inline labels, kebab-menu actions).
 *
 * - `useIsMobile` (width ≤ 768px) = "needs the bottom-panel layout".
 *   Drives structural choices: bottom sheet vs right pane, two-row header,
 *   class tabs collapsing labels to icon-only when not active.
 *
 * - `useIsCompact` (either dimension constrained) = "needs cramped UI".
 *   Drives density choices: icon size, button size, inline-vs-stacked
 *   labels, kebab menu in the action cluster.
 *
 * Modern phones max out around ~480px height in landscape, so the 600px
 * height bound gives a safe margin without pulling in regular tablets
 * (iPad Mini landscape is 768px tall).
 */
export function useIsMobile(): boolean {
    return useMediaQuery('(max-width: 768px)') ?? false;
}

export function useIsCompact(): boolean {
    // 991 covers anything below Mantine's `lg` breakpoint (992). That's the
    // viewport width below which the fixed-width skill-tree canvas (at full
    // desktop scaleX=2.6 → 572px) can't fit inside its 1fr grid column next
    // to the 320px side pane, even though there's enough room for the
    // side-pane layout itself. Above 992, everything fits comfortably at
    // desktop sizing, so we let it through.
    const isNarrow = useMediaQuery('(max-width: 991px)') ?? false;
    const isShort = useMediaQuery('(max-height: 600px)') ?? false;

    return isNarrow || isShort;
}
