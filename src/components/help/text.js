// Plain, accent-insensitive text for searching.
export const plain = value => String(value)
    .replace(/\*\*|\[|\]\([^)]*\)/g, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
