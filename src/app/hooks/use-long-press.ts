import { useCallback, useRef } from 'react';

/**
 * Detects a long-press gesture on touch devices. Returns handlers to spread
 * onto a button/element. The callback fires after `thresholdMs` of continuous
 * contact. A move or early release cancels the timer.
 *
 * Intentionally touch-only: mouse-down long-press would interfere with normal
 * click semantics on desktop (where we use `onContextMenu` for right-click).
 */
export function useLongPress(onLongPress: () => void, thresholdMs = 500) {
    const timer = useRef<number | null>(null);
    const triggered = useRef(false);

    const clear = useCallback(() => {
        if (timer.current != null) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }
    }, []);

    const onTouchStart = useCallback(() => {
        triggered.current = false;
        clear();
        timer.current = window.setTimeout(() => {
            triggered.current = true;
            onLongPress();
        }, thresholdMs);
    }, [clear, onLongPress, thresholdMs]);

    const onTouchEnd = useCallback(() => {
        clear();
    }, [clear]);

    const onTouchMove = useCallback(() => {
        clear();
    }, [clear]);

    /** True if the last touch sequence fired the long-press — useful to swallow
     *  the subsequent tap/click. */
    const wasTriggered = useCallback(() => triggered.current, []);

    return { onTouchStart, onTouchEnd, onTouchMove, onTouchCancel: onTouchEnd, wasTriggered };
}
