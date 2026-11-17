/**
 * Google Analytics 4 (gtag.js), loaded directly — no Tag Manager.
 *
 * Loaded from main.jsx instead of a hardcoded <script> in index.html so we can
 * skip the loads that aren't real visits: OBS renders the overlay in a headless
 * browser source that reloads on every scene switch, which would otherwise
 * drown the landing-page numbers in fake sessions.
 *
 * Set VITE_GA_ID at build time to enable analytics for that property.
 */

const GA_ID = import.meta.env.VITE_GA_ID;

// Only the OBS browser source is worth excluding — it carries ?obs= and
// reloads on every scene switch, which would otherwise drown the real numbers
// in fake sessions. A ?room= link is still a person opening the editor (the
// creator, or someone they shared it with), so that counts.
function isOverlayLoad() {
    const q = new URLSearchParams(window.location.search);
    // widgetlab carries a private widget URL in the hash; never report it.
    // conta receives one-time OAuth codes in the URL; keep them out of GA too.
    return q.has('obs') || q.has('clean') || q.has('widgetlab') || q.has('conta');
}

export function initAnalytics() {
    if (!GA_ID || typeof window === 'undefined' || isOverlayLoad()) return;

    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments) }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID);
}

// Custom event helper — GA4 takes these for free, unlike Vercel's (Pro-only)
// custom events. Safe to call before/without init; it just no-ops.
export function track(name, params) {
    window.gtag?.('event', name, params);
}
