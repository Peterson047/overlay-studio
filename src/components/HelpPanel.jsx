import { motion } from 'framer-motion';
import { ArrowUpRight, ChevronUp, Eye, Film, GripHorizontal, HelpCircle, Home, LayoutGrid, Pencil, Play, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, IconButton, SegmentButton } from '../ui';
import { useI18n } from '../i18n';
import { tx } from '../i18n/studio';

const MotionDiv = motion.div;

// In-app guide to the studio: what each dock button does, what you can do in
// edit mode, how to get the overlay into OBS, and AGPL-3.0 credits (About).
// Opened from the "?" in the edit header, and once on a first visit.

const Key = ({ children, accent }) => (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px',
        borderRadius: 'var(--qs-radius-sm)', flexShrink: 0,
        fontSize: 11, fontWeight: 600, fontFamily: 'var(--qs-font)', lineHeight: 1.1, whiteSpace: 'nowrap',
        border: `1px solid ${accent ? 'var(--qs-accent-line)' : 'var(--qs-line-strong)'}`,
        background: accent ? 'var(--qs-accent-soft)' : 'var(--qs-field)',
        color: accent ? 'var(--qs-text)' : 'var(--qs-text-dim)',
    }}>
        {children}
    </span>
);

const Row = ({ k, title, children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 140px) minmax(0, 1fr)', gap: 14, alignItems: 'start', padding: '11px 0', borderTop: '1px solid var(--qs-line)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{k}</div>
        <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--qs-text)' }}>{title}</div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--qs-text-dim)', marginTop: 3 }}>{children}</div>
        </div>
    </div>
);

const Step = ({ n, children }) => (
    <div style={{ display: 'flex', gap: 12, padding: '11px 0', borderTop: '1px solid var(--qs-line)' }}>
        <span style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--qs-accent)', color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'var(--qs-font)',
        }}>{n}</span>
        <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--qs-text-dim)', paddingTop: 1 }}>{children}</div>
    </div>
);

const Dock = () => (
    <>
        <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.6, color: 'var(--qs-text-dim)' }}>
            {tx("The bar at the bottom of the screen. It's how you get around when you're not editing.")}
        </p>
        <div className="qs-subhead" style={{ padding: '6px 0 2px', marginBottom: 4 }}>{tx('Tools')}</div>
        <Row k={<Key><Home size={12} /></Key>} title={tx('Home page')}>
            {tx('Back to the qorpStreamer home page. Your overlay stays saved.')}
        </Row>
        <Row k={<Key><Pencil size={12} /></Key>} title={tx('Edit layout')}>
            {tx('Opens the editor: add, move and resize things on the canvas.')}
        </Row>
        <Row k={<Key accent><Play size={12} /> {tx('Publish')}</Key>} title={tx('Get your OBS link')}>
            {tx('Creates your project link or publishes your draft changes to OBS.')}
        </Row>
        <Row k={<Key><HelpCircle size={12} /></Key>} title={tx('This guide')}>
            {tx("Open it any time from the editor's top bar, or visit the full Help Center.")}
        </Row>
        <Row k={<><Key><ChevronUp size={12} style={{ transform: 'rotate(180deg)' }} /></Key><Key><GripHorizontal size={12} /></Key></>} title={tx('Hide / show the dock')}>
            {tx('Tucks the dock into a small handle for a clean preview. Click the handle to bring it back. OBS never shows the dock.')}
        </Row>
        <div className="qs-subhead" style={{ padding: '12px 0 2px', marginBottom: 4 }}>{tx('Your show (after the divider)')}</div>
        <Row k={<Key><LayoutGrid size={12} /></Key>} title={tx('Layouts & templates')}>
            {tx('A layout is a whole show with its own scenes. Open one of yours, or pick a starter kit from the gallery.')}
        </Row>
        <Row k={<Key><Film size={12} /> {tx('Scenes')} <ChevronUp size={11} style={{ opacity: 0.6 }} /></Key>} title={tx('Switch scene')}>
            {tx("The scene you're on. Click it to jump between this layout's scenes (Starting soon, Just chatting, BRB, Ending…).")}
        </Row>
    </>
);

