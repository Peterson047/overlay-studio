// Etapa 0 — laboratório de widgets externos (docs/PRODUTO.md, seção 12).
//
// Protótipo descartável para validar se widgets de terceiros (Streamlabs
// primeiro) funcionam dentro do player do qorp no OBS. Não usa conta, banco
// nem API: a configuração vai no fragmento (#) da URL, que o navegador nunca
// envia ao servidor, então a URL privada do widget não aparece em logs.
//
//   /?widgetlab          → montar a configuração e copiar o link do OBS
//   /?widgetlab=play#…   → player 1920×1080 transparente para o OBS
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULTS, decodeConfig, encodeConfig, validateWidgetUrl } from '../utils/widgetLab';

const CANVAS = { w: 1920, h: 1080 };

function WidgetFrame({ cfg }) {
    const scale = cfg.w / cfg.vw;
    return (
        <div style={{
            position: 'absolute', left: cfg.x, top: cfg.y,
            width: cfg.w, height: cfg.vh * scale, overflow: 'hidden',
        }}>
            <iframe
                title="Widget externo"
                src={cfg.url}
                width={cfg.vw}
                height={cfg.vh}
                allow="autoplay"
                referrerPolicy="no-referrer"
                style={{
                    border: 0, background: 'transparent', colorScheme: 'normal',
                    transform: `scale(${scale})`, transformOrigin: '0 0',
                }}
            />
        </div>
    );
}

// Duas "cenas" simples só para testar se o widget continua montado (sem
// recarregar e sem perder eventos) quando a cena do overlay muda.
function SceneDecor({ index }) {
    const label = index === 0 ? 'Cena A' : 'Cena B';
    const color = index === 0 ? '#ff7956' : '#d7f77b';
    return (
        <div style={{
            position: 'absolute', left: 48, top: 48, padding: '12px 20px',
            background: '#151714cc', color, font: '600 28px Inter, sans-serif',
            border: `3px solid ${color}`,
        }}>{label}</div>
    );
}

function Player() {
    const cfg = useMemo(() => decodeConfig(window.location.hash), []);
    const [scene, setScene] = useState(0);

    useEffect(() => {
        if (!cfg?.cycle) return undefined;
        const id = setInterval(() => setScene(s => (s + 1) % 2), cfg.cycle * 1000);
        return () => clearInterval(id);
    }, [cfg]);

    const error = !cfg ? 'Configuração ausente.' : validateWidgetUrl(cfg.url);
    return (
        <div style={{ position: 'relative', width: CANVAS.w, height: CANVAS.h, overflow: 'hidden' }}>
            {error ? (
                <div role="alert" style={{
                    position: 'absolute', left: 48, top: 48, padding: 16,
                    background: '#151714', color: '#ff7956', font: '600 24px Inter, sans-serif',
                }}>Laboratório de widgets: {error}</div>
            ) : (
                <>
                    {cfg.cycle > 0 && <SceneDecor index={scene} />}
                    {/* O iframe fica fora da troca de cena para continuar montado. */}
                    <WidgetFrame cfg={cfg} />
                </>
            )}
        </div>
    );
}

function Preview({ cfg }) {
    const box = useRef(null);
    const [scale, setScale] = useState(0.4);
    useEffect(() => {
        const el = box.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / CANVAS.w));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return (
        <div ref={box} style={{
            width: '100%', aspectRatio: '16 / 9', position: 'relative', overflow: 'hidden',
            background: 'repeating-conic-gradient(#2a2d28 0% 25%, #20231f 0% 50%) 0 0 / 32px 32px',
        }}>
            <div style={{ width: CANVAS.w, height: CANVAS.h, transformOrigin: '0 0', transform: `scale(${scale})` }}>
                <WidgetFrame cfg={cfg} />
            </div>
        </div>
    );
}

const field = { display: 'grid', gap: 6, fontSize: 14 };
const input = {
    minHeight: 40, padding: '0 12px', background: '#20231f', color: '#f0f0e9',
    border: '1px solid #3a3e37', font: 'inherit',
};

