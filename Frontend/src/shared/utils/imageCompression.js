import imageCompression from 'browser-image-compression';

/**
 * Compresses an image file before upload.
 * @param {File} imageFile - The original image file.
 * @param {Object} options - Compression options.
 * @returns {Promise<File>} - The compressed image file.
 */
export const compressImage = async (imageFile, options = {}) => {
  const inFlutterWebView =
    typeof window !== 'undefined' && Boolean(window.flutter_inappwebview);
  const defaultOptions = {
    maxSizeMB: 0.5, // 500KB
    maxWidthOrHeight: 1200,
    // Web workers hang / return empty blobs in Flutter InAppWebView.
    useWebWorker: !inFlutterWebView,
    fileType: 'image/webp', // Convert to webp on upload if possible
    initialQuality: 0.8,
  };

  const finalOptions = { ...defaultOptions, ...options };

  try {
    const compressedFile = await imageCompression(imageFile, finalOptions);
    // browser-image-compression may return a Blob — normalize to File for FormData uploads
    if (typeof File !== 'undefined' && compressedFile instanceof File) {
      return compressedFile;
    }
    if (typeof Blob !== 'undefined' && compressedFile instanceof Blob) {
      const type = compressedFile.type || 'image/webp';
      const baseName = (imageFile?.name || 'upload').replace(/\.[^.]+$/, '');
      try {
        return new File([compressedFile], `${baseName}.webp`, {
          type,
          lastModified: Date.now(),
        });
      } catch {
        return compressedFile;
      }
    }
    return imageFile;
  } catch (error) {
    console.error('Image compression failed:', error);
    return imageFile; // Return original if compression fails
  }
};
