export function normalizeDeliverySpeedOption(option = {}) {
  const code = String(option?.code || "").trim().toLowerCase()
  if (!code) return null

  const etaMinutesMin = Number(option.etaMinutesMin ?? 0)
  const etaMinutesMax = Number(option.etaMinutesMax ?? etaMinutesMin)

  return {
    code,
    label: String(option.label || code).trim(),
    description: String(option.description || "").trim(),
    etaMinutesMin,
    etaMinutesMax,
    extraFee: Number(option.extraFee ?? option.fee ?? 0),
    isDefault: Boolean(option.isDefault),
  }
}

export function normalizeDeliverySpeedOptions(options) {
  if (!Array.isArray(options)) return []
  return options.map(normalizeDeliverySpeedOption).filter(Boolean)
}

export function pickDefaultDeliverySpeedCode(options) {
  const list = normalizeDeliverySpeedOptions(options)
  if (list.length === 0) return null
  return list.find((option) => option.isDefault)?.code || list[0].code
}

export function extractDeliverySpeedOptionsFromResponse(response) {
  const payload = response?.data?.data ?? response?.data ?? {}
  const raw =
    payload?.options ??
    payload?.deliverySpeedOptions ??
    (Array.isArray(payload) ? payload : [])

  return normalizeDeliverySpeedOptions(raw)
}
