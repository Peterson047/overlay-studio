// Shared client-side image downscaler used by background and logo uploaders so
// stored room JSON stays well within Upstash Redis free-tier size limits.

export function scaleImageFile(
    file,
    { maxDim = 640, quality = 0.84, preserveAlpha = false } = {},
) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No image file provided'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
        reader.onload = () => {
            const rawUrl = String(reader.result || '');
            const MAX_FALLBACK_CHARS = 1_200_000;
            const resolveSafeFallback = () => {
                if (rawUrl.length > MAX_FALLBACK_CHARS) {
                    reject(new Error('Image is too large and could not be scaled down in browser. Please upload a smaller PNG/JPEG.'));
                    return;
                }
                resolve(rawUrl);
            };
            const img = new Image();
            img.onerror = resolveSafeFallback;
            img.onload = () => {
                const sw = img.naturalWidth || img.width || 0;
                const sh = img.naturalHeight || img.height || 0;
                if (!sw || !sh) {
                    resolveSafeFallback();
                    return;
                }
                const ratio = Math.min(1, maxDim / Math.max(sw, sh));
                const w = Math.max(1, Math.round(sw * ratio));
                const h = Math.max(1, Math.round(sh * ratio));
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        resolveSafeFallback();
                        return;
                    }
                    ctx.clearRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    const mime = preserveAlpha ? 'image/png' : 'image/jpeg';
                    resolve(canvas.toDataURL(mime, quality));
                } catch {
                    resolveSafeFallback();
                }
            };
            img.src = rawUrl;
        };
        reader.readAsDataURL(file);
    });
}
