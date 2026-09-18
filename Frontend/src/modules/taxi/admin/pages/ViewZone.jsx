import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { MapPin, Pencil } from "lucide-react"
import { taxiAdminApi } from "../../services/api"
import { toast } from "sonner"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { Loader } from "@googlemaps/js-api-loader"
import FormPageShell from "@/shared/components/admin/FormPageShell"
import Button from "@/shared/components/ui/Button"
import { StatusBadge } from "@/shared/components/admin"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

export default function ViewZone() {
  const navigate = useNavigate()
  const { id } = useParams()
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const polygonRef = useRef(null)

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("")
  const [mapLoading, setMapLoading] = useState(true)
  const [zone, setZone] = useState(null)
  const [loading, setLoading] = useState(true)

  const zoneId = useMemo(() => zone?.id || zone?._id || null, [zone?.id, zone?._id])
  const coordinatesLength = useMemo(() => zone?.coordinates?.length || 0, [zone?.coordinates?.length])

  useEffect(() => {
    fetchZone()
    loadGoogleMaps()
  }, [id])

  useEffect(() => {
    if (mapInstanceRef.current && !mapLoading && window.google?.maps) {
      const timer = setTimeout(() => {
        window.google.maps.event.trigger(mapInstanceRef.current, "resize")
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [mapLoading])

  useEffect(() => {
    return () => {
      if (polygonRef.current) polygonRef.current.setMap(null)
      if (mapRef.current?.__taxiZoneResizeObserver) {
        mapRef.current.__taxiZoneResizeObserver.disconnect()
        delete mapRef.current.__taxiZoneResizeObserver
      }
    }
  }, [])

  const fetchZone = async () => {
    try {
      setLoading(true)
      const zoneData = await taxiAdminApi.getZoneById(id)
      if (zoneData) setZone(zoneData)
    } catch (error) {
      debugError("Error fetching zone:", error)
      toast.error("Failed to load zone")
      navigate("/admin/taxi/zones")
    } finally {
      setLoading(false)
    }
  }

  const loadGoogleMaps = async () => {
    try {
      const apiKey = await getGoogleMapsApiKey()
      setGoogleMapsApiKey(apiKey || "loaded")

      let retries = 0
      while (!window.google && retries < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        retries += 1
      }

      if (window.google?.maps) {
        setTimeout(() => initializeMap(window.google), 100)
        return
      }

      if (apiKey) {
        const loader = new Loader({
          apiKey,
          version: "weekly",
          libraries: ["geometry"],
        })
        const google = await loader.load()
        setTimeout(() => initializeMap(google), 100)
      } else {
        setMapLoading(false)
      }
    } catch (error) {
      debugError("Error loading Google Maps:", error)
      setMapLoading(false)
    }
  }

  const initializeMap = (google) => {
    if (!mapRef.current) return

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 20.5937, lng: 78.9629 },
      zoom: 5,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
        position: google.maps.ControlPosition.TOP_RIGHT,
      },
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: "greedy",
    })

    mapInstanceRef.current = map

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          google.maps.event.trigger(map, "resize")
        })
      : null
    if (resizeObserver && mapRef.current) {
      resizeObserver.observe(mapRef.current)
      mapRef.current.__taxiZoneResizeObserver = resizeObserver
    }

    setMapLoading(false)

    if (zone?.coordinates?.length >= 3) {
      setTimeout(() => drawZonePolygon(google, map, zone.coordinates), 200)
    }
  }

  const drawZonePolygon = (google, map, coordinates) => {
    if (!coordinates || coordinates.length < 3) return

    try {
      if (polygonRef.current) polygonRef.current.setMap(null)

      const path = coordinates
        .map((coord) => {
          const lat = typeof coord === "object" ? (coord.latitude ?? coord.lat) : null
          const lng = typeof coord === "object" ? (coord.longitude ?? coord.lng) : null
          if (lat == null || lng == null) return null
          return new google.maps.LatLng(Number(lat), Number(lng))
        })
        .filter(Boolean)

      if (path.length < 3) return

      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: "#d97706",
        strokeOpacity: 0.95,
        strokeWeight: 2.5,
        fillColor: "#f59e0b",
        fillOpacity: 0.22,
        editable: false,
        draggable: false,
      })
      polygon.setMap(map)
      polygonRef.current = polygon

      const bounds = new google.maps.LatLngBounds()
      path.forEach((p) => bounds.extend(p))
      map.fitBounds(bounds)
      google.maps.event.trigger(map, "resize")
    } catch (error) {
      debugError("Error drawing zone polygon:", error)
    }
  }

  useEffect(() => {
    if (zone && zone.coordinates?.length >= 3 && mapInstanceRef.current && window.google && !mapLoading) {
      setTimeout(() => {
        if (mapInstanceRef.current) {
          drawZonePolygon(window.google, mapInstanceRef.current, zone.coordinates)
        }
      }, 400)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, coordinatesLength, mapLoading])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-amber-500" />
          <p className="text-sm text-slate-600">Loading zone…</p>
        </div>
      </div>
    )
  }

  if (!zone) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-600">Zone not found</p>
          <Button className="mt-4" onClick={() => navigate("/admin/taxi/zones")}>
            Back to zones
          </Button>
        </div>
      </div>
    )
  }

  return (
    <FormPageShell
      title={zone.name || "Taxi zone"}
      description="Read-only view of this service area"
      icon={<MapPin className="h-5 w-5" />}
      iconClassName="bg-amber-500"
      onBack={() => navigate("/admin/taxi/zones")}
      className="just-order-theme-scope"
      actions={
        <Button onClick={() => navigate(`/admin/taxi/zones/edit/${zone.id || id}`)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit zone
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:items-start">
        <div className="space-y-4 xl:col-span-4 xl:sticky xl:top-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Zone details</h2>
            <dl className="mt-4 space-y-4">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Name</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{zone.name || "—"}</dd>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Country</dt>
                  <dd className="mt-1 text-sm text-slate-900">{zone.country || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Unit</dt>
                  <dd className="mt-1 text-sm capitalize text-slate-900">{zone.unit || "kilometer"}</dd>
                </div>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</dt>
                <dd className="mt-1.5">
                  <StatusBadge
                    status={zone.status === "active" ? "success" : "default"}
                    label={zone.status || "inactive"}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Polygon</dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {zone.coordinates?.length
                    ? `${zone.coordinates.length} points`
                    : zone.polygon || "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="xl:col-span-8">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Service area map</h2>
              <p className="text-xs text-slate-500">Polygon boundary for this taxi zone</p>
            </div>
            <div className="p-3 sm:p-4">
              <div className="relative h-[min(68vh,640px)] min-h-[280px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:min-h-[360px]">
                <div ref={mapRef} className="absolute inset-0 h-full w-full" />

                {mapLoading ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90">
                    <div className="text-center">
                      <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-amber-500" />
                      <p className="text-sm text-slate-600">Loading map…</p>
                    </div>
                  </div>
                ) : null}

                {!googleMapsApiKey && !mapLoading ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100">
                    <div className="px-6 text-center">
                      <MapPin className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                      <p className="text-sm font-medium text-slate-700">Google Maps is unavailable</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </FormPageShell>
  )
}
