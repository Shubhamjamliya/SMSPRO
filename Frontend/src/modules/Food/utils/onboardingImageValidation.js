export const ONBOARDING_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif"

export const ONBOARDING_IMAGE_RULES = {
  minBytes: 20 * 1024,
  documentMaxBytes: 2.5 * 1024 * 1024,
  menuMaxBytes: 5 * 1024 * 1024,
  allowedTypes: new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
}

const getMaxBytes = (kind) =>
  kind === "menu" ? ONBOARDING_IMAGE_RULES.menuMaxBytes : ONBOARDING_IMAGE_RULES.documentMaxBytes

const formatMb = (bytes) => `${bytes / (1024 * 1024)}MB`

export const validateOnboardingImageFile = (file, kind = "document", label = "Image") => {
  if (!file) return null

  if (file.type && !ONBOARDING_IMAGE_RULES.allowedTypes.has(file.type)) {
    return `${label} must be JPG, PNG, WEBP, HEIC or HEIF`
  }

  if (Number(file.size || 0) < ONBOARDING_IMAGE_RULES.minBytes) {
    return `${label} is too small. Minimum size is 20KB`
  }

  const maxBytes = getMaxBytes(kind)
  if (Number(file.size || 0) > maxBytes) {
    return `${label} is too large. Maximum size is ${formatMb(maxBytes)}`
  }

  return null
}

export const filterValidOnboardingImages = (files = [], kind = "document", label = "Image") => {
  const valid = []
  const errors = []

  Array.from(files || []).forEach((file) => {
    const error = validateOnboardingImageFile(file, kind, label)
    if (error) errors.push(error)
    else valid.push(file)
  })

  return { valid, errors }
}
