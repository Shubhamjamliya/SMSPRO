import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import { initRazorpayPayment } from "@food/utils/razorpay";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader } from "../components/ui";
import SiteLocationPicker from "../../shared/SiteLocationPicker";
import { pathForServiceType } from "../serviceTypes";

const BUDGET_FRIENDLY_PATH = pathForServiceType("budget-friendly");

const labelClass = "mb-1 block text-sm font-medium text-gray-700";
const inputClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const buttonClass =
  "inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors";
const primaryButton = `${buttonClass} bg-primary text-white hover:bg-primary-hover disabled:opacity-50`;

/**
 * The id of a booking that was saved but not paid for. Kept separate from the
 * package flow's own key (`RequirementBuilder.jsx`) so a customer with one of each
 * pending at once does not have either overwrite the other.
 */
const PENDING_KEY = "construction_pending_service_request";
const rememberPending = (id) => {
  try {
    if (id) sessionStorage.setItem(PENDING_KEY, id);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable — the booking still works, it just is not restored on refresh */
  }
};
const recallPending = () => {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
};

const rupees = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

/**
 * Book a Budget Friendly service — the same booking, payment and site-visit flow
 * `RequirementBuilder.jsx` uses for a Residential/Commercial package, sourced from
 * a `ConstructionBudgetService` instead of a `ConstructionPackage` (`serviceId`
 * rather than `packageId`). Kept as its own page rather than folded into
 * `RequirementBuilder` because there is no tier picker and no residential/
 * commercial split here — one card, one form.
 *
 * The booking runs: fill in the details -> pay the service's visiting fee (if it
 * has one) -> the request is sent to contractors near the site, exactly like a
 * package. The server owns every figure, so what is shown here is a preview.
 */
