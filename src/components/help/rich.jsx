// Inline markup shared by the help and legal pages: **bold** and [text](href).
import { Fragment } from 'react';

export function Rich({ text }) {
    const parts = String(text).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
        const bold = /^\*\*(.+)\*\*$/.exec(part);
        if (bold) return <strong key={i}>{bold[1]}</strong>;
        const link = /^\[(.+)\]\((.+)\)$/.exec(part);
        if (link) {
            const external = /^https?:/.test(link[2]);
            return <a key={i} href={link[2]} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{link[1]}</a>;
        }
        return <Fragment key={i}>{part}</Fragment>;
    });
}

export function Block({ block }) {
    if (block.p) return <p><Rich text={block.p} /></p>;
    if (block.note) return <p className="qt-note"><Rich text={block.note} /></p>;
    if (block.ul) return <ul>{block.ul.map(item => <li key={item}><Rich text={item} /></li>)}</ul>;
    if (block.ol) return <ol>{block.ol.map(item => <li key={item}><Rich text={item} /></li>)}</ol>;
    return null;
}
