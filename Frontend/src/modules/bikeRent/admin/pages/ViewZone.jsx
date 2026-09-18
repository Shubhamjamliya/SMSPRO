import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  Edit,
  MapPin,
  Warehouse,
} from "lucide-react"
import { toast } from "sonner"
import bikeRentAdminApi from "../services/adminApi"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { loadGoogleMaps as loadGoogleMapsSingleton } from "@core/services/googleMapsLoader"
import { Loader } from "@googlemaps/js-api-loader"
import ZoneHubsPanel from "./ZoneHubsPanel"

const ZONES_BASE = "/admin/bike-rent/zones"

function toLatLng(coord) {
  if (!coord || typeof coord !== "object") return null
  const lat = Number(coord.latitude ?? coord.lat)
  const lng = Number(coord.longitude ?? coord.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function focusMapOnZone(google, map, coordinates = [], hubs = []) {
  if (!google?.maps || !map) return
  google.maps.event.trigger(map, "resize")

  const bounds = new google.maps.LatLngBounds()
  let hasPoint = false

  coordinates.map(toLatLng).filter(Boolean).forEach((p) => {
    bounds.extend(p)
    hasPoint = true
  })

  ;(hubs || []).forEach((hub) => {
    const lat = Number(hub.lat)
    const lng = Number(hub.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    bounds.extend({ lat, lng })
    hasPoint = true
  })

  if (!hasPoint) return

  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()
  const center = bounds.getCenter()
  const latSpan = Math.abs(ne.lat() - sw.lat())
  const lngSpan =
    Math.abs(ne.lng() - sw.lng()) * Math.cos((center.lat() * Math.PI) / 180)
  const span = Math.max(latSpan, lngSpan, 0.04)

  let zoom = 12
  if (span > 0.9) zoom = 9
  else if (span > 0.4) zoom = 10
  else if (span > 0.18) zoom = 11
  else if (span > 0.08) zoom = 12
  else zoom = 13

  map.setCenter(center)
  map.setZoom(zoom)
}

export default function ViewZone() {
  const navigate = useNavigate()
  const { id } = useParams()
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const polygonRef = useRef(null)
  const hubMarkersRef = useRef([])
  const infoWindowRef = useRef(null)
  const zoneRef = useRef(null)
  const hubsRef = useRef([])

  const [zone, setZone] = useState(null)
  const [hubs, setHubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [mapLoading, setMapLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)

  const zoneId = useMemo(() => zone?._id || zone?.id || null, [zone])
  const zoneCoordinates = useMemo(() => zone?.coordinates || [], [zone])
  const isActive = zone?.status === "active" || zone?.isActive === true

  useEffect(() => {
    zoneRef.current = zone
  }, [zone])

  useEffect(() => {
    hubsRef.current = hubs
  }, [hubs])

  const clearOverlays = useCallback(() => {
    if (polygonRef.current) {
      polygonRef.current.setMap(null)
      polygonRef.current = null
    }
    hubMarkersRef.current.forEach((m) => m.setMap(null))
    hubMarkersRef.current = []
  }, [])

  const drawZoneAndHubs = useCallback((google, map, coordinates, nextHubs) => {
    if (!google?.maps || !map) return

    clearOverlays()

    const path = (coordinates || []).map(toLatLng).filter(Boolean)
    if (path.length >= 3) {
      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: "#ea580c",
        strokeOpacity: 0.95,
        strokeWeight: 2.5,
        fillColor: "#fb923c",
        fillOpacity: 0.18,
        editable: false,
        draggable: false,
        clickable: false,
      })
      polygon.setMap(map)
      polygonRef.current = polygon
    }

    if (!infoWindowRef.current) {
      infoWindowRef.current = new google.maps.InfoWindow()
    }

    ;(nextHubs || []).forEach((hub, index) => {
      const lat = Number(hub.lat)
      const lng = Number(hub.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

      const marker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: hub.name || `Hub ${index + 1}`,
        label: {
          text: String(index + 1),
          color: "#fff",
          fontSize: "11px",
          fontWeight: "700",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        zIndex: 20,
      })

      marker.addListener("click", () => {
        infoWindowRef.current.setContent(`
          <div style="padding:8px 10px;max-width:240px;font-family:system-ui,sans-serif">
            <div style="font-weight:700;color:#0f172a;margin-bottom:4px">${hub.name || "Hub"}</div>
            <div style="font-size:12px;color:#475569;line-height:1.4">${hub.address || "No address"}</div>
            ${hub.landmark ? `<div style="font-size:11px;color:#64748b;margin-top:4px">Landmark: ${hub.landmark}</div>` : ""}
            <div style="font-size:11px;color:#334155;margin-top:6px">
              Status: <strong>${hub.status || "—"}</strong>
            </div>
          </div>
        `)
        infoWindowRef.current.open({ map, anchor: marker })
      })

      hubMarkersRef.current.push(marker)
    })

    focusMapOnZone(google, map, coordinates || [], nextHubs || [])
  }, [clearOverlays])

  const initializeMap = useCallback(async (google) => {
    if (!mapRef.current) {
      setTimeout(() => initializeMap(google), 200)
      return
    }

    const container = mapRef.current
    if (container.offsetWidth < 40 || container.offsetHeight < 40) {
      setTimeout(() => initializeMap(google), 200)
      return
    }

    if (mapInstanceRef.current) {
      setMapLoading(false)
      setMapReady(true)
      drawZoneAndHubs(
        google,
        mapInstanceRef.current,
        zoneRef.current?.coordinates || [],
        hubsRef.current,
      )
      return
    }

    const coords = zoneRef.current?.coordinates || []
    const first = coords.map(toLatLng).filter(Boolean)[0]
    const center = first || { lat: 20.5937, lng: 78.9629 }

    const map = new google.maps.Map(container, {
      center,
      zoom: first ? 12 : 5,
      maxZoom: 18,
      minZoom: 5,
      mapTypeControl: true,
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: "greedy",
      clickableIcons: false,
    })

    mapInstanceRef.current = map

    google.maps.event.addListenerOnce(map, "idle", () => {
      setMapLoading(false)
      setMapReady(true)
      drawZoneAndHubs(google, map, zoneRef.current?.coordinates || [], hubsRef.current)
    })

    setTimeout(() => setMapLoading(false), 2500)
  }, [drawZoneAndHubs])

  const loadMap = useCallback(async () => {
    try {
      const apiKey = await getGoogleMapsApiKey()
      if (apiKey) {
        try {
          await loadGoogleMapsSingleton(apiKey)
          if (window.google?.maps) {
            await initializeMap(window.google)
            return
          }
        } catch {
          /* fallback below */
        }
      }

      let retries = 0
      while (!window.google && retries < 40) {
        await new Promise((r) => setTimeout(r, 100))
        retries += 1
      }

      if (window.google?.maps) {
        await initializeMap(window.google)
        return
      }

      if (apiKey) {
        const loader = new Loader({
          apiKey,
          version: "weekly",
          libraries: ["geometry"],
        })
        const google = await loader.load()
        await initializeMap(google)
        return
      }

      setMapLoading(false)
    } catch {
      setMapLoading(false)
      toast.error("Failed to load Google Maps")
    }
  }, [initializeMap])

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      try {
        setLoading(true)
        const zoneData = await bikeRentAdminApi.getZoneById(id)
        if (cancelled) return
        if (!zoneData) {
          toast.error("Zone not found")
          navigate(ZONES_BASE)
          return
        }
        setZone(zoneData)
      } catch {
        if (!cancelled) {
          toast.error("Failed to load zone")
          navigate(ZONES_BASE)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  useEffect(() => {
    if (!zone) return undefined
    loadMap()
    return undefined
  }, [zone, loadMap])

  // Redraw when zone polygon or hubs change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google?.maps) return
    drawZoneAndHubs(
      window.google,
      mapInstanceRef.current,
      zoneCoordinates,
      hubs,
    )
  }, [mapReady, zoneCoordinates, hubs, drawZoneAndHubs])

  useEffect(() => {
    return () => {
      clearOverlays()
      if (infoWindowRef.current) {
        infoWindowRef.current.close()
        infoWindowRef.current = null
      }
      mapInstanceRef.current = null
    }
  }, [clearOverlays])

  const handleHubsChange = useCallback((nextHubs) => {
    setHubs(Array.isArray(nextHubs) ? nextHubs : [])
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-[#FF6A00]" />
          <p className="text-slate-600">Loading zone…</p>
        </div>
      </div>
    )
  }

  if (!zone) return null

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => navigate(ZONES_BASE)}
                className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00] text-white">
                  <MapPin className="h-5 w-5" />
                </span>
                <div>
                  <h1 className="text-xl font-black text-slate-900 sm:text-2xl">
                    {zone.name || "Bike Rent Zone"}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Zone map, pickup hubs, and hub management
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(`${ZONES_BASE}/edit/${zoneId}`)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <Edit className="h-4 w-4" />
              Edit zone
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Country</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{zone.country || "—"}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Unit</p>
              <p className="mt-1 text-sm font-semibold capitalize text-slate-900">{zone.unit || "kilometer"}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Status</p>
              <span
                className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                  isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                }`}
              >
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Hubs</p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Warehouse className="h-3.5 w-3.5 text-slate-400" />
                {hubs.length}
              </p>
            </div>
          </div>
        </div>

        {/* Full-width zone map with all hubs */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">Zone map</h2>
              <p className="text-xs text-slate-500">
                Orange area = zone boundary. Blue markers = pickup hubs in this zone.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-orange-400" /> Zone
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Hubs ({hubs.length})
              </span>
            </div>
          </div>

          <div className="relative bg-slate-100">
            <div
              ref={mapRef}
              className="h-[min(62vh,560px)] min-h-[360px] w-full"
            />
            {mapLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90">
                <div className="text-center">
                  <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-[#FF6A00]" />
                  <p className="text-sm text-slate-600">Loading map…</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Hubs management */}
        {zoneId ? (
          <ZoneHubsPanel
            zoneId={zoneId}
            zoneCoordinates={zoneCoordinates}
            onHubsChange={handleHubsChange}
          />
        ) : null}
      </div>
    </div>
  )
}