const Edit = () => (
    <>
        <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.6, color: 'var(--qs-text-dim)' }}>
            {tx('Everything you change stays in your draft until you publish it to OBS.')}
        </p>
        <Row k={<Key><Plus size={12} /> {tx('Add to scene')}</Key>} title={tx('The toolbox (left)')}>
            {tx('Text, lower thirds, clocks, countdowns, goals, socials, pets, a spin wheel, scoreboards, shapes and more. Search at the top, click one, then click or drag on the canvas to place it. Esc cancels.')}
        </Row>
        <Row k={<Key>{tx('Drag · Resize')}</Key>} title={tx('Arrange the canvas')}>
            {tx('Drag anywhere on a box to move it, pull a corner to resize. Click a box to open its settings on the right (text, colors, timer, frame…).')}
        </Row>
        <Row k={<><Key><Eye size={12} /></Key><Key><ChevronUp size={12} /></Key><Key><Trash2 size={12} /></Key></>} title={tx('Layers in this scene (under the canvas)')}>
            {tx('Every layer, front to back. Click one to select it; use the buttons to hide/show, bring forward, send backward, or remove.')}
        </Row>
        <Row k={<Key><Film size={12} /> {tx('Scenes')}</Key>} title={tx("Pick the scene you're editing")}>
            {tx('The dropdown at the top of the left panel. Each scene is its own full design.')}
        </Row>
        <Row k={<Key><Save size={12} /> {tx('Save scene')}</Key>} title={tx('Save as a new scene')}>
            {tx('Saves the current canvas as a new scene in this layout, for example a BRB version of your main scene.')}
        </Row>
        <Row k={<><Key>{tx('Theme')}</Key><Key>{tx('BG')}</Key></>} title={tx('Look & background')}>
            {tx('Theme re-skins every element at once (colors, font, corners). BG sets the background: solid, gradient, image, or transparent so your game shows through.')}
        </Row>
        <Row k={<Key><RotateCcw size={12} /> {tx('Reset')}</Key>} title={tx('Reset positions')}>
            {tx('Moves the cameras and built-in boxes back to their default spots. Elements you added stay where they are.')}
        </Row>
        <Row k={<Key accent>{tx('Done')}</Key>} title={tx('Leave the editor')}>
            {tx('Back to the clean preview with the dock.')}
        </Row>
    </>
);

const Obs = () => (
    <>
        <Step n={1}>{tx('Publish your project to copy your private OBS link (free preview requires signing in with Google first).')}</Step>
        <Step n={2}>{tx('In OBS, go to Sources → + → Browser and click OK.')}</Step>
        <Step n={3}>{tx('Paste the link as the URL, set width 1920 and height 1080, leave Custom CSS empty, and click OK.')}</Step>
        <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--qs-text-dim)' }}>
            {tx('Also works with Streamlabs Desktop, XSplit, or Meld Studio using a Browser / Web page source with the same size.')}
        </p>
        <div className="qs-hint" style={{ marginTop: 12, padding: '10px 12px', fontSize: 12 }}>
            <span>{tx('Keep your link private: anyone who has the link can view your published overlay. Never share it; generate a new link in My projects if needed.')}</span>
        </div>
    </>
);

const About = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--qs-text)' }}>
            {tx('qorpStreamer is a fork of Overlay Studio by Abhay Raghuwanshi, distributed under GNU AGPL-3.0.')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a
                href="https://github.com/Peterson047/overlay-studio"
                target="_blank"
                rel="noreferrer"
                className="qs-btn"
                style={{ justifyContent: 'space-between', textDecoration: 'none' }}
            >
                <span>{tx('qorpStreamer source code (AGPL-3.0)')}</span>
                <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <a
                href="https://github.com/abhayraghuwanshi/overlay-studio"
                target="_blank"
                rel="noreferrer"
                className="qs-btn"
                style={{ justifyContent: 'space-between', textDecoration: 'none' }}
            >
                <span>{tx('Original project (Overlay Studio)')}</span>
                <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
                <a href="/?termos" className="qs-inline-link">{tx('Terms of Use')}</a>
                <a href="/?privacidade" className="qs-inline-link">{tx('Privacy Policy')}</a>
            </div>
        </div>
    </div>
);

const TABS = [
    { id: 'dock',  label: 'The dock',   Body: Dock },
    { id: 'edit',  label: 'Edit mode',  Body: Edit },
    { id: 'obs',   label: 'Add to OBS', Body: Obs },
    { id: 'about', label: 'About',      Body: About },
];

const HelpPanel = ({ onClose, initialTab = 'dock' }) => {
    useI18n();
    const [tab, setTab] = useState(initialTab);
    const { Body } = TABS.find(t => t.id === tab) ?? TABS[0];

    useEffect(() => {
        if (!onClose) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
            <MotionDiv
                onClick={e => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.97, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.16 }}
                role="dialog" aria-modal="true" aria-label={tx('How the studio works')}
                className="qs-floating-panel"
                style={{
                    width: 'min(580px, 100%)', height: 'min(640px, 88vh)', display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--qs-text)' }}>{tx('How it works')}</span>
                    <IconButton size="sm" variant="ghost" title={tx('Close')} onClick={onClose}>
                        <X size={16} />
                    </IconButton>
                </div>
                <div style={{ display: 'flex', gap: 6, padding: '12px 16px 10px', borderBottom: '1px solid var(--qs-line)', flexWrap: 'wrap' }}>
                    {TABS.map(t => (
                        <SegmentButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
                            {tx(t.label)}
                        </SegmentButton>
                    ))}
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 16px 14px' }}>
                    <Body />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '10px 16px', borderTop: '1px solid var(--qs-line)' }}>
                    <a href="/?ajuda" className="qs-inline-link qs-inline-link--accent" style={{ textDecoration: 'none' }}>
                        {tx('Full help center')} <ArrowUpRight size={12} aria-hidden="true" />
                    </a>
                    <Button variant="primary" onClick={onClose}>
                        {tx('Got it')}
                    </Button>
                </div>
            </MotionDiv>
        </div>
    );
};

export default HelpPanel;
