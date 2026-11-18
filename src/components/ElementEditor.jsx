import { AlignCenter, AlignLeft, AlignRight, ChevronDown, Copy, Eye, EyeOff, Info, Pause, Play, RefreshCw, RotateCcw, SkipForward, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { scoresUrl } from '../config';
import { MOODS, DEFAULT_MOOD } from '../theme/moods';
import { DEFAULT_THEME, resolveToken } from '../theme/themes';
import { PETS, DEFAULT_PET, PetMascot } from './pets';
import { BACKDROPS, FRAME_STYLES, LOWER_THIRDS, TEXT_FX, isGraphicFrame } from './graphics';
import { normalizeChannel } from '../live/twitchChat';
import { scaleImageFile } from '../utils/imageScale.js';
import { ADD_SECTIONS, ELEMENT_TYPE_MAP } from './elementCatalog';
import { computePomodoroState } from './ElementRenderer';
import {
    ColorField, Field, Hint as UiHint, IconButton, NumberField, Section as UiSection,
    SegmentButton, SelectField, Slider as UiSlider, TextAreaField, TextField,
} from '../ui';
import { useI18n } from '../i18n';
import { tx } from '../i18n/studio';

// "Theme" entries store the token, so the element follows theme switches.
const withThemeOption = (list, token) => [{ value: token, label: tx('Theme default') }, ...list.map(o => ({ value: o.id, label: o.label }))];

// Quick sticky-note swatches — each pairs a paper colour with readable dark ink.
const NOTE_PAPERS = [
    { label: 'Yellow', paper: '#fde68a', ink: '#3a2f10' },
    { label: 'Pink',   paper: '#fbcfe8', ink: '#4a1233' },
    { label: 'Mint',   paper: '#bbf7d0', ink: '#0f3d27' },
    { label: 'Blue',   paper: '#bfdbfe', ink: '#15315e' },
    { label: 'Orange', paper: '#fed7aa', ink: '#5a2c08' },
    { label: 'Lilac',  paper: '#e9d5ff', ink: '#3b1466' },
];

// ── Panel styling ─────────────────────────────────────────────────────────
// Controls come from the studio design system (src/ui). These thin wrappers
// keep the props the rest of this file already uses.
const C = {
    text: 'var(--qs-text)',
    dim: 'var(--qs-text-dim)',
    faint: 'var(--qs-text-faint)',
    field: 'var(--qs-field)',
    line: 'var(--qs-line)',
    accent: 'var(--qs-accent)',
    accentBg: 'var(--qs-accent-soft)',
    danger: 'var(--qs-danger)',
};
const FIELD = {
    background: C.field, border: `1px solid ${C.line}`, borderRadius: 'var(--qs-radius-sm)',
    color: C.text, fontSize: 12, outline: 'none', fontFamily: 'var(--qs-font)',
    boxSizing: 'border-box', height: 'var(--qs-control)',
};
const UNIT = { fontSize: 11, color: C.faint };

// ── Small reusable controls ────────────────────────────────────────────────

const Label = ({ children }) => <span className="qs-label">{children}</span>;

const TextInput = ({ value, onChange, style = {}, ...rest }) => (
    <TextField {...rest} value={value} onChange={onChange} style={{ flex: 1, ...style }} />
);

const TextArea = ({ value, onChange, placeholder, rows = 4, style = {} }) => (
    <TextAreaField value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={style} />
);

const NumberInput = ({ value, onChange, min, max, step = 1, style = {} }) => (
    <NumberField value={value} onChange={onChange} min={min} max={max} step={step} style={style} />
);

// A label + control row: the label sits in a fixed left column so every
// control in the panel lines up. `stack` puts the label above wide content.
const Group = ({ label, children, stack = false }) => <Field label={label} stack={stack}>{children}</Field>;

const normalizeHex = (raw, fallback = '#ffffff') => {
    if (typeof raw !== 'string') return fallback;
    const s = raw.trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    const short = s.match(/^#([0-9a-f]{3})$/i);
    if (short) {
        const [r, g, b] = short[1];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) {
        const toHex = (n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
        return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
    }
    return fallback;
};

const resolveColorInfo = (value, theme = DEFAULT_THEME, fallback = '#ffffff') => {
    const isToken = typeof value === 'string' && value.startsWith('@');
    if (!isToken) {
        const hex = normalizeHex(value, fallback);
        return { isToken: false, token: null, swatchCss: value || hex, hex, label: value ? String(value).toUpperCase() : hex.toUpperCase() };
    }
    const mapped = value === '@primary' ? theme.accent : resolveToken(value, theme);
    const resolvedStr = typeof mapped === 'string' && !mapped.startsWith('@') ? mapped : (theme.accent ?? fallback);
    const hex = normalizeHex(resolvedStr, normalizeHex(theme.accent, fallback));
    return { isToken: true, token: value, swatchCss: hex, hex, label: hex.toUpperCase() };
};

const ColorInput = ({ value, onChange, label, theme = DEFAULT_THEME, fallback = '#ffffff' }) => {
    const { isToken, token, swatchCss, hex } = resolveColorInfo(value, theme, fallback);
    const swatch = <ColorField hex={hex} swatch={swatchCss} token={isToken ? token : null} label={label} onChange={onChange} />;
    return label ? <Group label={label}>{swatch}</Group> : swatch;
};

const Slider = ({ value, onChange, min = 0, max = 1, step = 0.01, label, displayValue }) => {
    const control = <UiSlider value={value} onChange={onChange} min={min} max={max} step={step} displayValue={displayValue} ariaLabel={typeof label === 'string' ? label : undefined} />;
    return label ? <Group label={label}>{control}</Group> : control;
};

const ToggleBtn = ({ active, onClick, children, title, disabled = false }) => (
    <SegmentButton active={active} onClick={onClick} title={title} disabled={disabled}>{children}</SegmentButton>
);

const SelectInput = ({ value, onChange, options }) => <SelectField value={value} onChange={onChange} options={options} />;

const Hint = ({ children }) => <UiHint>{children}</UiHint>;

// Collapsible section; open/closed state is remembered per section title.
const SECTION_KEY = 'os.editor.sections';
const Section = ({ title, children }) => (
    <UiSection title={title} id={title} storageKey={SECTION_KEY}>{children}</UiSection>
);

const IconBtn = ({ title, onClick, danger, active, children }) => (
    <IconButton title={title} onClick={onClick} danger={danger} active={active ? true : undefined}>{children}</IconButton>
);

// The section of the Add panel a type belongs to, shown under its name.
const sectionOf = (type) => ADD_SECTIONS.find(sec => sec.types.includes(type))?.title
    ?? (ELEMENT_TYPE_MAP[type]?.group === 'shape' ? 'Shape' : 'Element');

// ── Main Editor ────────────────────────────────────────────────────────────

// Format an ISO kickoff time as a short local time, e.g. "22:30".
const fmtKickoff = (iso) => {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
};

// Order matches the way a streamer wants to pick them: in-play first, then
// upcoming (soonest kickoff first), then finished (most recent first). Without
// this the feed's date-ascending order buries today's/live games under weeks of
// early group games once the list is capped.
const matchPriority = (m) => (m.status === 'LIVE' || m.status === 'HT') ? 0 : m.status === 'SCHED' ? 1 : 2;
const matchSort = (a, b) => {
    const pa = matchPriority(a), pb = matchPriority(b);
    if (pa !== pb) return pa - pb;
    const ta = +new Date(a.utcDate), tb = +new Date(b.utcDate);
    return pa === 2 ? tb - ta : ta - tb;  // finished: newest first; live/upcoming: soonest first
};

// Relative day label for a match date — "Today" / "Tomorrow" / "Yesterday",
// else a short date like "Jun 24".
const fmtDay = (iso) => {
    try {
        const d = new Date(iso);
        const day0 = new Date(); day0.setHours(0, 0, 0, 0);
        const md = new Date(d); md.setHours(0, 0, 0, 0);
        const diff = Math.round((md - day0) / 86400000);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Tomorrow';
        if (diff === -1) return 'Yesterday';
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch { return ''; }
};

// Channel field that commits on Enter / blur, so typing a name doesn't open a
// Twitch connection for every partial name on the way.
const ChannelInput = ({ value, onCommit, placeholder = 'yourchannel' }) => {
    const [draft, setDraft] = useState(value ?? '');
    const [prev, setPrev] = useState(value);
    if (prev !== value) { setPrev(value); setDraft(value ?? ''); }
    const commit = () => {
        const v = normalizeChannel(draft);
        setDraft(v);
        if (v !== (value ?? '')) onCommit(v);
    };
    const bad = draft.trim() !== '' && !normalizeChannel(draft);
    return (
        <TextInput
            value={draft}
            onChange={setDraft}
            placeholder={placeholder}
            style={{ width: 140, borderColor: bad ? 'rgba(248,113,113,0.6)' : undefined }}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
    );
};

const BoxCoordInput = ({ value, onCommit, min = 0, max = 100, step = 0.5 }) => {
    const rounded = Math.round((value ?? 0) * 10) / 10;
    const [focused, setFocused] = useState(false);
    const [draft, setDraft] = useState(() => String(rounded));
    const displayValue = focused ? draft : String(rounded);

    const handleChange = (e) => {
        const next = e.target.value;
        setDraft(next);
        if (next.trim() === '' || next === '-' || next === '.' || next === '-.') return;
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onCommit(parsed);
    };

    const handleBlur = () => {
        setFocused(false);
        const trimmed = draft.trim();
        const parsed = trimmed === '' ? NaN : Number(trimmed);
        if (Number.isFinite(parsed)) {
            const clamped = Math.max(min, Math.min(max, Math.round(parsed * 10) / 10));
            setDraft(String(clamped));
            onCommit(clamped);
        } else {
            setDraft(String(rounded));
        }
    };

    return (
        <input
            type="number"
            step={step}
            min={min}
            max={max}
            value={displayValue}
            onFocus={() => { setFocused(true); setDraft(String(rounded)); }}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            style={{ flex: 1, width: '100%', minWidth: 0, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', padding: 0 }}
        />
    );
};

const fmtTimerSec = (sec) => {
    const clamped = Math.max(0, Math.round(Number(sec) || 0));
    const hrs = Math.floor(clamped / 3600);
    const mins = Math.floor((clamped % 3600) / 60);
    const secs = clamped % 60;
    if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const computeCountdownRemaining = (liveEntry, durationSec, nowMs) => {
    const dur = Math.max(0, Number(durationSec) || 0);
    const state = liveEntry?.state ?? 'stopped';
    if (!liveEntry || state === 'stopped') {
        return { state: 'stopped', remainingSec: dur };
    }
    if (state === 'paused') {
        const rem = liveEntry.remainingSec != null ? Number(liveEntry.remainingSec) : dur;
        return { state: 'paused', remainingSec: Math.max(0, Math.ceil(rem)) };
    }
    const baseRem = liveEntry.remainingSec != null ? Number(liveEntry.remainingSec) : dur;
    const anchor = Number(liveEntry.anchorAt);
    const elapsed = Number.isFinite(anchor) ? Math.max(0, (nowMs - anchor) / 1000) : 0;
    return { state: 'running', remainingSec: Math.max(0, Math.ceil(baseRem - elapsed)) };
};

// Count goals in scorer text while tolerating spaces, hyphens, accents, and digits inside player names.
const countScorerGoals = (s) => {
    const text = String(s || '').trim();
    if (!text) return 0;
    let total = 0;
    for (const rawSeg of text.split(/[\n,;]+/)) {
        const seg = rawSeg.trim();
        if (!seg) continue;
        const primeMatches = seg.match(/(?:^|[\s(])\d{1,3}(?:\s*\+\s*\d{1,2})?\s*['′’]/g);
        if (primeMatches) {
            total += primeMatches.length;
            continue;
        }
        const stripped = seg.replace(/\([^)]*\)/g, '').trim();
        if (/^\d{1,3}(?:\s*\+\s*\d{1,2})?$/.test(stripped) || /^[\p{L}\p{N}\s.'’-]+\s+\d{1,3}(?:\s*\+\s*\d{1,2})?$/u.test(stripped)) {
            total += 1;
        }
    }
    return total;
};

const ChannelOverrideFields = ({ roomChannel, onRoomChannelChange, elementChannel, onElementChannelChange }) => {
    const room = normalizeChannel(roomChannel);
    const override = normalizeChannel(elementChannel);
    return (
        <>
            {onRoomChannelChange && (
                <Group label="Room channel">
                    <ChannelInput value={roomChannel} onCommit={onRoomChannelChange} placeholder="yourchannel" />
                </Group>
            )}
            <Group label="Box channel">
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                    <ChannelInput
                        value={elementChannel ?? ''}
                        onCommit={v => onElementChannelChange(v || '')}
                        placeholder={room ? `Inherit #${room}` : 'Inherit room'}
                    />
                    {override && (
                        <ToggleBtn active={false} onClick={() => onElementChannelChange('')} title="Revert to global room channel">
                            Inherit
                        </ToggleBtn>
                    )}
                </div>
            </Group>
            <div style={{ fontSize: 10.5, color: override ? 'var(--qs-text)' : C.faint, lineHeight: 1.4 }}>
                {override
                    ? `Using #${override} for this box only (overrides room channel).`
                    : room
                        ? `Inheriting global room channel (#${room}).`
                        : 'Inheriting global room channel (none set yet).'}
            </div>
        </>
    );
};

const ElementEditor = ({
    element,
    onChange,
    onUpdate,
    onDelete,
    onDuplicate,
    twitchChannel = '',
    onTwitchChannelChange,
    liveState = {},
    serverOffsetMs = 0,
    onLiveAction,
    theme = DEFAULT_THEME,
}) => {
    useI18n(); // re-render tx() strings when the language changes
    const fileRef = useRef(null);
    // Two-step delete: the first click arms it; selecting another element resets.
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [armedFor, setArmedFor] = useState(element?.id);
    if (armedFor !== element?.id) { setArmedFor(element?.id); setConfirmDelete(false); }
    // Match feed for the scoreboard picker — fetched once when a match element is
    // selected. `null` while loading; otherwise { configured, matches: [...] }.
    const [matchFeed, setMatchFeed] = useState(null);
    const [matchQuery, setMatchQuery] = useState('');
    const liveTimer = element?.id ? liveState?.timers?.[element.id] : null;
    const liveTrigger = element?.id ? liveState?.triggers?.[element.id] : null;
    const isTimerRunning = (element?.type === 'countdown' || element?.type === 'pomodoro') && liveTimer?.state === 'running';
    const [tickNow, setTickNow] = useState(() => Date.now());
    const [wheelSpinUntil, setWheelSpinUntil] = useState(0);
    const liveWheelEndLocal = element?.type === 'wheel' && liveTrigger?.kind === 'wheel' && typeof liveTrigger.at === 'number'
        ? (liveTrigger.at - serverOffsetMs) + (liveTrigger.spinSec ?? element?.spinSec ?? 4) * 1000
        : 0;
    const isWheelSpinning = element?.type === 'wheel' && Math.max(wheelSpinUntil, liveWheelEndLocal) > tickNow;
    useEffect(() => {
        if (!isTimerRunning && !isWheelSpinning) return undefined;
        const initId = setTimeout(() => setTickNow(Date.now()), 0);
        const intervalId = setInterval(() => setTickNow(Date.now()), 250);
        return () => {
            clearTimeout(initId);
            clearInterval(intervalId);
        };
    }, [isTimerRunning, isWheelSpinning]);
    useEffect(() => {
        if (element?.type !== 'match') return undefined;
        let alive = true;
        fetch(scoresUrl())
            .then(r => (r.ok ? r.json() : { matches: [], error: `HTTP ${r.status}` }))
            .then(d => { if (alive) setMatchFeed(d); })
            .catch(() => { if (alive) setMatchFeed({ matches: [], error: 'Unable to reach match feed' }); });
        return () => { alive = false; };
    }, [element?.type, element?.id]);
    if (!element) return null;

    const applyElementChange = onChange ?? onUpdate;
    const fallbackUpdate = onUpdate ?? onChange;
    const set = (key, val) => applyElementChange?.({ [key]: val });
    const { type } = element;
    const isClipShape = ['triangle', 'diamond', 'hexagon', 'star'].includes(type);
    const isShapeFill = type === 'divider' || type === 'shape' || type === 'circle' || isClipShape;
    const isMoodEl = ['moodring', 'pet'].includes(type);
    const isText = ['text', 'lowerthird', 'clock', 'countdown', 'live', 'social', 'pomodoro', 'daycounter', 'ticker'].includes(type);
    const isAutoText = ['clock', 'countdown', 'pomodoro', 'daycounter', 'ticker'].includes(type); // content handled by custom controls (or auto-generated), no generic text input
    const nowSyncedMs = tickNow + serverOffsetMs;

    const handleLogoUpload = async (e) => {
        const input = e.target;
        const file = input.files?.[0];
        if (!file) return;
        try {
            const src = await scaleImageFile(file, { maxDim: 480, preserveAlpha: true });
            applyElementChange?.({ src });
        } finally {
            input.value = '';
        }
    };

    const meta = ELEMENT_TYPE_MAP[type];
    const name = meta?.label ?? type;
    const hasSettings = !['shape', 'circle', 'divider', 'triangle', 'diamond', 'hexagon', 'star'].includes(type);
    const box = element.box ?? { x: 0, y: 0, w: 10, h: 10 };
    const setBox = (k, v) => {
        const n = Math.round(Number(v) * 10) / 10;
        if (!Number.isFinite(n)) return;
        const max = k === 'x' ? 100 - box.w : k === 'y' ? 100 - box.h : 100;
        applyElementChange?.({ box: { ...box, [k]: Math.max(k === 'w' || k === 'h' ? 1 : 0, Math.min(max, n)) } });
    };

    return (
        <div style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(7,7,16,0.94)', display: 'flex', flexDirection: 'column', overflowX: 'hidden', fontFamily: 'inter, system-ui' }}>
            {/* ── Header: what is selected + quick actions ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 12px' }}>
                <span style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: meta?.color ?? C.accent, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`,
                }}>
                    {meta?.preview}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx(name)}</div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 1 }}>{element.hidden ? tx('Hidden') + ' · ' : ''}{tx(sectionOf(type))}</div>
                </div>
                <IconBtn title={element.hidden ? tx("Show on stream") : tx("Hide from stream")} onClick={() => set('hidden', !element.hidden)}>
                    {element.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </IconBtn>
                {onDuplicate && <IconBtn title={tx("Duplicate")} onClick={onDuplicate}><Copy size={14} /></IconBtn>}
                <IconBtn
                    title={confirmDelete ? 'Click again to delete' : 'Delete'}
                    danger active={confirmDelete}
                    onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
                >
                    <Trash2 size={14} />
                </IconBtn>
            </div>

            {hasSettings && (
                <Section title={isText ? tx("Content") : tx("Settings")}>
                {/* ── Text content ── */}
                {isText && !isAutoText && (
                    <Group label={tx("Content")}>
                        <TextInput
                            value={element.content}
                            onChange={v => set('content', v)}
                            placeholder={tx("Enter text...")}
                            style={{ width: 160 }}
                        />
                    </Group>
                )}

                {/* ── Countdown duration + live controls ── */}
                {type === 'countdown' && (() => {
                    const durationSec = Math.max(0, Number(element.durationSec ?? 0));
                    const cdSnap = computeCountdownRemaining(liveTimer, durationSec, nowSyncedMs);
                    const isRunning = cdSnap.state === 'running';
                    const playCountdown = () => {
                        const now = Date.now() + serverOffsetMs;
                        setTickNow(Date.now());
                        const rem = cdSnap.state === 'paused' && cdSnap.remainingSec > 0 ? cdSnap.remainingSec : durationSec;
                        onLiveAction?.('timers', element.id, {
                            kind: 'countdown',
                            state: 'running',
                            durationSec,
                            remainingSec: rem,
                            anchorAt: now,
                        });
                    };
                    const pauseCountdown = () => {
                        const now = Date.now() + serverOffsetMs;
                        const rem = computeCountdownRemaining(liveTimer, durationSec, now).remainingSec;
                        onLiveAction?.('timers', element.id, {
                            kind: 'countdown',
                            state: 'paused',
                            durationSec,
                            remainingSec: rem,
                            anchorAt: now,
                        });
                    };
                    const resetCountdown = () => {
                        const now = Date.now() + serverOffsetMs;
                        onLiveAction?.('timers', element.id, {
                            kind: 'countdown',
                            state: 'stopped',
                            durationSec,
                            remainingSec: durationSec,
                            anchorAt: now,
                        });
                    };
                    const updateDuration = (nextDur) => {
                        set('durationSec', nextDur);
                        if (liveTimer?.kind === 'countdown' && liveTimer.state === 'stopped') {
                            onLiveAction?.('timers', element.id, {
                                kind: 'countdown',
                                state: 'stopped',
                                durationSec: nextDur,
                                remainingSec: nextDur,
                                anchorAt: Date.now() + serverOffsetMs,
                            });
                        }
                    };
                    return (
                        <>
                            <Group label={tx("Duration")}>
                                <NumberInput
                                    value={Math.floor((element.durationSec ?? 0) / 60)}
                                    onChange={v => updateDuration(Math.max(0, v) * 60 + (element.durationSec ?? 0) % 60)}
                                    min={0} max={180} style={{ width: 52 }}
                                />
                                <span style={UNIT}>{tx('min')}</span>
                                <NumberInput
                                    value={(element.durationSec ?? 0) % 60}
                                    onChange={v => updateDuration(Math.floor((element.durationSec ?? 0) / 60) * 60 + Math.min(59, Math.max(0, v)))}
                                    min={0} max={59} style={{ width: 52 }}
                                />
                                <span style={UNIT}>{tx('sec')}</span>
                            </Group>
                            <Group label={tx("Live")}>
                                <ToggleBtn active={isRunning} disabled={isRunning} onClick={playCountdown} title={tx("Start or resume countdown")}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Play size={11} /> {tx("Play")}
                                    </span>
                                </ToggleBtn>
                                <ToggleBtn active={cdSnap.state === 'paused'} disabled={!isRunning} onClick={pauseCountdown} title={tx("Pause countdown")}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Pause size={11} /> {tx("Pause")}
                                    </span>
                                </ToggleBtn>
                                <ToggleBtn active={false} onClick={resetCountdown} title={tx("Reset countdown")}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <RotateCcw size={11} /> {tx("Reset")}
                                    </span>
                                </ToggleBtn>
                            </Group>
                            <div style={{ fontSize: 10.5, color: isRunning ? '#86efac' : C.dim, fontFamily: 'ui-monospace, monospace' }}>
                                {fmtTimerSec(cdSnap.remainingSec)} · {cdSnap.state === 'running' ? tx("Running") : cdSnap.state === 'paused' ? tx("Paused") : tx("Stopped")}
                            </div>
                        </>
                    );
                })()}

                {/* ── Day counter: day number + labels ── */}
                {type === 'daycounter' && (
                    <>
                        <Group label={tx("Day")}>
                            <NumberInput value={element.day ?? 1} onChange={v => set('day', Math.max(0, v))} min={0} max={99999} style={{ width: 64 }} />
                            <ToggleBtn active={false} onClick={() => set('day', Math.max(0, (element.day ?? 1) + 1))} title={tx("Bump to the next day")}>+1 day</ToggleBtn>
                        </Group>
                        <Group label={tx("Label")}>
                            <TextInput value={element.prefix ?? 'DAY'} onChange={v => set('prefix', v)} placeholder={tx("DAY")} style={{ width: 80 }} />
                        </Group>
                        <Group label={tx("Caption")}>
                            <TextInput value={element.content} onChange={v => set('content', v)} placeholder="#100DaysOfCode" style={{ width: 160 }} />
                        </Group>
                    </>
                )}

                {/* ── Ticker: messages + scroll speed ── */}
                {type === 'ticker' && (
                    <>
                        <div style={{ width: '100%' }}>
                            <Label>{tx("Messages")}</Label>
                            <TextArea value={element.content} onChange={v => set('content', v)} placeholder={tx("One message per line…")} rows={4} />
                        </div>
                        <Group label={tx("Speed")}>
                            {['slow', 'medium', 'fast'].map(s => (
                                <ToggleBtn key={s} active={(element.speed ?? 'medium') === s} onClick={() => set('speed', s)} title={`Scroll ${s}`}>
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                </ToggleBtn>
                            ))}
                        </Group>
                        <Hint>
                            Each line is a message; they loop with a • between them.
                        </Hint>
                    </>
                )}

                {/* ── LIVE badge: dot colour + pulse ── */}
                {type === 'live' && (
                    <Group label={tx("Dot")}>
                        <ColorInput value={element.dotColor || '#ef4444'} onChange={v => set('dotColor', v)} theme={theme} />
                        <ToggleBtn active={element.pulse !== false} onClick={() => set('pulse', !(element.pulse !== false))} title={tx("Pulse animation")}>{tx("Pulse")}</ToggleBtn>
                    </Group>
                )}

                {/* ── Social chip: platform ── */}
                {type === 'social' && (
                    <Group label={tx("Platform")}>
                        <SelectInput
                            value={element.platform || 'twitch'}
                            onChange={v => set('platform', v)}
                            options={[
                                { value: 'twitch',    label: tx("Twitch")      },
                                { value: 'youtube',   label: tx("YouTube")     },
                                { value: 'x',         label: tx("X / Twitter") },
                                { value: 'instagram', label: tx("Instagram")   },
                                { value: 'discord',   label: tx("Discord")     },
                                { value: 'tiktok',    label: tx("TikTok")      },
                                { value: 'kick',      label: tx("Kick")        },
                                { value: 'web',       label: tx("Website")     },
                            ]}
                        />
                    </Group>
                )}

                {/* ── Mood-ring: pick mood + auto-cycle ── */}
                {type === 'moodring' && (
                    <>
                        <Group label={tx("Mood")}>
                            {MOODS.map(m => (
                                <ToggleBtn
                                    key={m.id}
                                    active={(element.mood ?? 'chill') === m.id}
                                    onClick={() => set('mood', m.id)}
                                    title={m.label}
                                >
                                    <span style={{ marginRight: 3 }}>{m.emoji}</span>{m.label}
                                </ToggleBtn>
                            ))}
                        </Group>
                        <Group label={tx("Auto-cycle")}>
                            <ToggleBtn active={!!element.auto} onClick={() => set('auto', !element.auto)} title={tx("Cycle moods automatically")}>
                                {element.auto ? 'On' : 'Off'}
                            </ToggleBtn>
                            {element.auto && (
                                <>
                                    <NumberInput value={element.cycleSec ?? 20} onChange={v => set('cycleSec', Math.max(3, v))} min={3} max={600} style={{ width: 56 }} />
                                    <span style={UNIT}>sec each</span>
                                </>
                            )}
                        </Group>
                        <Hint>
                            Any Pet you place mirrors this mood.
                        </Hint>
                    </>
                )}

                {/* ── Pet: pick a species; expression follows the mood-ring ── */}
                {type === 'pet' && (
                    <>
                        <Group label={tx("Pet")} stack>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, width: '100%' }}>
                                {PETS.map(p => {
                                    const active = (element.species ?? DEFAULT_PET) === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => set('species', p.id)}
                                            title={p.label}
                                            style={{
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                                                padding: '6px 2px 4px', cursor: 'pointer', borderRadius: 8,
                                                border: `1px solid ${active ? 'var(--qs-accent-line)' : 'rgba(255,255,255,0.1)'}`,
                                                background: active ? 'var(--qs-accent-soft)' : 'rgba(255,255,255,0.04)',
                                            }}
                                        >
                                            <div style={{ width: 34, height: 34, pointerEvents: 'none' }}>
                                                <PetMascot species={p.id} mood={DEFAULT_MOOD} animate={false} />
                                            </div>
                                            <span style={{ fontSize: 8, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5, color: active ? 'var(--qs-text)' : 'rgba(255,255,255,0.45)' }}>
                                                {p.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </Group>
                        <Group label={tx("Movement")}>
                            <ToggleBtn
                                active={!element.walk}
                                onClick={() => applyElementChange?.({ walk: false })}
                                title={tx("Pet stays put in its box")}
                            >
                                Stay
                            </ToggleBtn>
                            <ToggleBtn
                                active={!!element.walk}
                                title={tx("Pet roams a full-width floor lane")}
                                onClick={() => applyElementChange?.({
                                    walk: true,
                                    // Expand the box into a full-width lane so the pet has room to
                                    // roam (the box clips, so a small box would hide the walking).
                                    box: { x: 0, y: element.box?.y ?? 80, w: 100, h: element.box?.h ?? 16 },
                                })}
                            >
                                Walk
                            </ToggleBtn>
                        </Group>
                        {element.walk && (
                            <Group label={tx("Speed")}>
                                {['slow', 'medium', 'fast'].map(s => (
                                    <ToggleBtn key={s} active={(element.speed ?? 'medium') === s} onClick={() => set('speed', s)} title={`Walk ${s}`}>
                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </ToggleBtn>
                                ))}
                            </Group>
                        )}
                        <Hint>
                            {element.walk
                                ? 'The pet roams a full-width lane, walking, turning, and pausing. Drag the lane up/down to set the floor; resize its height to set the pet size.'
                                : "The pet's expression follows the Mood-ring. Add a Mood-ring element to control it; otherwise it stays chill. Resize via the box on canvas."}
                        </Hint>
                    </>
                )}

                {/* ── Decision wheel: options + spin behaviour ── */}
                {type === 'wheel' && (
                    <>
                        <Group label={tx("Options")} stack>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
                                {(element.options ?? []).map((opt, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <TextInput
                                            value={opt}
                                            onChange={v => { const next = [...(element.options ?? [])]; next[i] = v; set('options', next); }}
                                            placeholder={`Option ${i + 1}`}
                                            style={{ width: 130 }}
                                        />
                                        <button
                                            onClick={() => set('options', (element.options ?? []).filter((_, j) => j !== i))}
                                            disabled={(element.options ?? []).length <= 2}
                                            title={tx("Remove")}
                                            style={{ background: 'none', border: '1px solid rgba(255,100,100,0.3)', borderRadius: 5, color: 'rgba(255,100,100,0.7)', fontSize: 11, padding: '3px 6px', display: 'flex', alignItems: 'center', cursor: (element.options ?? []).length <= 2 ? 'not-allowed' : 'pointer', opacity: (element.options ?? []).length <= 2 ? 0.4 : 1 }}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={() => set('options', [...(element.options ?? []), `Option ${(element.options ?? []).length + 1}`])}
                                    disabled={(element.options ?? []).length >= 8}
                                    style={{ alignSelf: 'flex-start', background: 'var(--qs-accent-soft)', border: '1px solid var(--qs-accent-line)', borderRadius: 5, color: 'var(--qs-text)', fontSize: 11, padding: '4px 10px', fontFamily: 'inter, system-ui', cursor: (element.options ?? []).length >= 8 ? 'not-allowed' : 'pointer', opacity: (element.options ?? []).length >= 8 ? 0.4 : 1 }}
                                >
                                    + Add option
                                </button>
                            </div>
                        </Group>
                        <Group label={tx("Spin time")}>
                            <NumberInput value={element.spinSec ?? 4} onChange={v => set('spinSec', Math.max(1, Math.min(15, v)))} min={1} max={15} style={{ width: 52 }} />
                            <span style={UNIT}>{tx('sec')}</span>
                        </Group>
                        <ColorInput value={element.fontColor} onChange={v => set('fontColor', v)} label={tx("Label color")} theme={theme} />
                        <Group label={tx("Auto-spin")}>
                            <ToggleBtn active={!!element.auto} onClick={() => set('auto', !element.auto)} title={tx("Spin automatically")}>
                                {element.auto ? 'On' : 'Off'}
                            </ToggleBtn>
                            {element.auto && (
                                <>
                                    <NumberInput value={element.cycleSec ?? 30} onChange={v => set('cycleSec', Math.max(5, v))} min={5} max={600} style={{ width: 56 }} />
                                    <span style={UNIT}>sec each</span>
                                </>
                            )}
                        </Group>
                        <Group label={tx("Live")}>
                            <ToggleBtn
                                active={false}
                                disabled={isWheelSpinning}
                                onClick={() => {
                                    const count = Math.max(2, (element.options ?? []).length);
                                    const idx = Math.floor(Math.random() * count);
                                    const spinSec = element.spinSec ?? 4;
                                    const now = Date.now();
                                    setTickNow(now);
                                    setWheelSpinUntil(now + spinSec * 1000);
                                    if (onLiveAction) {
                                        onLiveAction('triggers', element.id, { kind: 'wheel', idx, spinSec });
                                    } else {
                                        fallbackUpdate?.({ spin: { idx, at: now } });
                                    }
                                }}
                                title={isWheelSpinning ? 'Wheel is currently spinning' : 'Trigger a wheel spin now'}
                            >
                                {isWheelSpinning ? 'Spinning…' : 'Spin Wheel Now'}
                            </ToggleBtn>
                        </Group>
                        <Hint>
                            Click the wheel's centre (or Spin Wheel Now) to spin. 2–8 options.
                        </Hint>
                    </>
                )}

                {/* ── Sticky note: text + paper ── */}
                {type === 'note' && (
                    <>
                        <div style={{ width: '100%' }}>
                            <Label>{tx("Note")}</Label>
                            <TextArea value={element.content} onChange={v => set('content', v)} placeholder={tx("Type your note…")} rows={5} />
                        </div>
                        <Group label={tx("Text size")}>
                            <NumberInput value={element.fontSize ?? 16} onChange={v => set('fontSize', Math.max(8, Math.min(48, v)))} min={8} max={48} style={{ width: 52 }} />
                            <ToggleBtn active={!!element.bold} onClick={() => set('bold', !element.bold)} title={tx("Bold")}>B</ToggleBtn>
                        </Group>
                        <div style={{ width: '100%' }}>
                            <Label>{tx("Paper")}</Label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                {NOTE_PAPERS.map(p => {
                                    const active = (element.paperColor || '#fde68a').toLowerCase() === p.paper;
                                    return (
                                        <button key={p.paper} onClick={() => applyElementChange?.({ paperColor: p.paper, fontColor: p.ink })} title={p.label}
                                            style={{ width: 22, height: 22, borderRadius: 5, background: p.paper, cursor: 'pointer',
                                                border: active ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                                                boxShadow: active ? '0 0 6px rgba(255,255,255,0.5)' : 'none', flexShrink: 0 }} />
                                    );
                                })}
                                <ColorInput value={element.paperColor || '#fde68a'} onChange={v => set('paperColor', v)} theme={theme} />
                            </div>
                        </div>
                        <ColorInput value={element.fontColor || '#3a2f10'} onChange={v => set('fontColor', v)} label={tx("Ink (text)")} theme={theme} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120 }}>
                            <Slider label={tx("Tilt")} value={element.tilt ?? -3} onChange={v => set('tilt', v)} min={-12} max={12} step={1} displayValue={`${element.tilt ?? -3}°`} />
                        </div>
                    </>
                )}

                {/* ── Pomodoro: work / break minutes + live controls ── */}
                {type === 'pomodoro' && (() => {
                    const workMin = Math.max(1, Number(element.workMin ?? 25));
                    const breakMin = Math.max(1, Number(element.breakMin ?? 5));
                    const pomoSnap = computePomodoroState(liveTimer, element, nowSyncedMs);
                    const isRunning = pomoSnap.state === 'running';
                    const playPomodoro = () => {
                        const now = Date.now() + serverOffsetMs;
                        setTickNow(Date.now());
                        const snap = computePomodoroState(liveTimer, element, now);
                        const phaseDur = (snap.phase === 'break' ? breakMin : workMin) * 60;
                        const rem = snap.remainingSec > 0 ? snap.remainingSec : phaseDur;
                        onLiveAction?.('timers', element.id, {
                            kind: 'pomodoro',
                            state: 'running',
                            phase: snap.phase,
                            workMin,
                            breakMin,
                            remainingSec: rem,
                            count: snap.count,
                            anchorAt: now,
                        });
                    };
                    const pausePomodoro = () => {
                        const now = Date.now() + serverOffsetMs;
                        const snap = computePomodoroState(liveTimer, element, now);
                        onLiveAction?.('timers', element.id, {
                            kind: 'pomodoro',
                            state: 'paused',
                            phase: snap.phase,
                            workMin,
                            breakMin,
                            remainingSec: snap.remainingSec,
                            count: snap.count,
                            anchorAt: now,
                        });
                    };
                    const skipPomodoroPhase = () => {
                        const now = Date.now() + serverOffsetMs;
                        const snap = computePomodoroState(liveTimer, element, now);
                        const nextPhase = snap.phase === 'work' ? 'break' : 'work';
                        const nextCount = snap.phase === 'work' ? snap.count + 1 : snap.count;
                        const nextRem = (nextPhase === 'break' ? breakMin : workMin) * 60;
                        onLiveAction?.('timers', element.id, {
                            kind: 'pomodoro',
                            state: snap.state,
                            phase: nextPhase,
                            workMin,
                            breakMin,
                            remainingSec: nextRem,
                            count: nextCount,
                            anchorAt: now,
                        });
                    };
                    const resetPomodoro = () => {
                        const now = Date.now() + serverOffsetMs;
                        onLiveAction?.('timers', element.id, {
                            kind: 'pomodoro',
                            state: 'paused',
                            phase: 'work',
                            workMin,
                            breakMin,
                            remainingSec: workMin * 60,
                            count: 0,
                            anchorAt: now,
                        });
                    };
                    const updateInterval = (nextWork, nextBreak) => {
                        applyElementChange?.({ workMin: nextWork, breakMin: nextBreak });
                        if (liveTimer?.kind === 'pomodoro' && liveTimer.state !== 'running') {
                            const phase = liveTimer.phase === 'break' ? 'break' : 'work';
                            const nextRem = phase === 'break'
                                ? (nextBreak !== breakMin ? nextBreak * 60 : liveTimer.remainingSec)
                                : (nextWork !== workMin ? nextWork * 60 : liveTimer.remainingSec);
                            onLiveAction?.('timers', element.id, {
                                ...liveTimer,
                                kind: 'pomodoro',
                                workMin: nextWork,
                                breakMin: nextBreak,
                                remainingSec: nextRem,
                            });
                        }
                    };
                    return (
                        <>
                            <Group label={tx("Intervals")}>
                                <NumberInput value={element.workMin ?? 25} onChange={v => updateInterval(Math.max(1, v), breakMin)} min={1} max={180} style={{ width: 52 }} />
                                <span style={UNIT}>focus</span>
                                <NumberInput value={element.breakMin ?? 5} onChange={v => updateInterval(workMin, Math.max(1, v))} min={1} max={60} style={{ width: 52 }} />
                                <span style={UNIT}>break</span>
                            </Group>
                            <Group label={tx("Live")}>
                                <ToggleBtn active={isRunning} disabled={isRunning} onClick={playPomodoro} title={tx("Start or resume Pomodoro")}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Play size={11} /> {tx("Play")}
                                    </span>
                                </ToggleBtn>
                                <ToggleBtn active={!isRunning && liveTimer?.state === 'paused'} disabled={!isRunning} onClick={pausePomodoro} title={tx("Pause Pomodoro")}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Pause size={11} /> {tx("Pause")}
                                    </span>
                                </ToggleBtn>
                                <ToggleBtn active={false} onClick={skipPomodoroPhase} title={tx("Skip to next phase")}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <SkipForward size={11} /> {tx("Skip Phase")}
                                    </span>
                                </ToggleBtn>
                                <ToggleBtn active={false} onClick={resetPomodoro} title={tx("Reset Pomodoro")}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <RotateCcw size={11} /> {tx("Reset")}
                                    </span>
                                </ToggleBtn>
                            </Group>
                            <div style={{ fontSize: 10.5, color: isRunning ? '#86efac' : C.dim, fontFamily: 'ui-monospace, monospace' }}>
                                {pomoSnap.phase === 'break' ? 'Break' : 'Focus'} · {fmtTimerSec(pomoSnap.remainingSec)} · #{pomoSnap.count} done
                            </div>
                        </>
                    );
                })()}

                {/* ── Goal bar / liquid goal: label, progress, fill colour ── */}
                {(type === 'goal' || type === 'liquidgoal') && (
                    <>
                        <Group label={tx("Label")}>
                            <TextInput value={element.content} onChange={v => set('content', v)} placeholder={tx("Goal label")} style={{ width: 150 }} />
                        </Group>
                        <Group label={tx("Progress")}>
                            <NumberInput value={element.current} onChange={v => set('current', Math.max(0, v))} min={0} max={1000000} style={{ width: 64 }} />
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>/</span>
                            <NumberInput value={element.target} onChange={v => set('target', Math.max(1, v))} min={1} max={1000000} style={{ width: 64 }} />
                        </Group>
                        <Group label={tx("Text size")}>
                            <NumberInput value={element.fontSize} onChange={v => set('fontSize', v)} min={8} max={48} />
                        </Group>
                        <ColorInput value={element.fontColor} onChange={v => set('fontColor', v)} label={tx("Text color")} theme={theme} />
                        <ColorInput value={element.fillColor} onChange={v => set('fillColor', v)} label={tx("Bar color")} theme={theme} fallback="#6366f1" />
                    </>
                )}

                {/* ── Match scoreboard: teams, flags, score, status ── */}
                {type === 'match' && (
                    <>
                        {/* Match picker — search the feed and click one to fill + live-link */}
                        <Group label={tx("Find match")}>
                            <TextInput value={matchQuery} onChange={setMatchQuery} placeholder={tx("Search team (e.g. Brazil)…")} style={{ width: 174 }} />
                        </Group>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%', maxHeight: 156, overflowY: 'auto' }}>
                            {!matchFeed && (
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', padding: '2px 0' }}>Loading matches…</div>
                            )}
                            {matchFeed && (matchFeed.matches || [])
                                .slice()
                                .sort(matchSort)
                                .filter(m => {
                                    const s = matchQuery.trim().toLowerCase();
                                    return !s || m.home.name.toLowerCase().includes(s) || m.away.name.toLowerCase().includes(s) || (m.stage || '').toLowerCase().includes(s);
                                })
                                .slice(0, 40)
                                .map(m => {
                                    const sel = String(element.matchId) === String(m.id);
                                    const live = m.status === 'LIVE' || m.status === 'HT';
                                    const right = m.status === 'SCHED' ? fmtKickoff(m.utcDate) : m.status === 'FT' ? 'FT' : m.status === 'HT' ? 'HT' : `${m.minute ?? 0}'`;
                                    return (
                                        <button key={m.id} onClick={() => applyElementChange?.({
                                            matchId: m.id,
                                            teamA: m.home.name, flagA: m.home.flag,
                                            teamB: m.away.name, flagB: m.away.flag,
                                            scoreA: m.score.home, scoreB: m.score.away,
                                            status: m.status, minute: m.minute ?? 0,
                                            kickoff: m.status === 'SCHED' ? fmtKickoff(m.utcDate) : '',
                                        })} style={{
                                            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 7px', borderRadius: 6, cursor: 'pointer', textAlign: 'left', width: '100%', boxSizing: 'border-box',
                                            border: `1px solid ${sel ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.1)'}`,
                                            background: sel ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.04)',
                                        }}>
                                            <span style={{ flex: 1, fontSize: 11, color: '#fff', fontWeight: 600, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {m.home.name} {m.score.home}–{m.score.away} {m.away.name}
                                            </span>
                                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, lineHeight: 1.25 }}>
                                                <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>{fmtDay(m.utcDate)}</span>
                                                <span style={{ fontSize: 9, fontFamily: 'monospace', color: live ? '#ff7a7a' : 'rgba(255,255,255,0.45)' }}>{right}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            {matchFeed && (matchFeed.matches || []).length === 0 && (
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', padding: '2px 0' }}>
                                    {matchFeed.error ? `Feed error: ${matchFeed.error}` : 'No matches available.'}
                                </div>
                            )}
                        </div>
                        {element.matchId && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 9, color: '#4ade80', fontFamily: 'monospace' }}>● Live-linked · auto-updates</span>
                                    <ToggleBtn active={false} onClick={() => applyElementChange?.({ matchId: null })} title={tx("Unlink and edit by hand")}>{tx("Detach")}</ToggleBtn>
                                </div>
                                <span style={{ fontSize: 9, color: C.faint, lineHeight: 1.35 }}>
                                    Teams, scores, status & clock below are overridden by the live feed while linked. Detach to apply manual edits.
                                </span>
                            </div>
                        )}
                        {/* Match + team info for the linked match (free feed fields) */}
                        {element.matchId && matchFeed && (() => {
                            const sel = (matchFeed.matches || []).find(m => String(m.id) === String(element.matchId));
                            if (!sel) return null;
                            const Flag = ({ f }) => {
                                const s = String(f || '').trim();
                                const src = /^https?:\/\//i.test(s) ? s : (/^[a-z]{2}(-[a-z]{2,3})?$/.test(s.toLowerCase()) ? `https://flagcdn.com/w20/${s.toLowerCase()}.png` : null);
                                return src ? <img src={src} alt="" style={{ width: 16, height: 11, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }} /> : null;
                            };
                            const meta = [sel.stage, sel.group, sel.matchday ? `MD ${sel.matchday}` : ''].filter(Boolean).join(' · ');
                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#fff', fontWeight: 600 }}>
                                        <Flag f={sel.home.flag} /><span>{sel.home.full || sel.home.name}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.35)' }}>vs</span>
                                        <span>{sel.away.full || sel.away.name}</span><Flag f={sel.away.flag} />
                                    </div>
                                    {meta && <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5 }}>{meta}</div>}
                                    {sel.referee && <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.45)' }}>Referee: {sel.referee.name}{sel.referee.nationality ? ` · ${sel.referee.nationality}` : ''}</div>}
                                </div>
                            );
                        })()}
                        {matchFeed && matchFeed.configured === false && (
                            <div style={{ fontSize: 9, color: 'rgba(250,204,21,0.85)', fontFamily: 'monospace', lineHeight: 1.4 }}>
                                Sample data. Set FOOTBALL_DATA_TOKEN for live World Cup matches.
                            </div>
                        )}

                        <Group label={tx("Teams")}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
                                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                                    <TextInput value={element.teamA} onChange={v => set('teamA', v)} placeholder={tx("Home")} style={{ width: 86 }} />
                                    <TextInput value={element.flagA} onChange={v => set('flagA', v)} placeholder="br" style={{ width: 44 }} />
                                    <span style={UNIT}>home</span>
                                </div>
                                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                                    <TextInput value={element.teamB} onChange={v => set('teamB', v)} placeholder={tx("Away")} style={{ width: 86 }} />
                                    <TextInput value={element.flagB} onChange={v => set('flagB', v)} placeholder="ar" style={{ width: 44 }} />
                                    <span style={UNIT}>away</span>
                                </div>
                            </div>
                        </Group>
                        <Group label={tx("Score")}>
                            <NumberInput value={element.scoreA ?? 0} onChange={v => set('scoreA', Math.max(0, v))} min={0} max={99} style={{ width: 46 }} />
                            <ToggleBtn active={false} onClick={() => set('scoreA', Math.max(0, (element.scoreA ?? 0) + 1))} title={tx("Home +1")}>+</ToggleBtn>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>–</span>
                            <ToggleBtn active={false} onClick={() => set('scoreB', Math.max(0, (element.scoreB ?? 0) + 1))} title={tx("Away +1")}>+</ToggleBtn>
                            <NumberInput value={element.scoreB ?? 0} onChange={v => set('scoreB', Math.max(0, v))} min={0} max={99} style={{ width: 46 }} />
                        </Group>
                        <Group label={tx("Status")}>
                            {[['LIVE', 'Live'], ['HT', 'Half'], ['FT', 'Full'], ['SCHED', 'Soon']].map(([v, l]) => (
                                <ToggleBtn key={v} active={(element.status ?? 'LIVE') === v} onClick={() => set('status', v)} title={l}>{l}</ToggleBtn>
                            ))}
                        </Group>
                        {(element.status ?? 'LIVE') === 'LIVE' && (
                            <Group label={tx("Minute")}>
                                <NumberInput value={element.minute ?? 0} onChange={v => set('minute', Math.max(0, Math.min(120, v)))} min={0} max={120} style={{ width: 52 }} />
                                <span style={UNIT}>of 90'</span>
                            </Group>
                        )}
                        {(element.status ?? 'LIVE') === 'SCHED' && (
                            <Group label={tx("Kickoff")}>
                                <TextInput value={element.kickoff} onChange={v => set('kickoff', v)} placeholder="19:00" style={{ width: 90 }} />
                            </Group>
                        )}
                        <Group label={tx("Scorers")}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
                                <TextArea value={element.scorersHome} onChange={v => set('scorersHome', v)} rows={2} placeholder={`${element.teamA || 'Home'} — Ronaldo 23', 45', Fernandes 67'`} />
                                <TextArea value={element.scorersAway} onChange={v => set('scorersAway', v)} rows={2} placeholder={`${element.teamB || 'Away'} scorers`} />
                            </div>
                        </Group>
                        <Hint>
                            Scorers are manual — the free feed has no goal data. Separate players with a comma; extra minutes after a name are that player's other goals (Ronaldo 23', 45').
                        </Hint>
                        {(() => {
                            const gh = countScorerGoals(element.scorersHome), ga = countScorerGoals(element.scorersAway);
                            const sh = element.scoreA ?? 0, sa = element.scoreB ?? 0;
                            const miss = [];
                            if (gh !== sh) miss.push(`${element.teamA || 'Home'} ${gh}/${sh}`);
                            if (ga !== sa) miss.push(`${element.teamB || 'Away'} ${ga}/${sa}`);
                            return miss.length ? (
                                <div style={{ fontSize: 9.5, color: '#fbbf24', fontFamily: 'monospace', lineHeight: 1.4, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 5, padding: '5px 8px' }}>
                                    ⚠ Scorers don't match the score — {miss.join(', ')} goals listed. Add the rest, or they came from the live feed.
                                </div>
                            ) : null;
                        })()}
                        <Group label={tx("Size")}>
                            <NumberInput value={element.fontSize ?? 30} onChange={v => set('fontSize', Math.max(14, Math.min(80, v)))} min={14} max={80} style={{ width: 52 }} />
                        </Group>
                        <ColorInput value={element.fontColor} onChange={v => set('fontColor', v)} label={tx("Name color")} theme={theme} />
                        <ColorInput value={element.fillColor} onChange={v => set('fillColor', v)} label={tx("Score color")} theme={theme} fallback="#facc15" />
                        <Hint>
                            Flag = 2-letter country code (br, ar, fr, de, gb-eng…). Tap + as goals go in.
                        </Hint>
                    </>
                )}
                {/* Lower third sub-text */}
                {type === 'lowerthird' && (
                    <Group label={tx("Subtitle")}>
                        <TextInput
                            value={element.subContent}
                            onChange={v => set('subContent', v)}
                            placeholder={tx("Role / subtitle")}
                            style={{ width: 130 }}
                        />
                    </Group>
                )}
                {/* ── Logo controls ── */}
                {type === 'logo' && (
                    <>
                        <Group label={tx("Image")}>
                            <button
                                onClick={() => fileRef.current?.click()}
                                style={{
                                    background: 'var(--qs-accent-soft)',
                                    border: '1px solid var(--qs-accent-line)',
                                    borderRadius: 5, color: 'var(--qs-text)',
                                    fontSize: 11, padding: '4px 10px',
                                    cursor: 'pointer',
                                    fontFamily: 'inter, system-ui',
                                }}
                            >
                                {element.src ? <><RefreshCw size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{tx("Replace")}</> : <><Upload size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{tx("Upload")}</>}
                            </button>
                            <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                            {element.src && (
                                <button
                                    onClick={() => applyElementChange?.({ src: null })}
                                    style={{ background: 'none', border: '1px solid rgba(255,100,100,0.3)', borderRadius: 5, color: 'rgba(255,100,100,0.7)', fontSize: 11, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </Group>

                        <Group label={tx("Fit")}>
                            <SelectInput
                                value={element.objectFit}
                                onChange={v => set('objectFit', v)}
                                options={[
                                    { value: 'contain', label: tx("Contain") },
                                    { value: 'cover',   label: tx("Cover")   },
                                    { value: 'fill',    label: tx("Stretch") },
                                ]}
                            />
                        </Group>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120 }}>
                            <Slider
                                label={tx("Trim (padding)")}
                                value={element.imgPadding}
                                onChange={v => set('imgPadding', v)}
                                min={0} max={40} step={1}
                                displayValue={`${element.imgPadding ?? 0}px`}
                            />
                        </div>

                    </>
                )}

                {/* ── Cam frame controls ── */}
                {type === 'frame' && (
                    <>
                        <Group label={tx("Frame style")}>
                            <SelectInput value={element.frameStyle ?? 'solid'} onChange={v => set('frameStyle', v)} options={withThemeOption(FRAME_STYLES, '@frame')} />
                        </Group>
                        {(element.frameStyle === '@frame' || isGraphicFrame(element.frameStyle)) && (
                            <Group label={tx("Label")}>
                                <TextInput value={element.content === 'New Title' ? '' : element.content} onChange={v => set('content', v)} placeholder={tx("CAM_01 / webcam.exe / REC")} style={{ width: 130 }} />
                            </Group>
                        )}
                        <Group label={tx("Border width")}>
                            <NumberInput value={element.borderWidth} onChange={v => set('borderWidth', v)} min={1} max={24} style={{ width: 52 }} />
                        </Group>
                        <Group label={tx("OBS window")}>
                            <ToggleBtn
                                active={!!element.hole}
                                onClick={() => set('hole', !element.hole)}
                                title={tx("Cut a transparent hole and auto-fit OBS Game / Desktop capture inside this frame")}
                            >
                                {element.hole ? 'Cutout ON' : 'Cutout OFF'}
                            </ToggleBtn>
                        </Group>
                        <Hint>
                            {element.hole
                                ? 'Cuts a hole in the background and scales your OBS Game/Desktop capture to fit inside without cropping.'
                                : 'Frame colour follows the theme accent. Enable Cutout ON to use this frame as an OBS Game/Desktop window.'}
                        </Hint>
                    </>
                )}

                {/* ── Live chat ── */}
                {type === 'chat' && (
                    <>
                        <ChannelOverrideFields
                            roomChannel={twitchChannel}
                            onRoomChannelChange={onTwitchChannelChange}
                            elementChannel={element.channel}
                            onElementChannelChange={v => set('channel', v)}
                        />
                        <Group label={tx("Style")}>
                            <SelectInput value={element.variant ?? '@lt'} onChange={v => set('variant', v)} options={withThemeOption(LOWER_THIRDS, '@lt')} />
                        </Group>
                        <Group label={tx("Size")}>
                            <NumberInput value={element.fontSize} onChange={v => set('fontSize', v)} min={10} max={48} />
                        </Group>
                        <ColorInput value={element.fontColor} onChange={v => set('fontColor', v)} label={tx("Text")} theme={theme} />
                        <Group label={tx("Show last")}>
                            <NumberInput value={element.maxMessages} onChange={v => set('maxMessages', v)} min={1} max={40} style={{ width: 52 }} />
                        </Group>
                        <Group label={tx("Fade after (s)")}>
                            <NumberInput value={element.fadeSec} onChange={v => set('fadeSec', v)} min={0} max={600} style={{ width: 52 }} />
                        </Group>
                        <Group label={tx("Filter")}>
                            <ToggleBtn active={element.hideCommands !== false} onClick={() => set('hideCommands', element.hideCommands === false)} title={tx("Hide !commands")}>!cmds</ToggleBtn>
                            <ToggleBtn active={element.hideBots !== false} onClick={() => set('hideBots', element.hideBots === false)} title={tx("Hide Nightbot, StreamElements and other bots")}>bots</ToggleBtn>
                        </Group>
                        <Group label={tx("Show")}>
                            <ToggleBtn active={element.showBadges !== false} onClick={() => set('showBadges', element.showBadges === false)} title={tx("Mod / VIP / sub badges")}>badges</ToggleBtn>
                            <ToggleBtn active={element.showEvents !== false} onClick={() => set('showEvents', element.showEvents === false)} title={tx("Subs, gift subs and raids")}>subs & raids</ToggleBtn>
                        </Group>
                        <Hint>
                            Read-only, no login needed. Leave Box channel empty to inherit the room's Twitch channel. Fade 0 = keep messages.
                        </Hint>
                    </>
                )}

                {/* ── Alert box / event list ── */}
                {(type === 'alerts' || type === 'eventlist') && (
                    <>
                        <ChannelOverrideFields
                            roomChannel={twitchChannel}
                            onRoomChannelChange={onTwitchChannelChange}
                            elementChannel={element.channel}
                            onElementChannelChange={v => set('channel', v)}
                        />
                        <Group label={tx("Style")}>
                            <SelectInput value={element.variant ?? '@lt'} onChange={v => set('variant', v)} options={withThemeOption(LOWER_THIRDS, '@lt')} />
                        </Group>
                        <Group label={tx("Size")}>
                            <NumberInput value={element.fontSize} onChange={v => set('fontSize', v)} min={10} max={72} />
                        </Group>
                        {type === 'alerts' && (
                            <>
                                <Group label={tx("Name effect")}>
                                    <SelectInput value={element.fx ?? '@fx'} onChange={v => set('fx', v)} options={withThemeOption(TEXT_FX, '@fx')} />
                                </Group>
                                <Group label={tx("Show for (s)")}>
                                    <NumberInput value={element.durationSec} onChange={v => set('durationSec', v)} min={2} max={30} style={{ width: 52 }} />
                                </Group>
                                <Group label={tx("Sound")}>
                                    <ToggleBtn active={element.sound !== false} onClick={() => set('sound', element.sound === false)} title={tx("Play a chime in OBS")}>chime</ToggleBtn>
                                    <ToggleBtn active={element.showMessage !== false} onClick={() => set('showMessage', element.showMessage === false)} title={tx("Show the viewer's message")}>message</ToggleBtn>
                                </Group>
                                {element.sound !== false && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110 }}>
                                        <Slider label={tx("Chime vol")} value={element.volume ?? 0.5} onChange={v => set('volume', v)} />
                                    </div>
                                )}
                            </>
                        )}
                        {type === 'eventlist' && (
                            <>
                                <Group label={tx("Title")}>
                                    <TextInput value={element.content} onChange={v => set('content', v)} placeholder={tx("(none)")} style={{ width: 120 }} />
                                </Group>
                                <Group label={tx("Show last")}>
                                    <NumberInput value={element.maxEvents} onChange={v => set('maxEvents', v)} min={1} max={20} style={{ width: 52 }} />
                                </Group>
                            </>
                        )}
                        <Group label={tx("Events")}>
                            {[['showSubs', 'subs'], ['showGifts', 'gifts'], ['showRaids', 'raids'], ['showCheers', 'cheers']].map(([k, label]) => (
                                <ToggleBtn key={k} active={element[k] !== false} onClick={() => set(k, element[k] === false)} title={`Show ${label}`}>{label}</ToggleBtn>
                            ))}
                        </Group>
                        <Group label={tx("Min bits")}>
                            <NumberInput value={element.minBits} onChange={v => set('minBits', v)} min={1} max={100000} style={{ width: 64 }} />
                        </Group>
                        {type === 'alerts' && (
                            <Group label={tx("Test")}>
                                {[['sub', 'Sub'], ['resub', 'Resub'], ['giftbomb', 'Gifts'], ['raid', 'Raid'], ['cheer', 'Cheer']].map(([t, label]) => (
                                    <ToggleBtn
                                        key={t}
                                        active={false}
                                        onClick={() => {
                                            if (onLiveAction) {
                                                onLiveAction('triggers', element.id, { kind: 'alerts', type: t });
                                            } else {
                                                fallbackUpdate?.({ test: { type: t, at: Date.now() } });
                                            }
                                        }}
                                        title={`Play a test ${label.toLowerCase()} alert (also shows in OBS)`}
                                    >
                                        {label}
                                    </ToggleBtn>
                                ))}
                            </Group>
                        )}
                        <Hint>
                            Subs, gift subs, raids and cheers come straight from Twitch chat, no login needed. Follows need Twitch login and aren't supported yet.
                        </Hint>
                    </>
                )}

                {/* ── Backdrop scenery ── */}
                {type === 'backdrop' && (
                    <>
                        <Group label={tx("Scenery")}>
                            <SelectInput value={element.variant ?? '@backdrop'} onChange={v => set('variant', v)} options={withThemeOption(BACKDROPS, '@backdrop')} />
                        </Group>
                        <Hint>
                            Best on Starting / BRB / Ending screens. It draws over OBS cameras, so leave it out of cam scenes.
                        </Hint>
                    </>
                )}
                </Section>
            )}

            {isText && (
                <Section title={tx("Text style")}>
                {/* ── Style kit: headline effect / plate style ── */}
                {type === 'text' && (
                    <Group label={tx("Effect")}>
                        <SelectInput value={element.fx ?? 'plain'} onChange={v => set('fx', v)} options={withThemeOption(TEXT_FX, '@fx')} />
                    </Group>
                )}
                <Group label={tx("Font")}>
                    <SelectInput
                        value={element.fontFamily ?? ''}
                        onChange={v => set('fontFamily', v || undefined)}
                        options={[{ value: '', label: tx("Theme body") }, { value: '@display', label: tx("Theme headline") }]}
                    />
                </Group>
                {type === 'lowerthird' && (
                    <Group label={tx("Plate")}>
                        <SelectInput value={element.variant ?? 'panel'} onChange={v => set('variant', v)} options={withThemeOption(LOWER_THIRDS, '@lt')} />
                    </Group>
                )}
                {/* ── Font controls ── */}
                {isText && (
                    <>
                        <Group label={tx("Size")}>
                            <NumberInput value={element.fontSize} onChange={v => set('fontSize', v)} min={8} max={120} />
                        </Group>

                        {type === 'lowerthird' && (
                            <Group label={tx("Sub size")}>
                                <NumberInput value={element.subFontSize} onChange={v => set('subFontSize', v)} min={8} max={60} />
                            </Group>
                        )}

                        <ColorInput value={element.fontColor} onChange={v => set('fontColor', v)} label={tx("Color")} theme={theme} />

                        {type === 'lowerthird' && (
                            <ColorInput value={element.subFontColor} onChange={v => set('subFontColor', v)} label={tx("Sub color")} theme={theme} />
                        )}

                        <Group label={tx("Style")}>
                            <ToggleBtn active={element.bold}   onClick={() => set('bold',   !element.bold)}   title={tx("Bold")}>B</ToggleBtn>
                            <ToggleBtn active={element.italic} onClick={() => set('italic', !element.italic)} title={tx("Italic")}><em>I</em></ToggleBtn>
                        </Group>

                        <Group label={tx("Align")}>
                            {['left', 'center', 'right'].map(a => (
                                <ToggleBtn key={a} active={element.align === a} onClick={() => set('align', a)} title={a}>
                                    {a === 'left' ? <AlignLeft size={13} /> : a === 'center' ? <AlignCenter size={13} /> : <AlignRight size={13} />}
                                </ToggleBtn>
                            ))}
                        </Group>

                        <Group label={tx("Letter spacing")}>
                            <NumberInput
                                value={element.letterSpacing ?? (type === 'countdown' ? 2 : 0)}
                                onChange={v => set('letterSpacing', v)}
                                min={-4} max={32} step={0.5}
                                style={{ width: 56 }}
                            />
                            <span style={UNIT}>px</span>
                        </Group>

                    </>
                )}
                </Section>
            )}

            <Section title={tx("Appearance")}>
                {/* ── Background (cards / text containers) ── */}
                {!isShapeFill && type !== 'frame' && type !== 'backdrop' && type !== 'chat' && type !== 'alerts' && type !== 'eventlist' && type !== 'wheel' && type !== 'note' && !isMoodEl && (
                    <>
                        <ColorInput value={element.bgColor} onChange={v => set('bgColor', v)} label={tx("BG Color")} theme={theme} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110 }}>
                            <Slider
                                label={tx("BG Opacity")}
                                value={element.bgOpacity ?? 0}
                                onChange={v => set('bgOpacity', v)}
                            />
                        </div>
                    </>
                )}
                {/* ── Divider / shape / circle / clip-shape fill ── */}
                {isShapeFill && (
                    <>
                        <ColorInput value={element.bgColor} onChange={v => set('bgColor', v)} label={tx("Color")} theme={theme} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110 }}>
                            <Slider label={tx("Fill opacity")} value={element.bgOpacity ?? 1} onChange={v => set('bgOpacity', v)} />
                        </div>
                    </>
                )}
                {/* ── Shared: border radius + element opacity ── */}
                {type !== 'divider' && type !== 'circle' && type !== 'wheel' && type !== 'note' && type !== 'backdrop' && type !== 'chat' && type !== 'alerts' && type !== 'eventlist' && !isClipShape && !isMoodEl && (
                    <Group label={tx("Radius")}>
                        <NumberInput value={element.borderRadius} onChange={v => set('borderRadius', v)} min={0} max={100} style={{ width: 52 }} />
                    </Group>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110 }}>
                    <Slider label={tx("Opacity")} value={element.opacity ?? 1} onChange={v => set('opacity', v)} />
                </div>

            </Section>

            <Section title={tx("Position & size")}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
                    {[['x', 'X'], ['y', 'Y'], ['w', tx("Width")], ['h', tx("Height")]].map(([k, label]) => (
                        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, ...FIELD, padding: '0 8px', height: 30, minWidth: 0 }}>
                            <span style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>{label}</span>
                            <BoxCoordInput
                                value={box[k]}
                                min={k === 'w' || k === 'h' ? 1 : 0}
                                max={k === 'x' ? 100 - box.w : k === 'y' ? 100 - box.h : 100}
                                onCommit={v => setBox(k, v)}
                            />
                            <span style={UNIT}>%</span>
                        </label>
                    ))}
                </div>
                <Hint>{tx("Percent of the 1920×1080 canvas, so positions match OBS exactly.")}</Hint>
            </Section>
        </div>
    );
};

export default ElementEditor;
