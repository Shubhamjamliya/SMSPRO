const stripApiVersion = (value) => {
    const base = String(value || '').replace(/\/$/, '');
    return base.endsWith('/api/v1') ? base.slice(0, -7) : base;
};

/** Convert a stored relative media path into a browser URL. */
export const getImageUrl = (value) => {
    if (!value) return '';

    if (typeof value !== 'string') {
        return getImageUrl(value.url || value.secure_url || value.imageUrl || value.image || value.src || '');
    }

    if (/^(https?:|data:|blob:)/i.test(value)) return value;

    const base = stripApiVersion(import.meta.env?.VITE_API_BASE_URL || '');
    const rawPath = value.startsWith('/') ? value : `/${value}`;
    const path = rawPath.startsWith('/api/v1/uploads')
        ? rawPath
        : rawPath.startsWith('/uploads')
            ? `/api/v1${rawPath}`
            : `/api/v1/uploads${rawPath}`;

    return `${base}${path}`;
};

export default getImageUrl;
