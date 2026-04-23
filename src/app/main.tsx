import React from 'react';
import ReactDOM from 'react-dom/client';
import '@mantine/core/styles.css';
import './styles/global.css';
import { App } from './App';
import { loadFlyffData, onLoadProgress } from './data/flyff-data';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);

// Wire the prerender overlay's progress bar directly to fetch progress.
// First progress event swaps the indeterminate animation for a real width
// transition; subsequent events update the width as bytes arrive.
const overlay = document.getElementById('prerender-loading-overlay');
const overlayBar = overlay?.querySelector<HTMLElement>('.bar > span') ?? null;
let switchedToDeterminate = false;

onLoadProgress((fraction) => {
    if (!overlayBar) {
        return;
    }

    if (!switchedToDeterminate && fraction > 0) {
        switchedToDeterminate = true;
        overlayBar.style.animation = 'none';
        overlayBar.style.transform = 'translateX(0)';
        overlayBar.style.transition = 'width 200ms ease-out';
        overlayBar.style.width = '0%';
        // Force reflow so the width transition starts from 0% rather than the
        // 30% the indeterminate keyframe was sitting at.
        void overlayBar.offsetWidth;
    }

    if (switchedToDeterminate) {
        overlayBar.style.width = `${(fraction * 100).toFixed(1)}%`;
    }
});

// Drive overlay removal from data-readiness rather than React mount time —
// by the time data resolves, the React tree's first render with `data`
// populated matches the prerendered DOM, so fading the overlay reveals
// consistent content with no visible swap. The .catch swallows fetch errors
// here only because <App />'s useFlyffData will surface the same error
// through the in-app error UI.
loadFlyffData()
    .finally(() => {
        if (!overlay) {
            return;
        }

        overlay.style.opacity = '0';
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        // Safety net in case the transitionend never fires (reduced-motion,
        // tab backgrounded, etc.) — still tear it down after the fade window.
        setTimeout(() => overlay.remove(), 400);
    })
    .catch(() => {
        /* handled by useFlyffData's error state inside the React tree */
    });
