// Helpers do laboratório de widgets (etapa 0). Ver src/components/WidgetLab.jsx.

export const DEFAULTS = {
    url: '',
    vw: 800,   // viewport interno do widget (tamanho para o qual ele foi desenhado)
    vh: 600,
    x: 560,    // posição e largura na cena 1920×1080
    y: 240,
    w: 800,
    cycle: 0,  // segundos entre trocas de cena simuladas (0 = desligado)
};

export function encodeConfig(cfg) {
    const json = JSON.stringify(cfg);
    return btoa(unescape(encodeURIComponent(json)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeConfig(hash) {
    try {
        const raw = hash.replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
        if (!raw) return null;
        const cfg = JSON.parse(decodeURIComponent(escape(atob(raw))));
        return { ...DEFAULTS, ...cfg };
    } catch {
        return null;
    }
}

// Só HTTPS e nada de endereços locais: o player nunca deve abrir algo da
// rede do criador nem esquemas executáveis.
export function validateWidgetUrl(value) {
    let u;
    try { u = new URL(value); } catch { return 'URL inválida.'; }
    if (u.protocol !== 'https:') return 'Use uma URL https://.';
    const host = u.hostname.toLowerCase();
    if (
        host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
        /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.startsWith('[')
    ) return 'Endereços locais não são permitidos.';
    return null;
}
