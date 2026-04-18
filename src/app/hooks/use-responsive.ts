import { useMediaQuery } from '@mantine/hooks';

export function useIsMobile(): boolean {
    return useMediaQuery('(max-width: 768px)') ?? false;
}
