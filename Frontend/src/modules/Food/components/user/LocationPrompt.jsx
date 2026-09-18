import { useEffect, useState, useRef } from "react"
import { MapPin, X, Settings } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { useLocation } from "@food/hooks/useLocation"
import { useGeoPermission } from "@core/location/useGeoPermission"

const PROMPT_DISMISS_KEY = "locationPromptDismissed" // 'prompt' state — remember across sessions
const DENIED_DISMISS_KEY = "locationDeniedDismissed" // 'denied' state — remember per session only

const hasUsableStoredLocation = () => {
  try {
    const stored = JSON.parse(localStorage.getItem("userLocation") || "null")
    return Boolean(
      stored &&
        Number.isFinite(Number(stored.latitude)) &&
        Number.isFinite(Number(stored.longitude)) &&
        stored.formattedAddress &&
        stored.formattedAddress !== "Select location"
    )
  } catch {
    return false
  }
}

/**
 * Location permission popup:
 * - permission === 'prompt': ask the user to allow; the Allow button calls
 *   getCurrentPosition from the click (required for the browser dialog).
 * - permission === 'denied': the browser will NOT re-prompt, so show
 *   how to re-enable it in site settings + a Retry button. The popup also
 *   closes automatically when the user flips the permission (live via
 *   the Permissions API change event) and the location gets fetched.
 */
export default function LocationPrompt() {
  const { location, loading, requestLocation } = useLocation()
  const { permission } = useGeoPermission()
  const [showPrompt, setShowPrompt] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
  const cardRef = useRef(null)

  // Decide visibility from permission state (reactive to browser changes).
  useEffect(() => {
    if (permission === "granted" || permission === "unsupported") {
      setShowPrompt(false)
      return undefined
    }

    if (permission === "denied") {
      // Location is OFF in the browser: show unless dismissed this session.
      if (!sessionStorage.getItem(DENIED_DISMISS_KEY)) {
        setShowPrompt(true)
      }
      return undefined
    }

    if (permission === "prompt" || permission === "unknown") {
      // Not asked yet: show only for users without a usable location,
      // after giving the automatic fetch a moment to succeed.
      if (localStorage.getItem(PROMPT_DISMISS_KEY)) return undefined
      const timer = setTimeout(() => {
        if (!hasUsableStoredLocation()) setShowPrompt(true)
      }, 2000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [permission])

  // Lock body scroll while visible.
  useEffect(() => {
    document.body.style.overflow = showPrompt ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [showPrompt])

  // Close automatically once a real location arrives (e.g. the user enabled
  // the permission from browser settings and the hook auto-fetched).
  useEffect(() => {
    if (!showPrompt) return
    const isReal =
      location &&
      Number.isFinite(Number(location.latitude)) &&
      Number.isFinite(Number(location.longitude)) &&
      location.formattedAddress &&
      location.formattedAddress !== "Select location"
    if (isReal) {
      setShowPrompt(false)
      setFetchFailed(false)
    }
  }, [location, showPrompt])

  const handleAllow = async () => {
    setFetchFailed(false)
    try {
      // Must run inside the click handler so the browser shows its dialog
      // when permission state is 'prompt'.
      const fetched = await requestLocation()
      const ok =
        fetched &&
        Number.isFinite(Number(fetched.latitude)) &&
        Number.isFinite(Number(fetched.longitude))
      if (ok) {
        setShowPrompt(false)
        localStorage.setItem(PROMPT_DISMISS_KEY, "true")
      } else {
        setFetchFailed(true)
      }
    } catch {
      // Denied or failed — keep the popup open; the permission state
      // effect will switch it to the "denied" instructions view.
      setFetchFailed(true)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    if (permission === "denied") {
      // Re-ask next session instead of never again.
      sessionStorage.setItem(DENIED_DISMISS_KEY, "true")
    } else {
      localStorage.setItem(PROMPT_DISMISS_KEY, "true")
    }
  }

  if (!showPrompt) return null

  const isDenied = permission === "denied"

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Card ref={cardRef} className="w-full max-w-md border-2 border-gray-200 shadow-2xl mx-auto my-auto">
        <CardHeader className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
              {isDenied ? (
                <Settings className="h-6 w-6 text-primary-orange" />
              ) : (
                <MapPin className="h-6 w-6 text-primary-orange" />
              )}
            </div>
            <div>
              <CardTitle>
                {isDenied ? "Location is turned off" : "Enable Location Services"}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {isDenied
                  ? "Allow location in your browser to continue"
                  : "Get faster delivery and better recommendations"}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDenied ? (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Location access is blocked for this site. To enable it:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Tap the lock icon next to the address bar</li>
                <li>Open <span className="font-medium">Site settings / Permissions</span></li>
                <li>Set <span className="font-medium">Location</span> to <span className="font-medium">Allow</span></li>
              </ol>
              <p>Then come back and tap Retry — we'll fetch your location automatically.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              We use your location to show nearby restaurants and provide accurate
              delivery times. Your location data is stored locally and never shared.
            </p>
          )}
          {fetchFailed && !isDenied && (
            <p className="text-sm text-red-500">
              We couldn't get your location. Please check your device's GPS and try again.
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={handleDismiss} variant="outline" className="flex-1">
              Not Now
            </Button>
            <Button
              onClick={handleAllow}
              className="flex-1 bg-primary-orange hover:opacity-90 text-white"
              disabled={loading}
            >
              {loading ? "Getting location..." : isDenied ? "Retry" : "Allow Location"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
