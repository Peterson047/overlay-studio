// qorpStreamer studio UI kit. Styles live in ./ui.css (tokens in ./tokens.css).
// New studio screens use these components instead of recreating controls
// with ad-hoc inline styles. Catalog: /?ui
import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import './ui.css';

const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Button({ variant = 'secondary', size, block, busy, className, children, type = 'button', ...rest }) {
    return (
        <button
            type={type}
            className={cx('qs-btn', variant !== 'secondary' && `qs-btn--${variant}`, size && `qs-btn--${size}`, block && 'qs-btn--block', className)}
            aria-busy={busy || undefined}
            disabled={rest.disabled || busy}
            {...rest}
        >
            {busy && <span className="qs-spin" aria-hidden="true" />}
            {children}
        </button>
    );
}

// Icon-only button: `title` doubles as the accessible name. `active` is a
// pressed/on state; `danger` tints it for destructive actions.
export function IconButton({ title, active, danger, size, variant, className, children, type = 'button', ...rest }) {
    return (
        <button
            type={type} title={title} aria-label={title}
            aria-pressed={active === undefined ? undefined : !!active}
            className={cx('qs-iconbtn', size && `qs-iconbtn--${size}`, variant === 'ghost' && 'qs-iconbtn--ghost', danger && 'qs-iconbtn--danger', className)}
            {...rest}
        >
            {children}
        </button>
    );
}

export function SegmentButton({ active, size, children, className, type = 'button', ...rest }) {
    return (
        <button type={type} aria-pressed={!!active} className={cx('qs-seg', size && `qs-seg--${size}`, className)} {...rest}>{children}</button>
    );
}

export function TextField({ value, onChange, className, style, ...rest }) {
    return (
        <input
            {...rest}
            className={cx('qs-input', className)}
            style={style}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
        />
    );
}

export function TextAreaField({ value, onChange, rows = 4, className, style, ...rest }) {
    return (
        <textarea
            {...rest} rows={rows}
            className={cx('qs-textarea', className)}
            style={style}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
        />
    );
}

// Number field that lets the user type freely (empty, "-", ".") and only
// commits valid, clamped numbers; Enter blurs.
export function NumberField({ value, onChange, min, max, step = 1, className, style, ...rest }) {
    const [focused, setFocused] = useState(false);
    const [draft, setDraft] = useState('');
    const str = value == null || value === '' ? '' : String(value);
    const clamp = (n) => {
        let out = n;
        if (typeof min === 'number') out = Math.max(min, out);
        if (typeof max === 'number') out = Math.min(max, out);
        return out;
    };
    return (
        <input
            {...rest}
            type="number" min={min} max={max} step={step}
            className={cx('qs-input', 'qs-input--number', className)}
            style={style}
            value={focused ? draft : str}
            onFocus={() => { setFocused(true); setDraft(str); }}
            onChange={e => {
                const next = e.target.value;
                setDraft(next);
                if (next.trim() === '' || next === '-' || next === '.' || next === '-.') return;
                const parsed = Number(next);
                if (Number.isFinite(parsed)) onChange(clamp(parsed));
            }}
            onBlur={() => {
                setFocused(false);
                const parsed = draft.trim() === '' ? NaN : Number(draft);
                if (Number.isFinite(parsed)) {
                    const clamped = clamp(parsed);
                    if (clamped !== value) onChange(clamped);
                } else if (str === '') {
                    onChange(typeof min === 'number' ? min : 0);
                }
            }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
    );
}

export function SelectField({ value, onChange, options, className, ...rest }) {
    return (
        <select {...rest} className={cx('qs-select', className)} value={value} onChange={e => onChange(e.target.value)}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

export function Slider({ value, onChange, min = 0, max = 1, step = 0.01, displayValue, ariaLabel }) {
    const v = value ?? min;
    const fill = max > min ? ((v - min) / (max - min)) * 100 : 0;
    return (
        <div className="qs-slider">
            <input
                type="range" min={min} max={max} step={step} value={v}
                aria-label={ariaLabel}
                style={{ '--fill': `${Math.max(0, Math.min(100, fill))}%` }}
                onChange={e => onChange(Number(e.target.value))}
            />
            <span className="qs-slider-value">{displayValue ?? `${Math.round(v * 100)}%`}</span>
        </div>
    );
}

// Label + control row; `stack` puts the label above wide content.
export function Field({ label, stack, children }) {
    return (
        <div className={cx('qs-field', stack && 'qs-field--stack', !label && !stack && 'qs-field--bare')}>
            {label && <span className="qs-field-label">{label}</span>}
            <div className="qs-field-control">{children}</div>
        </div>
    );
}

export function ColorField({ hex, swatch, token, label, onChange }) {
    return (
        <span className="qs-color">
            <label className="qs-swatch" style={{ background: swatch || hex }}>
                <input type="color" value={hex} aria-label={label} onChange={e => onChange(e.target.value)} />
            </label>
            {token && <span className="qs-token">{token}</span>}
            <span className="qs-hex">{hex.toUpperCase()}</span>
        </span>
    );
}

// Collapsible section. Pass `storageKey` + `id` to remember open/closed.
export function Section({ title, id, storageKey, defaultOpen = true, children }) {
    const read = () => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } };
    const [open, setOpen] = useState(() => (storageKey ? read()[id ?? title] !== false : defaultOpen));
    const toggle = () => setOpen(o => {
        if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify({ ...read(), [id ?? title]: !o })); } catch { /* blocked */ } }
        return !o;
    });
    return (
        <div className="qs-section">
            <button type="button" className="qs-section-head" aria-expanded={open} onClick={toggle}>
                {title}<ChevronDown size={14} aria-hidden="true" />
            </button>
            {open && <div className="qs-section-body">{children}</div>}
        </div>
    );
}

export function Hint({ children }) {
    return <div className="qs-hint"><Info size={12} aria-hidden="true" /><span>{children}</span></div>;
}

export function Badge({ tone, children }) {
    return <span className={cx('qs-badge', tone && `qs-badge--${tone}`)}>{children}</span>;
}
