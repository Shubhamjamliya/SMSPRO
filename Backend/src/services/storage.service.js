import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { getUploadDirectory, getUploadPublicUrl } from '../utils/uploadPaths.js';

const imageOptions = (folder) => {
    const value = String(folder || '').toLowerCase();
    if (value.includes('profile')) return { width: 400, height: 400, quality: 80, prefix: 'profile' };
    if (value.includes('banner')) return { width: 1600, height: 600, quality: 85, prefix: 'banner' };
    return { width: 800, height: 800, quality: 80, prefix: 'img' };
};

const id = () => crypto.randomBytes(8).toString('hex');

const extensionForMime = (mime = '') => ({
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
}[String(mime).toLowerCase()] || 'bin');

export const uploadImageBuffer = async (buffer, folder = 'uploads') => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('File buffer is required');

    const { width, height, quality, prefix } = imageOptions(folder);
    const fileName = `${prefix}_${id()}.webp`;
    const targetDir = getUploadDirectory(folder);
    await fs.mkdir(targetDir, { recursive: true });

    await sharp(buffer)
        .rotate()
        .resize({ width, height, fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toFile(path.join(targetDir, fileName));

    return getUploadPublicUrl(folder, fileName);
};

export const uploadFileBuffer = async (buffer, folder = 'uploads', options = {}) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('File buffer is required');

    const extension = String(options.extension || extensionForMime(options.mimeType)).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const prefix = String(options.prefix || 'file').replace(/[^a-z0-9_-]/gi, '') || 'file';
    const fileName = `${prefix}_${id()}.${extension}`;
    const targetDir = getUploadDirectory(folder);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, fileName), buffer, { mode: 0o644 });

    return getUploadPublicUrl(folder, fileName);
};
