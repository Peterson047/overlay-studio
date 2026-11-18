import { useEffect } from 'react';

// These pages are lazy-loaded, so the browser has already given up on the
// URL #fragment by the time the target exists. Scroll to it once mounted.
export function useHashScroll() {
    useEffect(() => {
        const id = decodeURIComponent(window.location.hash.slice(1));
        if (!id) return undefined;
        const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
        return () => cancelAnimationFrame(frame);
    }, []);
}
