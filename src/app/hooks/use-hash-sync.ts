import { useEffect, useRef } from 'react';
import { encodeState } from '@engine/serializer';
import { useEngineStore } from '../stores/engine-store';

/**
 * Keeps the URL hash in sync with the engine state. Uses `history.replaceState`
 * to avoid polluting history or triggering scroll. Runs only after the engine
 * is initialized.
 */
export function useHashSync() {
    const engine = useEngineStore((s) => s.engine);
    const version = useEngineStore((s) => s.version);
    const lastHash = useRef<string>('');

    useEffect(() => {
        if (!engine) {
            return;
        }

        const encoded = encodeState(engine.getState());

        if (encoded === lastHash.current) {
            return;
        }

        lastHash.current = encoded;
        const newUrl = `${window.location.pathname}${window.location.search}#${encoded}`;
        window.history.replaceState(null, '', newUrl);
    }, [engine, version]);
}
