import { Component, lazy, Suspense } from 'react';
import LandingPage from './components/LandingPage';

const Studio = lazy(() => import('./components/Studio'));
const Showcase = lazy(() => import('./components/Showcase'));
const WidgetLab = lazy(() => import('./components/WidgetLab'));
const AccountPage = lazy(() => import('./components/AccountPage'));
const statusStyle = {
    minHeight: '100dvh', display: 'grid', placeContent: 'center', gap: 16,
    padding: 32, background: '#151714', color: '#f0f0e9',
    fontFamily: 'Inter, sans-serif', textAlign: 'center',
};

class AppBoundary extends Component {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error) {
        console.error('qorpStreamer failed to render', error);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div role="alert" style={statusStyle}>
                <h1 style={{ fontSize: 24 }}>Não foi possível abrir o qorpStreamer</h1>
                <p>Recarregue a página para tentar novamente.</p>
                <button onClick={() => window.location.reload()} style={{
                    minHeight: 48, padding: '12px 24px', background: '#d7f77b',
                    color: '#151714', border: 0, cursor: 'pointer', fontWeight: 600,
                }}>Recarregar</button>
                <a href="/" style={{ color: '#f0f0e9' }}>Voltar ao início</a>
            </div>
        );
    }
}

function App() {
    const params = new URLSearchParams(window.location.search);
    const isStudio = ['room', 'obs', 'studio', 'project'].some(key => params.has(key));
    const loading = params.has('obs') ? null : (
        <div role="status" style={statusStyle}>Abrindo o estúdio…</div>
    );
    return (
        <AppBoundary>
            <Suspense fallback={loading}>
                {params.has('conta') ? <AccountPage /> : params.has('widgetlab') ? <WidgetLab /> : params.has('showcase') ? <Showcase /> : isStudio ? <Studio /> : <LandingPage />}
            </Suspense>
        </AppBoundary>
    );
}

export default App;
