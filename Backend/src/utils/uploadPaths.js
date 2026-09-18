import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_UPLOAD_ROOT = path.resolve(CURRENT_DIRECTORY, '..', 'uploads');

const toAbsolutePath = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    return path.isAbsolute(normalized)
        ? path.normalize(normalized)
        : path.resolve(process.cwd(), normalized);
};

/** One resolver used by storage and static serving. */
export const resolveUploadRoot = () =>
    toAbsolutePath(process.env.UPLOAD_DIR) || DEFAULT_UPLOAD_ROOT;

const normalizeFolder = (folder) => {
    const value = String(folder || '').replace(/\\/g, '/').trim();
    const parts = value.split('/').filter(Boolean);
    if (!parts.length || parts.some((part) => part === '.' || part === '..' || !/^[a-zA-Z0-9_-]+$/.test(part))) {
        throw new Error('Invalid upload folder');
    }
    return parts.join('/');
};

export const getUploadDirectory = (folder) => {
    // Keep the folder argument for API compatibility, but store every upload
    // directly in the single configured upload root.
    if (folder) normalizeFolder(folder);
    return resolveUploadRoot();
};

export const getUploadPublicUrl = (folder, fileName) => {
    const safeFileName = path.basename(String(fileName || '').trim());
    if (!safeFileName || safeFileName === '.' || safeFileName === '..') {
        throw new Error('File name is required');
    }
    return `/uploads/${safeFileName}`;
};