export default function BudgetServiceBooking() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const { location } = useAppLocation();

  const [allServices, setAllServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState(null);
  // Deliberately empty: an estimate built on a made-up area is worse than none.
  const [plotArea, setPlotArea] = useState("");
  const [floors, setFloors] = useState("");
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    phone: "",
    city: "",
    area: "",
    address: "",
    lat: null,
    lng: null,
    state: "",
    pincode: "",
    landmark: "",
    startDate: "Next 30 Days",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mapAvailable, setMapAvailable] = useState(null);
  const [pending, setPending] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    constructionApi
      .getBudgetServices()
      .then((rows) => {
        if (!cancelled) setAllServices(rows || []);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error?.response?.data?.message || "Could not load services");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Coming back to an unpaid booking after a refresh: pick up where they left off.
  useEffect(() => {
    const id = recallPending();
    if (!id) return;
    constructionApi
      .getPackageRequestPayment(id)
      .then(({ request }) => setPending(request))
      .catch(() => rememberPending(null));
  }, []);

  useEffect(() => {
    if (loading) return;
    setService(allServices.find((s) => s._id === serviceId) || null);
  }, [loading, allServices, serviceId]);

  useEffect(() => {
    if (location?.city) {
      setCustomerInfo((c) => (c.city ? c : { ...c, city: location.city }));
    }
  }, [location?.city]);

  const handlePick = (place) => {
    setCustomerInfo((c) => ({
      ...c,
      address: place.address || c.address,
      lat: place.lat,
      lng: place.lng,
      city: place.city || c.city,
      area: place.area || c.area,
      state: place.state || c.state,
      pincode: place.pincode || c.pincode,
    }));
  };

  const visitingFee = service?.visitingFee || 0;
  const hasRate = service?.price != null;

  const areaPerFloor = Number(plotArea) || 0;
  const floorCount = Number(floors) || 0;
  const hasArea = areaPerFloor > 0 && floorCount > 0;

  const totalBuiltupArea = useMemo(() => (hasArea ? areaPerFloor * floorCount : 0), [hasArea, areaPerFloor, floorCount]);
  const estimatedCost = useMemo(
    () => (hasRate ? totalBuiltupArea * service.price : 0),
    [hasRate, totalBuiltupArea, service],
  );

  const verifyPayment = async (requestId, response) => {
    setVerifying(true);
    try {
      const request = await constructionApi.verifyPackageRequestPayment(requestId, {
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      });
      setPending(null);
      rememberPending(null);
      setSent(request);
      window.scrollTo?.(0, 0);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          "We could not confirm your payment yet. If money was deducted it will be confirmed shortly."
      );
    } finally {
      setVerifying(false);
    }
  };

  const openCheckout = async (request, razorpay) => {
    setPending(request);
    rememberPending(request.id);
    await initRazorpayPayment({
      key: razorpay.key,
      amount: razorpay.amount,
      currency: razorpay.currency,
      order_id: razorpay.orderId,
      name: razorpay.name,
      description: razorpay.description,
      notes: razorpay.notes,
      prefill: { name: customerInfo.name.trim(), contact: customerInfo.phone.trim() },
      handler: (response) => verifyPayment(request.id, response),
      onError: (error) => toast.error(error?.description || "Payment failed. You can try again."),
      onClose: () => toast("Payment not completed. Your request is saved — you can pay whenever you are ready."),
    });
  };

  const handleSubmitRequirement = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const city = customerInfo.city.trim();
    if (!customerInfo.name.trim() || !customerInfo.phone.trim()) {
      toast.error("Please enter your name and contact phone number.");
      return;
    }
    if (areaPerFloor < 100) {
      toast.error("Enter the built-up area per floor (at least 100 sq.ft).");
      document.getElementById("plotArea")?.focus();
      return;
    }
    if (floorCount < 1) {
      toast.error("Choose the number of floors.");
      document.getElementById("floors")?.focus();
      return;
    }
    const hasPin = Number.isFinite(customerInfo.lat) && Number.isFinite(customerInfo.lng);
    if (mapAvailable !== false && !hasPin) {
      toast.error("Search the site address and pin the exact spot on the map.");
      document.getElementById("site-location")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (mapAvailable === false && !customerInfo.address.trim()) {
      toast.error("Please type the full site address.");
      return;
    }
    if (!city) {
      toast.error("Please enter the site city.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { request, razorpay } = await constructionApi.createPackageRequest({
        serviceId: service._id,
        contact: { name: customerInfo.name.trim(), phone: customerInfo.phone.trim() },
        city,
        area: customerInfo.area.trim(),
        address: customerInfo.address.trim(),
        landmark: customerInfo.landmark.trim(),
        state: customerInfo.state.trim(),
        pincode: customerInfo.pincode.trim(),
        location: Number.isFinite(customerInfo.lat) && Number.isFinite(customerInfo.lng)
          ? { lat: customerInfo.lat, lng: customerInfo.lng }
          : null,
        areaPerFloor,
        floors: floorCount,
        startWindow: customerInfo.startDate,
        notes: customerInfo.notes.trim(),
      });
      if (razorpay) {
        await openCheckout(request, razorpay);
      } else {
        setSent(request);
        window.scrollTo?.(0, 0);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Could not send your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayPending = async () => {
    setIsSubmitting(true);
    try {
      const { request, razorpay } = await constructionApi.getPackageRequestPayment(pending.id);
      await openCheckout(request, razorpay);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Could not open the payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Book a service" backTo={BUDGET_FRIENDLY_PATH} />
        <div className="mx-auto w-full max-w-xl px-4 py-5">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </ConstructionPageShell>
    );
  }

  // Complete: paid (or free) and out with contractors.
  if (sent) {
    const city = sent.site?.city || customerInfo.city.trim();
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Request sent" backTo={BUDGET_FRIENDLY_PATH} />
        <div className="mx-auto w-full max-w-xl px-4 py-5">
          <h1 className="text-lg font-semibold text-gray-900">Request {sent.reference} received</h1>
          {sent.visitingFee > 0 ? (
            <p className="mt-2 text-sm text-gray-600">Payment of {rupees(sent.visitingFee)} received. Thank you.</p>
          ) : null}
          <p className="mt-2 text-sm text-gray-600">
            {sent.noContractorsYet
              ? `We do not have a contractor listed in ${city} yet. Our team has been alerted and will contact you.`
              : sent.sentToContractors
                ? `Your request has been sent to contractors near ${city}. We will let you know when one accepts it.`
                : "Our team will contact you shortly."}
          </p>
          <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Service</span>
              <span>{sent.package?.name}</span>
            </div>
            <div className="mt-1 flex justify-between text-gray-600">
              <span>Total built-up area</span>
              <span>{Number(sent.site?.totalBuiltUpArea || 0).toLocaleString("en-IN")} sq.ft</span>
            </div>
            <div className="mt-3 flex justify-between border-t border-gray-200 pt-3 font-semibold text-gray-900">
              <span>Estimated cost</span>
              <span>{sent.estimatedCost != null ? rupees(sent.estimatedCost) : "Quoted after site visit"}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            This is an indication only. The final price is confirmed after the site visit.
          </p>
          {sent.id ? (
            <button
              type="button"
              onClick={() => navigate(`/construction/site-visits/${sent.id}`)}
              className={`${primaryButton} mt-5`}
            >
              Track my site visit
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate(BUDGET_FRIENDLY_PATH)}
            className="mt-3 w-full rounded-md border border-gray-300 py-2.5 text-sm font-semibold text-gray-700"
          >
            Back to Budget Friendly
          </button>
        </div>
      </ConstructionPageShell>
    );
  }

  // Saved but not paid: the booking exists, contractors have not been asked yet.
  if (pending) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Complete payment" backTo={BUDGET_FRIENDLY_PATH} />
        <div className="mx-auto w-full max-w-xl px-4 py-5">
          <h1 className="text-lg font-semibold text-gray-900">Pay the visiting fee</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your request {pending.reference} for {pending.package?.name} is saved. It will be sent to
            contractors near {pending.site?.city} as soon as the {rupees(pending.visitingFee)} visiting
            fee is paid.
          </p>
          <button
            type="button"
            onClick={handlePayPending}
            disabled={isSubmitting || verifying}
            className={`${primaryButton} mt-5 w-full sm:w-auto`}
          >
            {verifying ? "Confirming payment…" : `Pay ${rupees(pending.visitingFee)}`}
          </button>
          <p className="mt-3 text-xs text-gray-500">
            Paid already? It can take a moment to confirm. Your request is sent automatically once it does.
          </p>
        </div>
      </ConstructionPageShell>
    );
  }

  if (!service) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Book a service" backTo={BUDGET_FRIENDLY_PATH} />
        <div className="mx-auto w-full max-w-xl px-4 py-5">
          <h1 className="text-base font-semibold text-gray-900">This service is no longer available</h1>
          <p className="mt-1 text-sm text-gray-500">
            It may have been removed or replaced. You can pick from the current Budget Friendly services.
          </p>
          <button type="button" onClick={() => navigate(BUDGET_FRIENDLY_PATH)} className={`${primaryButton} mt-4`}>
            View Budget Friendly services
          </button>
        </div>
      </ConstructionPageShell>
    );
  }

  return (
    <ConstructionPageShell showBottomNav={false}>
      <ConstructionPageHeader title="Book a service" backTo={BUDGET_FRIENDLY_PATH} />

      <div className="mx-auto w-full max-w-xl px-4 py-5">
        <h1 className="text-lg font-semibold text-gray-900">{service.name}</h1>
        <p className="mt-1 text-sm text-gray-500">Enter your built-up area and floors to see an estimate.</p>

        <form onSubmit={handleSubmitRequirement} className="mt-5 space-y-5">
          <div>
            <span className={labelClass}>Service</span>
            <p className="text-sm text-gray-900">
              {service.name}
              {hasRate ? ` — ${rupees(service.price)} ${service.unit || "per sq.ft"}` : " — quoted after site visit"}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="plotArea" className={labelClass}>
                Built-up area per floor (sq.ft)
              </label>
              <input
                id="plotArea"
                type="number"
                min="100"
                max="100000"
                inputMode="numeric"
                placeholder="e.g. 1000"
                value={plotArea}
                onChange={(e) => setPlotArea(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label htmlFor="floors" className={labelClass}>
                Number of floors
              </label>
              <select
                id="floors"
                value={floors}
                onChange={(e) => setFloors(e.target.value === "" ? "" : Number(e.target.value))}
                className={inputClass}
                required
              >
                <option value="" disabled>Select number of floors</option>
                <option value={1}>Ground (G)</option>
                <option value={2}>Ground + 1</option>
                <option value={3}>Ground + 2</option>
                <option value={4}>Ground + 3</option>
              </select>
            </div>
          </div>

          {/* Estimate */}
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
            {hasRate ? (
              <div className="flex justify-between text-gray-600">
                <span>Rate</span>
                <span>{rupees(service.price)} / sq.ft</span>
              </div>
            ) : null}
            {hasArea ? (
              <>
                <div className="mt-1 flex justify-between text-gray-600">
                  <span>
                    {areaPerFloor.toLocaleString("en-IN")} sq.ft × {floorCount} floor{floorCount === 1 ? "" : "s"}
                  </span>
                  <span>{totalBuiltupArea.toLocaleString("en-IN")} sq.ft</span>
                </div>
                <div className="mt-3 flex justify-between border-t border-gray-200 pt-3 font-semibold text-gray-900">
                  <span>Estimated cost</span>
                  <span>{hasRate ? rupees(estimatedCost) : "Quoted after site visit"}</span>
                </div>
              </>
            ) : (
              <p className={hasRate ? "mt-2 border-t border-gray-200 pt-3 text-gray-500" : "text-gray-500"}>
                {hasRate
                  ? "Enter the built-up area per floor and choose the number of floors to see your estimate."
                  : "The final price is confirmed after the site visit."}
              </p>
            )}
          </div>

          {/* Visiting fee: what is charged now, separate from the estimate above. */}
          <div className="rounded-md border border-gray-200 p-4 text-sm">
            <div className="flex justify-between font-medium text-gray-900">
              <span>Site visiting fee</span>
              <span>{visitingFee > 0 ? rupees(visitingFee) : "Free"}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {visitingFee > 0
                ? "Paid now. Your request is sent to contractors near your site once the payment is confirmed."
                : "There is no charge for the site visit. Your request is sent to contractors near your site straight away."}
            </p>
          </div>

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
                Site location <span className="text-red-500">*</span>
              </span>
              <SiteLocationPicker
                value={{ address: customerInfo.address, lat: customerInfo.lat, lng: customerInfo.lng }}
                onPick={handlePick}
                onAvailability={setMapAvailable}
                disabled={isSubmitting || verifying}
              />
            </div>

            {mapAvailable === false ? (
              <div className="sm:col-span-2">
                <label htmlFor="address" className={labelClass}>
                  Full site address <span className="text-red-500">*</span>
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
                Plot / house number or landmark
              </label>
              <input
                id="landmark"
                type="text"
                placeholder="Optional, e.g. Plot 42, next to the water tank"
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
              <label htmlFor="area" className={labelClass}>
                Area / locality
              </label>
              <input
                id="area"
                type="text"
                placeholder="e.g. Vijay Nagar"
                value={customerInfo.area}
                onChange={(e) => setCustomerInfo((c) => ({ ...c, area: e.target.value }))}
                className={inputClass}
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
            <div>
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
            <div className="sm:col-span-2">
              <label htmlFor="startDate" className={labelClass}>
                When do you want to start?
              </label>
              <select
                id="startDate"
                value={customerInfo.startDate}
                onChange={(e) => setCustomerInfo((c) => ({ ...c, startDate: e.target.value }))}
                className={inputClass}
              >
                <option value="Immediately">Immediately</option>
                <option value="Next 30 Days">Within 30 days</option>
                <option value="Within 3 Months">Within 3 months</option>
              </select>
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

          <button type="submit" disabled={isSubmitting || verifying} className={`${primaryButton} w-full`}>
            {isSubmitting || verifying
              ? "Please wait…"
              : visitingFee > 0
                ? `Pay ${rupees(visitingFee)} & send request`
                : "Send request"}
          </button>
        </form>
      </div>
    </ConstructionPageShell>
  );
}
