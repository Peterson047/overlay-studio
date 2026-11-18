// Internal design-system catalog. Route: /?ui
import { useState } from 'react';
import { Copy, Eye, EyeOff, Lock, Play, Trash2 } from 'lucide-react';
import {
    Badge, Button, ColorField, Field, Hint, IconButton, NumberField,
    Section, SegmentButton, SelectField, Slider, TextAreaField, TextField,
} from '../ui';

const SWATCHES = [
    ['--qs-bg', 'Fundo'], ['--qs-panel', 'Painel'], ['--qs-raised', 'Elevado'], ['--qs-field', 'Campo'],
    ['--qs-text', 'Texto'], ['--qs-text-dim', 'Texto secundário'], ['--qs-text-faint', 'Texto apagado'],
    ['--qs-accent', 'Destaque'], ['--qs-accent-text', 'Destaque em texto'], ['--qs-success', 'Sucesso'],
    ['--qs-warning', 'Aviso'], ['--qs-danger', 'Perigo'],
];

const page = {
    height: '100dvh', overflowY: 'auto', boxSizing: 'border-box', padding: '32px clamp(16px, 4vw, 48px) 64px',
    background: 'var(--qs-bg)', color: 'var(--qs-text)', fontFamily: 'var(--qs-font)',
};
const grid = { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' };
const card = { padding: 20, borderRadius: 'var(--qs-radius-lg)', background: 'var(--qs-panel)', border: '1px solid var(--qs-line)', display: 'grid', gap: 14, alignContent: 'start' };
const h2 = { margin: 0, fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--qs-text-dim)' };

export default function UiCatalog() {
    const [text, setText] = useState('Starting Soon');
    const [num, setNum] = useState(48);
    const [sel, setSel] = useState('center');
    const [opacity, setOpacity] = useState(0.8);
    const [align, setAlign] = useState('left');
    const [color, setColor] = useState('#e2021b');
    const [visible, setVisible] = useState(true);

    return (
        <div style={page}>
            <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 20 }}>
                <header style={{ display: 'grid', gap: 6 }}>
                    <span style={{ justifySelf: 'start' }}><Badge tone="live">Interno</Badge></span>
                    <h1 style={{ margin: 0, fontSize: 32, letterSpacing: '-.03em' }}>Design system do estúdio</h1>
                    <p style={{ margin: 0, color: 'var(--qs-text-dim)' }}>Tokens em <code>src/ui/tokens.css</code>, componentes em <code>src/ui/index.jsx</code>.</p>
                </header>

                <section style={card}>
                    <h2 style={h2}>Cores</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                        {SWATCHES.map(([v, name]) => (
                            <div key={v} style={{ display: 'grid', gap: 6 }}>
                                <div style={{ height: 44, borderRadius: 'var(--qs-radius)', background: `var(${v})`, boxShadow: 'inset 0 0 0 1px var(--qs-line-strong)' }} />
                                <span style={{ fontSize: 12 }}>{name}</span>
                                <code style={{ fontSize: 11, color: 'var(--qs-text-faint)' }}>{v}</code>
                            </div>
                        ))}
                    </div>
                </section>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
                    <section style={card}>
                        <h2 style={h2}>Botões</h2>
                        <div style={grid}>
                            <Button variant="primary">Publicar</Button>
                            <Button>Secundário</Button>
                            <Button variant="ghost">Fantasma</Button>
                            <Button variant="danger"><Trash2 size={13} />Excluir</Button>
                        </div>
                        <div style={grid}>
                            <Button variant="primary" size="lg"><Play size={14} />Grande</Button>
                            <Button variant="primary" size="xl">Ação principal 48 px</Button>
                        </div>
                        <div style={grid}>
                            <Button disabled>Desabilitado</Button>
                            <Button variant="primary" busy>Salvando</Button>
                        </div>
                    </section>

                    <section style={card}>
                        <h2 style={h2}>Botões de ícone e segmentos</h2>
                        <div style={grid}>
                            <IconButton title="Copiar"><Copy size={14} /></IconButton>
                            <IconButton title={visible ? 'Ocultar' : 'Mostrar'} active={!visible} onClick={() => setVisible(v => !v)}>
                                {visible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </IconButton>
                            <IconButton title="Travar" active><Lock size={14} /></IconButton>
                            <IconButton title="Excluir" danger><Trash2 size={14} /></IconButton>
                            <IconButton title="Desabilitado" disabled><Copy size={14} /></IconButton>
                        </div>
                        <div style={grid}>
                            {['left', 'center', 'right'].map(a => (
                                <SegmentButton key={a} active={align === a} onClick={() => setAlign(a)}>
                                    {{ left: 'Esquerda', center: 'Centro', right: 'Direita' }[a]}
                                </SegmentButton>
                            ))}
                            <SegmentButton disabled>Indisponível</SegmentButton>
                        </div>
                        <div style={grid}>
                            <Badge>Rascunho</Badge>
                            <Badge tone="success">Salvo na conta</Badge>
                            <Badge tone="warning">Sem conexão</Badge>
                            <Badge tone="danger">Falha ao salvar</Badge>
                            <Badge tone="live">Ao vivo</Badge>
                        </div>
                    </section>

                    <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px 4px' }}><h2 style={h2}>Painel de propriedades</h2></div>
                        <Section title="Conteúdo">
                            <Field label="Texto"><TextField value={text} onChange={setText} placeholder="Título" /></Field>
                            <Field label="Tamanho"><NumberField value={num} onChange={setNum} min={8} max={200} /><span className="qs-unit">px</span></Field>
                            <Field label="Alinhamento">
                                <SelectField value={sel} onChange={setSel} options={[{ value: 'left', label: 'Esquerda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Direita' }]} />
                            </Field>
                            <Field label="Opacidade"><Slider value={opacity} onChange={setOpacity} ariaLabel="Opacidade" /></Field>
                            <Field label="Cor"><ColorField hex={color} label="Cor" onChange={setColor} /></Field>
                            <Field label="Cor do tema"><ColorField hex="#ff3fa4" token="@primary" label="Cor do tema" onChange={() => {}} /></Field>
                        </Section>
                        <Section title="Texto longo">
                            <Field stack label="Descrição"><TextAreaField value="Uma pausa rápida." onChange={() => {}} rows={3} /></Field>
                            <Hint>O estúdio salva sozinho. As mudanças só chegam ao OBS quando você publica.</Hint>
                        </Section>
                        <Section title="Seção recolhida" defaultOpen={false}>
                            <span>Conteúdo</span>
                        </Section>
                    </section>
                </div>
            </div>
        </div>
    );
}
