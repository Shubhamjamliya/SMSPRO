import multer from "multer";

const storage = multer.memoryStorage();

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const MEDIA_MIME = new Set([
  ...ALLOWED_MIME,
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
]);

const imageFileFilter = (req, file, cb) => {
  if (!file) {
    return cb(null, true);
  }
  const mime = String(file.mimetype || "").toLowerCase();
  if (ALLOWED_MIME.has(mime)) {
    return cb(null, true);
  }
  return cb(
    new Error("Only image or PDF files are allowed (jpg, png, webp, heic, pdf)"),
  );
};

const mediaFileFilter = (req, file, cb) => {
  if (!file) {
    return cb(null, true);
  }
  const mime = String(file.mimetype || "").toLowerCase();
  if (MEDIA_MIME.has(mime)) {
    return cb(null, true);
  }
  return cb(
    new Error(
      "Only image, PDF, or video files are allowed (jpg, png, webp, heic, pdf, mp4, webm, mov)",
    ),
  );
};

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: imageFileFilter,
});

/** Images + short videos for bike inspections (Cloudinary). */
export const uploadMedia = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: mediaFileFilter,
});