function Setup() {
    const [cfg, setCfg] = useState(() => decodeConfig(window.location.hash) || DEFAULTS);
    const [copied, setCopied] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const urlError = cfg.url ? validateWidgetUrl(cfg.url) : null;
    const ready = cfg.url && !urlError;
    const obsLink = `${window.location.origin}/?widgetlab=play#${encodeConfig(cfg)}`;

    const set = key => e => {
        const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
        setCopied(false);
        setCfg(c => ({ ...c, [key]: value }));
    };

    const copy = async () => {
        await navigator.clipboard.writeText(obsLink);
        setCopied(true);
    };

    const num = (key, label) => (
        <label style={field}>{label}
            <input type="number" value={cfg[key]} onChange={set(key)} style={input} />
        </label>
    );

    return (
        <div style={{
            height: '100dvh', overflowY: 'auto', boxSizing: 'border-box',
            background: '#151714', color: '#f0f0e9',
            fontFamily: 'Inter, sans-serif', padding: 32,
        }}>
            <div style={{ maxWidth: 880, margin: '0 auto', display: 'grid', gap: 24 }}>
                <header style={{ display: 'grid', gap: 8 }}>
                    <p style={{ color: '#d7f77b', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Etapa 0 · protótipo interno
                    </p>
                    <h1 style={{ fontSize: 28, margin: 0 }}>Laboratório de widgets externos</h1>
                    <p style={{ color: '#b9bbb2', margin: 0 }}>
                        Cole a URL de exibição de um widget (ex.: Alert Box do Streamlabs), copie o link
                        e adicione como Browser Source 1920×1080 no OBS. A URL fica só no link copiado:
                        não é enviada ao servidor. Não compartilhe o link.
                    </p>
                </header>

                <label style={field}>URL do widget
                    <input
                        type="password" autoComplete="off" spellCheck={false}
                        placeholder="https://streamlabs.com/alert-box/v3/…"
                        value={cfg.url} onChange={set('url')} style={input}
                    />
                    {urlError && <span role="alert" style={{ color: '#ff7956' }}>{urlError}</span>}
                </label>

                <fieldset style={{ border: '1px solid #3a3e37', padding: 16, display: 'grid', gap: 16 }}>
                    <legend style={{ padding: '0 8px' }}>Tamanho e posição</legend>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                        {num('vw', 'Largura original do widget')}
                        {num('vh', 'Altura original do widget')}
                        {num('w', 'Largura na cena')}
                        {num('x', 'Posição X')}
                        {num('y', 'Posição Y')}
                        {num('cycle', 'Trocar cena a cada (s, 0 = não)')}
                    </div>
                    <p style={{ margin: 0, color: '#b9bbb2', fontSize: 13 }}>
                        Escala: {(cfg.w / cfg.vw).toFixed(2)}× · Altura na cena: {Math.round(cfg.vh * cfg.w / cfg.vw)} px
                    </p>
                </fieldset>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button disabled={!ready} onClick={copy} style={{
                        minHeight: 48, padding: '0 24px', background: ready ? '#d7f77b' : '#3a3e37',
                        color: '#151714', border: 0, fontWeight: 600, cursor: ready ? 'pointer' : 'not-allowed',
                    }}>{copied ? 'Link copiado' : 'Copiar link do OBS'}</button>
                    <button disabled={!ready} onClick={() => setShowPreview(v => !v)} style={{
                        minHeight: 48, padding: '0 24px', background: 'transparent', color: '#f0f0e9',
                        border: '1px solid #3a3e37', cursor: ready ? 'pointer' : 'not-allowed',
                    }}>{showPreview ? 'Fechar prévia' : 'Abrir prévia (pode tocar som)'}</button>
                </div>

                {showPreview && ready && <Preview cfg={cfg} />}

                <p style={{ color: '#b9bbb2', fontSize: 13, margin: 0 }}>
                    Protocolo dos 12 testes e registro dos resultados: docs/validacao/streamlabs.md.
                    Abra o console do navegador (F12) para ver bloqueios de iframe (teste 2).
                </p>
            </div>
        </div>
    );
}

export default function WidgetLab() {
    const mode = new URLSearchParams(window.location.search).get('widgetlab');
    return mode === 'play' ? <Player /> : <Setup />;
}
