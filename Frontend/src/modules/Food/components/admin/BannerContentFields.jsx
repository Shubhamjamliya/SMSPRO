import { Label } from "@food/components/ui/label"
import { Input } from "@food/components/ui/input"

/**
 * Shared content fields for hero / under-250 / dining banners.
 * Matches user-side overlay design:
 * - title → eyebrow / badge
 * - subtitle → main headline
 * - description → supporting text
 * - ctaText → button / promo pill
 * - ctaLink → click destination
 */
export default function BannerContentFields({
  values,
  onChange,
  labels = {},
  showDescription = true,
  showCtaLink = true,
  className = "",
}) {
  const {
    titleLabel = "Eyebrow / Badge",
    titleHint = "Small label above the headline (e.g. A SIX IS HIT!)",
    subtitleLabel = "Headline",
    subtitleHint = "Main promo text users see first",
    descriptionLabel = "Supporting text",
    descriptionHint = "Optional short line under the headline",
    ctaTextLabel = "CTA / Promo text",
    ctaTextHint = "Button or pill text (e.g. Order Now)",
    ctaLinkLabel = "CTA link",
    ctaLinkHint = "Optional path or URL (e.g. /food/user/offers)",
  } = labels

  const setField = (key, value) => {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
      <div className="space-y-1.5">
        <Label htmlFor="banner-title">{titleLabel}</Label>
        <Input
          id="banner-title"
          value={values.title || ""}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="e.g. Match Day Special"
          maxLength={80}
        />
        <p className="text-xs text-slate-500">{titleHint}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="banner-subtitle">{subtitleLabel}</Label>
        <Input
          id="banner-subtitle"
          value={values.subtitle || ""}
          onChange={(e) => setField("subtitle", e.target.value)}
          placeholder="e.g. 66% OFF FOR 10 MIN!"
          maxLength={120}
        />
        <p className="text-xs text-slate-500">{subtitleHint}</p>
      </div>

      {showDescription && (
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="banner-description">{descriptionLabel}</Label>
          <Input
            id="banner-description"
            value={values.description || ""}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="e.g. Delicious meals that won't break the bank"
            maxLength={200}
          />
          <p className="text-xs text-slate-500">{descriptionHint}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="banner-cta-text">{ctaTextLabel}</Label>
        <Input
          id="banner-cta-text"
          value={values.ctaText || ""}
          onChange={(e) => setField("ctaText", e.target.value)}
          placeholder="e.g. Order Now"
          maxLength={40}
        />
        <p className="text-xs text-slate-500">{ctaTextHint}</p>
      </div>

      {showCtaLink && (
        <div className="space-y-1.5">
          <Label htmlFor="banner-cta-link">{ctaLinkLabel}</Label>
          <Input
            id="banner-cta-link"
            value={values.ctaLink || ""}
            onChange={(e) => setField("ctaLink", e.target.value)}
            placeholder="/food/user/offers"
            maxLength={300}
          />
          <p className="text-xs text-slate-500">{ctaLinkHint}</p>
        </div>
      )}
    </div>
  )
}

export const emptyBannerContent = () => ({
  title: "",
  subtitle: "",
  description: "",
  ctaText: "",
  ctaLink: "",
})

export const appendBannerContentToFormData = (formData, content = {}) => {
  if (!formData) return formData
  ;["title", "subtitle", "description", "ctaText", "ctaLink"].forEach((key) => {
    const value = content?.[key]
    if (typeof value === "string" && value.trim()) {
      formData.append(key, value.trim())
    } else {
      formData.append(key, "")
    }
  })
  return formData
}
