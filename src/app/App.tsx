import { MantineProvider, createTheme } from '@mantine/core';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { i18nReady } from './i18n';

void i18nReady;

const HomePage = lazy(() => import('./pages/home').then((m) => ({ default: m.HomePage })));
const SimulatorPage = lazy(() => import('./pages/simulator').then((m) => ({ default: m.SimulatorPage })));

const theme = createTheme({
    primaryColor: 'cyan',
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    defaultRadius: 'md',
});

export function App() {
    return (
        <MantineProvider theme={theme} defaultColorScheme="dark">
            <BrowserRouter>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <Suspense fallback={null}>
                        <Routes>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/c/:classKey" element={<SimulatorPage />} />
                            <Route path="*" element={<HomePage />} />
                        </Routes>
                    </Suspense>
                </div>
            </BrowserRouter>
        </MantineProvider>
    );
}
