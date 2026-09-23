import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Minus, Plus, X } from "lucide-react";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader } from "../components/ui";
import SiteLocationPicker from "../../shared/SiteLocationPicker";
import { fullMoney } from "../../shared/format";
import { loadMaterialCart, saveMaterialCart, clearMaterialCart } from "../materialCart";
import { pathForServiceType } from "../serviceTypes";

const MATERIALS_PATH = pathForServiceType("material-services");

const labelClass = "mb-1 block text-sm font-medium text-gray-700";
const inputClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const buttonClass =
  "inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors";
const primaryButton = `${buttonClass} bg-primary text-white hover:bg-primary-hover disabled:opacity-50`;

const rupees = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

/**
 * Review & send — a full page, the same shape as `RequirementBuilder` (choosing a
 * package) and `BudgetServiceBooking`, rather than a modal over the materials grid.
 *
 * The cart itself was built on `/construction/materials` and handed off through
 * `materialCart.js`. This page re-fetches the materials to get their CURRENT price
 * and stock (a card left open in a tab overnight should not send yesterday's
 * prices), lets the customer adjust quantities one more time, then collects the
 * delivery details and sends the request. Nothing is charged here — the office
 * quotes the transport and other charges afterwards.
 */
export default function MaterialsCheckout() {
  const navigate = useNavigate();
  const { location } = useAppLocation();

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // { [materialId]: quantity }
  const [cart, setCart] = useState({});
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    phone: "",
    city: "",
    address: "",
    lat: null,
    lng: null,
    state: "",
    pincode: "",
    landmark: "",
    notes: "",
  });
  const [mapAvailable, setMapAvailable] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    constructionApi
      .getMaterials()
      .then((rows) => {
        if (cancelled) return;
        setMaterials(rows || []);
        const byId = new Map((rows || []).map((m) => [m._id, m]));
        const lines = loadMaterialCart();
        const next = {};
        lines.forEach(({ materialId, quantity }) => {
          if (byId.has(materialId)) next[materialId] = quantity;
        });
        setCart(next);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(true);
          toast.error(error?.response?.data?.message || "Could not load materials");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (location?.city) {
      setCustomerInfo((c) => (c.city ? c : { ...c, city: location.city }));
    }
  }, [location?.city]);

  const byId = useMemo(() => new Map(materials.map((m) => [m._id, m])), [materials]);
  const cartLines = Object.entries(cart)
    .map(([id, qty]) => ({ material: byId.get(id), qty: Number(qty) }))
    .filter((line) => line.material && line.qty > 0);
  const estimatedTotal = cartLines.reduce((sum, { material, qty }) => sum + material.price * qty, 0);

  const stepFor = (material) => Math.max(1, Math.floor((material.minOrderQty || 1) / 10));
  const setQty = (materialId, raw) => setCart((c) => ({ ...c, [materialId]: raw }));
  const removeItem = (materialId) =>
    setCart((c) => {
      const { [materialId]: _removed, ...rest } = c;
      return rest;
    });
  const step = (material, direction) => {
    const current = Number(cart[material._id]) || 0;
    const next = current + direction * stepFor(material);
    if (next <= 0) removeItem(material._id);
    else setQty(material._id, next);
  };

  // Keep the stored cart in step with edits made here, so "back" then "review again" is not stale.
  useEffect(() => {
    if (!loading) saveMaterialCart(cart);
  }, [cart, loading]);

  const handlePick = (place) => {
    setCustomerInfo((c) => ({
      ...c,
      address: place.address || c.address,
      lat: place.lat,
      lng: place.lng,
      city: place.city || c.city,
      state: place.state || c.state,
      pincode: place.pincode || c.pincode,
    }));
  };

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (cartLines.length === 0) {
      toast.error("Your request is empty. Add materials first.");
      navigate(MATERIALS_PATH);
      return;
    }
    const problem = cartLines.find(
      ({ material, qty }) => qty < (material.minOrderQty || 0) || material.inStock === false,
    );
    if (problem) {
      toast.error(
        problem.material.inStock === false
          ? `"${problem.material.name}" is out of stock right now`
          : `"${problem.material.name}": minimum ${problem.material.minOrderQty}`,
      );
      return;
    }
    if (!customerInfo.name.trim() || !customerInfo.phone.trim()) {
      toast.error("Please enter your name and contact phone number.");
      return;
    }
    const city = customerInfo.city.trim();
    if (!city) {
      toast.error("Please enter the delivery city.");
      return;
    }
    const hasPin = Number.isFinite(customerInfo.lat) && Number.isFinite(customerInfo.lng);
    if (mapAvailable !== false && !hasPin) {
      toast.error("Search the delivery address and pin the exact spot on the map.");
      document.getElementById("site-location")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (mapAvailable === false && !customerInfo.address.trim()) {
      toast.error("Please type the full delivery address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const request = await constructionApi.createMaterialRequest({
        contact: { name: customerInfo.name.trim(), phone: customerInfo.phone.trim() },
        delivery: {
          city,
          address: customerInfo.address.trim(),
          landmark: customerInfo.landmark.trim(),
          state: customerInfo.state.trim(),
          pincode: customerInfo.pincode.trim(),
        },
        notes: customerInfo.notes.trim(),
        items: cartLines.map(({ material, qty }) => ({ materialId: material._id, quantity: qty })),
      });
      clearMaterialCart();
      setSent(request);
      window.scrollTo?.(0, 0);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Could not send your request. Please try again.");
      // The catalogue may have changed under them (item removed, out of stock) — refresh it.
      constructionApi.getMaterials().then((rows) => setMaterials(rows || [])).catch(() => {});
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Review & send" backTo={MATERIALS_PATH} />
        <div className="mx-auto w-full max-w-xl px-4 py-5">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </ConstructionPageShell>
    );
  }

  if (sent) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Request sent" backTo={MATERIALS_PATH} />
        <div className="mx-auto w-full max-w-xl px-4 py-5">
          <h1 className="text-lg font-semibold text-gray-900">Request {`#${String(sent._id).slice(-6).toUpperCase()}`} received</h1>
          <p className="mt-2 text-sm text-gray-600">
            Our team will review it and send you a quotation with the transport and any other charges.
          </p>
          <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Materials</span>
              <span>{sent.items?.length || 0}</span>
            </div>
            <div className="mt-3 flex justify-between border-t border-gray-200 pt-3 font-semibold text-gray-900">
              <span>Estimated total (list price)</span>
              <span>{rupees(sent.estimatedTotal)}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            This is an estimate at list price. The final price includes delivery and is confirmed in the quotation.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/construction/material-requests/${sent._id}`)}
            className={`${primaryButton} mt-5 w-full`}
          >
            Track this request
          </button>
          <button
            type="button"
            onClick={() => navigate(MATERIALS_PATH)}
            className="mt-3 w-full rounded-md border border-gray-300 py-2.5 text-sm font-semibold text-gray-700"
          >
            Back to materials
          </button>
        </div>
      </ConstructionPageShell>
    );
  }

  if (loadError || cartLines.length === 0) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Review & send" backTo={MATERIALS_PATH} />
        <div className="mx-auto w-full max-w-xl px-4 py-5">
          <h1 className="text-base font-semibold text-gray-900">
            {loadError ? "Could not load materials" : "Your request is empty"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {loadError
              ? "Please go back and try again."
              : "Add materials to your request from the Materials section first."}
          </p>
          <button type="button" onClick={() => navigate(MATERIALS_PATH)} className={`${primaryButton} mt-4`}>
            Browse materials
          </button>
        </div>
      </ConstructionPageShell>
    );
  }

  return (
    <ConstructionPageShell showBottomNav={false}>
      <ConstructionPageHeader title="Review & send" backTo={MATERIALS_PATH} />

      <div className="mx-auto w-full max-w-xl px-4 py-5">
        <h1 className="text-lg font-semibold text-gray-900">Your request</h1>
        <p className="mt-1 text-sm text-gray-500">
          Check the materials and quantities, then add your delivery details.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div className="divide-y divide-gray-200 rounded-md border border-gray-200">
            {cartLines.map(({ material, qty }) => (
              <div key={material._id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{material.name}</p>
                  <p className="text-xs text-gray-500">
                    {[material.brand, material.category].filter(Boolean).join(" · ")} · {rupees(material.price)} {material.unit}
                  </p>
                  {material.inStock === false ? (
                    <p className="mt-0.5 text-xs font-semibold text-red-600">Out of stock — remove to continue</p>
                  ) : qty < (material.minOrderQty || 0) ? (
                    <p className="mt-0.5 text-xs font-semibold text-red-600">Minimum {material.minOrderQty}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => step(material, -1)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={cart[material._id]}
                    onChange={(e) => setQty(material._id, e.target.value)}
                    className="h-8 w-16 rounded-md border border-gray-300 px-1 text-center text-sm"
                    aria-label={`Quantity of ${material.name}`}
                  />
                  <button
                    type="button"
                    onClick={() => step(material, 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(material._id)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remove ${material.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between bg-gray-50 p-3 text-sm">
              <span className="font-semibold text-gray-700">Estimated total (list price)</span>
              <span className="font-bold text-gray-900">{rupees(estimatedTotal)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            This is an estimate at list price. Transport and any other charges are added by our team in the quotation.
          </p>

          {/* Contact */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className={labelClass}>
                Full name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={customerInfo.name}
                onChange={(e) => setCustomerInfo((c) => ({ ...c, name: e.target.value }))}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>
                Mobile number <span className="text-red-500">*</span>
              </label>
              <input
                id="phone"
                type="tel"
                value={customerInfo.phone}
                onChange={(e) => setCustomerInfo((c) => ({ ...c, phone: e.target.value }))}
                className={inputClass}
                required
              />
            </div>
            <div id="site-location" className="sm:col-span-2">
              <span className={labelClass}>
                Delivery location <span className="text-red-500">*</span>
              </span>
              <SiteLocationPicker
                value={{ address: customerInfo.address, lat: customerInfo.lat, lng: customerInfo.lng }}
                onPick={handlePick}
                onAvailability={setMapAvailable}
                disabled={isSubmitting}
              />
            </div>

            {mapAvailable === false ? (
              <div className="sm:col-span-2">
                <label htmlFor="address" className={labelClass}>
                  Full delivery address <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="address"
                  rows={2}
                  placeholder="House / plot number, street, locality"
                  value={customerInfo.address}
                  onChange={(e) => setCustomerInfo((c) => ({ ...c, address: e.target.value }))}
                  className={inputClass}
                />
              </div>
            ) : null}

            <div className="sm:col-span-2">
              <label htmlFor="landmark" className={labelClass}>
                Landmark
              </label>
              <input
                id="landmark"
                type="text"
                placeholder="Optional, e.g. next to the water tank"
                value={customerInfo.landmark}
                onChange={(e) => setCustomerInfo((c) => ({ ...c, landmark: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="city" className={labelClass}>
                City <span className="text-red-500">*</span>
              </label>
              <input
                id="city"
                type="text"
                placeholder="e.g. Indore"
                value={customerInfo.city}
                onChange={(e) => setCustomerInfo((c) => ({ ...c, city: e.target.value }))}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label htmlFor="pincode" className={labelClass}>
                Pincode
              </label>
              <input
                id="pincode"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 digits"
                value={customerInfo.pincode}
                onChange={(e) => setCustomerInfo((c) => ({ ...c, pincode: e.target.value.replace(/\D/g, "") }))}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="state" className={labelClass}>
                State
              </label>
              <input
                id="state"
                type="text"
                value={customerInfo.state}
                onChange={(e) => setCustomerInfo((c) => ({ ...c, state: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="notes" className={labelClass}>
              Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              placeholder="Anything else we should know (optional)"
              value={customerInfo.notes}
              onChange={(e) => setCustomerInfo((c) => ({ ...c, notes: e.target.value }))}
              className={inputClass}
            />
          </div>

          <button type="submit" disabled={isSubmitting} className={`${primaryButton} w-full`}>
            {isSubmitting ? "Sending…" : "Send request"}
          </button>
        </form>
      </div>
    </ConstructionPageShell>
  );
}
