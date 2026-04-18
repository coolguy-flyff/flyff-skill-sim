import { useEffect, useState } from 'react';
import { loadFlyffData, type FlyffData } from '../data/flyff-data';

export interface FlyffDataState {
    data: FlyffData | null;
    loading: boolean;
    error: Error | null;
}

export function useFlyffData(): FlyffDataState {
    const [state, setState] = useState<FlyffDataState>({ data: null, loading: true, error: null });

    useEffect(() => {
        let cancelled = false;
        loadFlyffData()
            .then((data) => {
                if (!cancelled) {
                    setState({ data, loading: false, error: null });
                }
            })
            .catch((err: Error) => {
                if (!cancelled) {
                    setState({ data: null, loading: false, error: err });
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return state;
}
