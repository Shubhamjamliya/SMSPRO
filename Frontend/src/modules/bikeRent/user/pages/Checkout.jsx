import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bike,
  CalendarDays,
  Clock3,
  HardHat,
  MapPin,
  ShieldCheck,
  TicketPercent,
} from "lucide-react";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import { userAPI } from "@/services/api";
import bikeRentUserApi from "../services/userApi";
import PickupLocationCard, { getPickupHub } from "../components/PickupLocationCard";
import BikeRentPoliciesSheet from "../components/BikeRentPoliciesSheet";
import ConflictBanner from "../components/ConflictBanner";
import CheckoutRequiredDocuments, {
  areCheckoutDocumentsComplete,
  resolveRequiredDocTypes,
} from "../components/CheckoutRequiredDocuments";
import {
  BikeRentPageHeader,
  BikeRentPageShell,
  EmptyState,
  PrimaryButton,
} from "../components/ui";
import useBikeRentAuthUser from "../hooks/useBikeRentAuthUser";
import { useBikeRentZone } from "../hooks/useBikeRentZone";
import { useWindowAvailabilityCheck } from "../hooks/useBikeAvailability";
import { formatInr } from "../utils/format";
import { bikePrimaryImage } from "../utils/bikeDisplay";
import {
  getBikeRentBookingPath,
  getBikeRentBrowsePath,
  getBikeRentPayPath,
} from "../utils/routes";
import { useMyPendingBookings } from "../hooks/useMyPendingBookings";
import {
  bookingIdOf,
  isAwaitingApprovalStatus,
  isPaymentPendingStatus,
} from "../utils/bookingDisplay";
import { cn } from "@/lib/utils";

const normalizeLicense = (value) =>
  String(value || "")
    .replace(/[\s-]/g, "")
    .trim()
    .toUpperCase();

const isValidLicense = (value) => {
  const license = normalizeLicense(value);
  return license.length >= 8 && license.length <= 20 && /^[A-Z0-9]+$/.test(license);
};

const DURATION_PRESETS = [
  { id: "1h", label: "1 hr", sub: "Quick", hours: 1 },
  { id: "4h", label: "4 hrs", sub: "Half day", hours: 4 },
  { id: "8h", label: "8 hrs", sub: "Full day", hours: 8 },
  { id: "1d", label: "1 day", sub: "24 hrs", hours: 24 },
  { id: "2d", label: "2 days", sub: "48 hrs", hours: 48 },
];

const pad = (n) => String(n).padStart(2, "0");

const toParts = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    return {
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    };
  }
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
};

const combineLocal = (dateStr, timeStr) => {
  const [y, m, d] = String(dateStr || "").split("-").map(Number);
  const [hh, mm] = String(timeStr || "00:00").split(":").map(Number);
  if (!y || !m || !d) return null;
  const next = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  return Number.isNaN(next.getTime()) ? null : next;
};

const toLocalInput = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const roundUpHour = (date) => {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  if (date.getMinutes() > 0 || date.getSeconds() > 0) {
    next.setHours(next.getHours() + 1);
  }
  return next;
};

const formatDisplayDate = (value) => {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const durationLabel = (start, end) => {
  if (!(start instanceof Date) || !(end instanceof Date)) return "Select a valid period";
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return "Select a valid period";
  }
  const hours = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 3600000));
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  if (!rem) return `${days} day${days === 1 ? "" : "s"}`;
  return `${days}d ${rem}h`;
};

const matchPresetHours = (start, end) => {
  if (!start || !end || end <= start) return null;
  const hours = Math.round((end.getTime() - start.getTime()) / 3600000);
  return DURATION_PRESETS.find((p) => p.hours === hours)?.id || "custom";
};

function FieldLabel({ children, required }) {
  return (
    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
      {children}
      {required ? <span className="ml-0.5 text-red-500">*</span> : null}
    </span>
  );
}

function FormInput({ className, error, ...props }) {
  const isTemporal = props.type === "date" || props.type === "time" || props.type === "datetime-local";
  return (
    <input
      className={cn(
        "box-border w-full max-w-full min-w-0 rounded-lg border bg-white px-2.5 py-2 text-[15px] text-gray-900 outline-none transition sm:text-sm",
        "placeholder:text-gray-400 focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15",
        "appearance-none [-webkit-appearance:none]",
        isTemporal && "px-2 leading-normal",
        error ? "border-red-300 focus:border-red-500 focus:ring-red-500/15" : "border-gray-200",
        className,
      )}
      {...props}
    />
  );
}

function SummaryRow({ label, value, muted, strong }) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-2 text-xs min-w-0 sm:text-sm",
        strong && "border-t border-gray-100 pt-2.5",
      )}
    >
      <span
        className={cn(
          "min-w-0 break-words",
          muted ? "text-gray-500" : "text-gray-700",
          strong && "font-bold text-gray-900",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "max-w-[50%] shrink-0 break-words text-right font-semibold text-gray-900",
          strong && "text-sm font-extrabold text-[#FF6A00] sm:text-base",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.9fr)]">
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-2xl bg-gray-200" />
        <div className="h-20 animate-pulse rounded-2xl bg-gray-200" />
        <div className="h-48 animate-pulse rounded-2xl bg-gray-200" />
        <div className="h-36 animate-pulse rounded-2xl bg-gray-200" />
      </div>
      <div className="hidden h-72 animate-pulse rounded-2xl bg-gray-200 lg:block" />
    </div>
  );
}

export default function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const bikeId = params.get("bikeId");
  const { location } = useAppLocation();
  const { zone } = useBikeRentZone(location);
  const auth = useBikeRentAuthUser();
  const { getPendingForBike } = useMyPendingBookings();

  const initialStart = useMemo(() => roundUpHour(new Date(Date.now() + 3600000)), []);
  const [startAt, setStartAt] = useState(() => toLocalInput(initialStart));
  const [endAt, setEndAt] = useState(() =>
    toLocalInput(new Date(initialStart.getTime() + 4 * 3600000)),
  );
  const [durationId, setDurationId] = useState("4h");
  const [editSchedule, setEditSchedule] = useState(false);
  const [bike, setBike] = useState(null);
  const [bikeLoading, setBikeLoading] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [couponAppliedMeta, setCouponAppliedMeta] = useState(null);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [moduleSettings, setModuleSettings] = useState(null);
  const requiredDocTypes = useMemo(
    () =>
      resolveRequiredDocTypes(
        moduleSettings?.documentTypes || [],
        Array.isArray(bike?.requiredDocuments) ? bike.requiredDocuments : [],
      ),
    [bike?.requiredDocuments, moduleSettings],
  );
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [identityDocs, setIdentityDocs] = useState({
    drivingLicenseFront: "",
    drivingLicenseBack: "",
    aadhaarFront: "",
    aadhaarBack: "",
  });
  const handleDocumentsChange = useCallback((next) => {
    setIdentityDocs(next);
    setErrors((prev) => {
      if (!prev.documents) return prev;
      const copy = { ...prev };
      delete copy.documents;
      return copy;
    });
  }, []);
  const [errors, setErrors] = useState({});
  const quoteTimer = useRef(null);
  const [durationLimits, setDurationLimits] = useState({
    minBookingDurationHours: 1,
    maxBookingDurationHours: 12,
  });

  const minHours = Math.max(1, Number(durationLimits.minBookingDurationHours) || 1);
  const maxHours = Math.max(minHours, Number(durationLimits.maxBookingDurationHours) || 12);

  const availablePresets = useMemo(
    () => DURATION_PRESETS.filter((preset) => preset.hours >= minHours && preset.hours <= maxHours),
    [minHours, maxHours],
  );

  const startDate = useMemo(() => new Date(startAt), [startAt]);
  const endDate = useMemo(() => new Date(endAt), [endAt]);
  const startParts = useMemo(() => toParts(startAt), [startAt]);
  const endParts = useMemo(() => toParts(endAt), [endAt]);

  const durationHoursExact = useMemo(() => {
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
      return null;
    }
    return (endDate.getTime() - startDate.getTime()) / 3600000;
  }, [startDate, endDate]);

  const durationError = useMemo(() => {
    if (!Number.isFinite(startDate.getTime())) {
      return "Select a valid pickup date and time";
    }
    if (!Number.isFinite(endDate.getTime())) {
      return "Select a valid return date and time";
    }

    const now = new Date();
    if (startDate.getTime() < now.getTime() - 15_000) {
      const todayParts = toParts(now);
      if (startParts.date < todayParts.date) {
        return "Pickup date can't be in the past. Choose today or a future date.";
      }
      if (startParts.date === todayParts.date) {
        return "Pickup time can't be in the past. Choose a later time for today.";
      }
      return "Pickup must be in the future.";
    }

    if (durationHoursExact == null || endDate <= startDate) {
      return "Return time must be after pickup";
    }
    if (durationHoursExact + 1e-9 < minHours) {
      return `Minimum booking duration is ${minHours} hour${minHours === 1 ? "" : "s"}. Please select a longer duration.`;
    }
    if (durationHoursExact > maxHours + 1e-9) {
      return `Maximum booking duration is ${maxHours} hour${maxHours === 1 ? "" : "s"}. Please select a shorter duration.`;
    }
    return "";
  }, [durationHoursExact, endDate, minHours, maxHours, startDate, startParts.date]);

  const periodValid = !durationError;
  const { check: availabilityCheck, loading: availabilityLoading } = useWindowAvailabilityCheck({
    bikeId,
    startAt: periodValid ? startDate.toISOString() : null,
    endAt: periodValid ? endDate.toISOString() : null,
    enabled: Boolean(bikeId && periodValid && bike && !bikeLoading),
  });
  const slotAvailable = availabilityCheck == null || availabilityCheck.available !== false;
  const minPickupDate = useMemo(() => toParts(new Date()).date, []);
  const minPickupTime = useMemo(() => {
    if (startParts.date !== minPickupDate) return undefined;
    return toParts(new Date()).time;
  }, [minPickupDate, startParts.date]);
  const minReturnDate = startParts.date || minPickupDate;

  useEffect(() => {
    if (auth.drivingLicenseNumber) {
      setLicenseNumber((prev) => prev || auth.drivingLicenseNumber);
    }
  }, [auth.drivingLicenseNumber]);

  useEffect(() => {
    let cancelled = false;
    bikeRentUserApi
      .getPublicSettings(bikeId)
      .then((settings) => {
        if (cancelled || !settings) return;
        setModuleSettings(settings);
        const nextMin = Math.max(1, Number(settings.minBookingDurationHours) || 1);
        const nextMax = Math.max(nextMin, Number(settings.maxBookingDurationHours) || 12);
        setDurationLimits({
          minBookingDurationHours: nextMin,
          maxBookingDurationHours: nextMax,
        });

        const currentHours = Math.round(
          (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3600000,
        );
        if (currentHours < nextMin || currentHours > nextMax) {
          const defaultHours = Math.min(nextMax, Math.max(nextMin, Math.min(4, nextMax)));
          const start = new Date(startAt);
          if (Number.isFinite(start.getTime())) {
            setEndAt(toLocalInput(new Date(start.getTime() + defaultHours * 3600000)));
            const matched = DURATION_PRESETS.find((p) => p.hours === defaultHours);
            setDurationId(matched?.id || "custom");
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Re-fetch effective policy (bike > vendor > admin) whenever the target bike changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bikeId]);

  useEffect(() => {
    if (!bikeId) {
      setBikeLoading(false);
      return;
    }
    let cancelled = false;
    setBikeLoading(true);
    bikeRentUserApi
      .getBikeById(bikeId)
      .then((data) => {
        if (!cancelled) setBike(data);
      })
      .catch(() => {
        if (!cancelled) {
          setBike(null);
          toast.error("Bike could not be loaded");
        }
      })
      .finally(() => {
        if (!cancelled) setBikeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bikeId]);

  useEffect(() => {
    if (!bikeId) return;
    const pending = getPendingForBike(bikeId);
    const pendingId = bookingIdOf(pending);
    if (!pendingId) return;
    if (isPaymentPendingStatus(pending.status)) {
      toast.message("You already have a booking awaiting payment for this bike");
      navigate(getBikeRentPayPath(pendingId), { replace: true });
      return;
    }
    toast.message(
      isAwaitingApprovalStatus(pending.status)
        ? "You already have a booking request awaiting approval for this bike"
        : "You already have a pending booking for this bike",
    );
    navigate(getBikeRentBookingPath(pendingId), { replace: true });
  }, [bikeId, getPendingForBike, navigate]);

  const pickupLabel = useMemo(() => {
    if (zone?.name) return zone.name;
    if (bike?.zoneName || bike?.zone?.name) return bike.zoneName || bike.zone.name;
    return (
      location?.area
      || location?.city
      || location?.formattedAddress
      || location?.address
      || "Current location"
    );
  }, [zone, location, bike]);

  const pickupHub = useMemo(
    () => getPickupHub(bike) || getPickupHub(zone) || null,
    [bike, zone],
  );

  const estimatedDuration = durationLabel(startDate, endDate);

  const applyEndFromHours = (hours, fromStart = startDate) => {
    if (!Number.isFinite(fromStart.getTime()) || !hours) return;
    const nextEnd = new Date(fromStart.getTime() + hours * 3600000);
    setEndAt(toLocalInput(nextEnd));
    setQuote(null);
    setAppliedCoupon("");
    setErrors((prev) => ({ ...prev, period: undefined }));
  };

  const updateStartParts = (nextDate, nextTime) => {
    const combined = combineLocal(nextDate, nextTime);
    if (!combined) return;
    const nextStart = toLocalInput(combined);
    setStartAt(nextStart);
    setQuote(null);
    setAppliedCoupon("");
    setErrors((prev) => ({ ...prev, period: undefined }));

    const preset = DURATION_PRESETS.find((p) => p.id === durationId);
    if (preset?.hours) {
      applyEndFromHours(preset.hours, combined);
    } else {
      const currentEnd = new Date(endAt);
      if (!Number.isNaN(currentEnd.getTime()) && currentEnd <= combined) {
        applyEndFromHours(Math.min(maxHours, Math.max(minHours, 4)), combined);
        setDurationId("custom");
      }
    }
  };

  const updateEndParts = (nextDate, nextTime) => {
    const combined = combineLocal(nextDate, nextTime);
    if (!combined) return;
    setEndAt(toLocalInput(combined));
    setDurationId(matchPresetHours(startDate, combined) || "custom");
    setQuote(null);
    setAppliedCoupon("");
    setErrors((prev) => ({ ...prev, period: undefined }));
  };

  const selectDuration = (preset) => {
    setDurationId(preset.id);
    setEditSchedule(false);
    if (preset.hours) applyEndFromHours(preset.hours);
  };

  const showScheduleEditors =
    editSchedule || durationId === "custom" || Boolean(durationError || errors.period);

  const validate = () => {
    const next = {};
    if (!periodValid) next.period = durationError || "Return time must be after pickup";
    if (!isValidLicense(licenseNumber)) {
      next.licenseNumber = "Enter a valid driving license (8–20 letters/numbers)";
    }
    if (!areCheckoutDocumentsComplete(identityDocs, requiredDocTypes)) {
      next.documents = `Upload ${requiredDocTypes.map((d) => d.label).join(", ")} to continue`;
    }
    if (!policiesAccepted) {
      next.policies = "Please read and agree to the Bike Rental Policies to continue";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const fetchQuote = async ({ silent = false, coupon } = {}) => {
    if (!bikeId || !periodValid) {
      if (!silent) toast.error("Choose a valid rental period");
      return null;
    }
    const code = String(coupon ?? couponCode).trim();
    setQuoting(true);
    try {
      const result = await bikeRentUserApi.quote({
        bikeId,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        couponCode: code || undefined,
      });
      const nextQuote = result.quote || result;
      setQuote(nextQuote);
      setCouponAppliedMeta(result.couponApplied || null);
      if (code && result.couponApplied) {
        setAppliedCoupon(result.couponApplied.couponCode || code);
        if (!silent) toast.success("Coupon applied");
      } else {
        setAppliedCoupon("");
        if (code && !silent) toast.error("Coupon could not be applied");
        else if (!silent) toast.success("Quote updated");
      }
      return nextQuote;
    } catch (error) {
      const message = error?.response?.data?.message || "Could not calculate quote";
      const details = error?.response?.data?.details;
      if (details && !code) {
        // Conflict details are shown via ConflictBanner / availability check
      }
      if (code) {
        setAppliedCoupon("");
        setCouponAppliedMeta(null);
        if (!silent) toast.error(message);
        try {
          const fallback = await bikeRentUserApi.quote({
            bikeId,
            startAt: startDate.toISOString(),
            endAt: endDate.toISOString(),
          });
          setQuote(fallback.quote || fallback);
        } catch {
          setQuote(null);
        }
      } else {
        setQuote(null);
        if (!silent) toast.error(message);
      }
      return null;
    } finally {
      setQuoting(false);
    }
  };

  useEffect(() => {
    if (!bikeId || !periodValid || bikeLoading || !bike) return undefined;
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(() => {
      fetchQuote({ silent: true });
    }, 450);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-quote on period change only
  }, [bikeId, startAt, endAt, periodValid, bikeLoading, bike]);

  const applyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Enter a coupon code");
      return;
    }
    await fetchQuote({ coupon: couponCode });
  };

  const clearCoupon = () => {
    setCouponCode("");
    setAppliedCoupon("");
    setCouponAppliedMeta(null);
    fetchQuote({ silent: true, coupon: "" });
  };

  useEffect(() => {
    if (!quote?.rentalFee) {
      setAvailableCoupons([]);
      return undefined;
    }
    let cancelled = false;
    bikeRentUserApi
      .getAvailableCoupons({
        rentalAmount: quote.rentalFee,
        securityDeposit:
          quote.securityDepositOriginal
          ?? bike?.securityDeposit
          ?? quote.securityDeposit
          ?? 0,
        limit: 12,
      })
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setAvailableCoupons(list);
        // Drop a previously applied coupon if it is no longer eligible for this user/quote.
        if (appliedCoupon) {
          const stillEligible = list.some(
            (item) => String(item.code || "").toUpperCase() === String(appliedCoupon).toUpperCase(),
          );
          if (!stillEligible) {
            setAppliedCoupon("");
            setCouponAppliedMeta(null);
            setCouponCode("");
            fetchQuote({ silent: true, coupon: "" });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableCoupons([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh on quote amount / deposit
  }, [
    quote?.rentalFee,
    quote?.securityDeposit,
    quote?.securityDepositOriginal,
    appliedCoupon,
  ]);

  const submitBookingRequest = async () => {
    if (!validate()) {
      if (!policiesAccepted) {
        toast.error("Please agree to the Bike Rental Policies to continue");
      } else if (!areCheckoutDocumentsComplete(identityDocs, requiredDocTypes)) {
        toast.error("Upload all required documents to continue");
      } else {
        toast.error("Please fix the highlighted fields");
      }
      return;
    }
    setLoading(true);
    try {
      let nextQuote = quote;
      if (!nextQuote) {
        nextQuote = await fetchQuote({ silent: true });
        if (!nextQuote) return;
      }

      const normalizedLicense = normalizeLicense(licenseNumber);
      try {
        if (normalizedLicense !== normalizeLicense(auth.drivingLicenseNumber)) {
          await userAPI.updateProfile({ drivingLicenseNumber: normalizedLicense });
          window.dispatchEvent(new Event("userAuthChanged"));
        }
      } catch (err) {
        toast.error(err?.response?.data?.message || "Could not save driving license");
        return;
      }

      const created = await bikeRentUserApi.createBooking({
        bikeId,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        couponCode: appliedCoupon || couponCode || undefined,
        drivingLicenseNumber: normalizedLicense,
        customer: {
          name: auth.name,
          phone: auth.phone,
          email: auth.email,
          licenseNumber: normalizedLicense,
          drivingLicenseNumber: normalizedLicense,
        },
      });
      sessionStorage.removeItem("bikeRentCheckout");
      const id = bookingIdOf(created);
      toast.success(
        "Your booking request has been submitted. It will be confirmed after admin approval.",
      );
      if (isPaymentPendingStatus(created.status)) {
        navigate(getBikeRentPayPath(id), { replace: true });
        return;
      }
      navigate(getBikeRentBookingPath(id), { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not submit booking request");
    } finally {
      setLoading(false);
    }
  };

  const depositAmount = Number(quote?.securityDeposit ?? bike?.securityDeposit ?? 0);
  const rentalPayable = Number(
    quote?.rentalPayable
      ?? Math.max(
        0,
        Number(quote?.rentalFee || 0)
          + Number(quote?.taxAmount || 0)
          - Number(quote?.discountAmount || 0),
      ),
  );
  const totalAmount = quote ? rentalPayable + depositAmount : 0;
  const canProceed = Boolean(
    bikeId
      && bike
      && periodValid
      && slotAvailable
      && !availabilityLoading
      && isValidLicense(licenseNumber)
      && areCheckoutDocumentsComplete(identityDocs, requiredDocTypes)
      && policiesAccepted
      && !loading
      && !quoting,
  );

  const applyNextSlot = (slot) => {
    if (!slot?.startAt || !slot?.endAt) return;
    setStartAt(toLocalInput(new Date(slot.startAt)));
    setEndAt(toLocalInput(new Date(slot.endAt)));
    setDurationId("custom");
    setEditSchedule(true);
    toast.success("Updated to next available slot");
  };

  const summaryCard = (
    <section className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gradient-to-r from-[#FF6A00]/10 to-transparent px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold text-gray-900">Fare summary</h2>
          <p className="truncate text-[10px] text-gray-500">
            {quoting ? "Updating quote…" : estimatedDuration}
          </p>
        </div>
        {quote ? (
          <p className="shrink-0 text-base font-black text-[#FF6A00]">{formatInr(totalAmount)}</p>
        ) : null}
      </div>

      <div className="space-y-2 px-3 py-3">
        {quote ? (
          <>
            {(quote.pricingBreakdown?.lines || []).length > 0 ? (
              quote.pricingBreakdown.lines.map((line) => (
                <SummaryRow
                  key={line.key || line.label}
                  label={line.label}
                  value={formatInr(line.amount ?? 0)}
                />
              ))
            ) : (
              <SummaryRow
                label={
                  quote.tier === "daily"
                    ? "Full day rental"
                    : quote.tier === "weekly" || quote.tier === "weekly_mixed"
                      ? "Weekly rental"
                      : "Hourly rental"
                }
                value={formatInr(quote.rentalFee ?? 0)}
              />
            )}
            {(quote.pricingBreakdown?.lines || []).length > 1 ? (
              <SummaryRow
                label="Rental subtotal"
                value={formatInr(quote.rentalFee ?? 0)}
                muted
              />
            ) : null}
            {Number(quote.discountAmount || 0) > 0 ? (
              <SummaryRow
                label={appliedCoupon ? `Discount (${appliedCoupon})` : "Discount"}
                value={`−${formatInr(quote.discountAmount)}`}
              />
            ) : null}
            {Number(quote.discountAmount || 0) > 0 ? (
              <SummaryRow
                label="Final rental"
                value={formatInr(
                  couponAppliedMeta?.finalRentalAmount
                    ?? quote.rentalPayable
                    ?? Math.max(0, Number(quote.rentalFee || 0) - Number(quote.discountAmount || 0)),
                )}
              />
            ) : null}
            <SummaryRow
              label="Taxes"
              value={
                Number(quote.taxAmount || 0) > 0
                  ? formatInr(quote.taxAmount)
                  : "₹0"
              }
              muted
            />
            <SummaryRow
              label="Security deposit"
              value={formatInr(depositAmount)}
              muted
            />
            <SummaryRow
              label="Total payable"
              value={formatInr(totalAmount)}
              strong
            />
            <p className="text-[10px] leading-snug text-gray-400">
              Deposit refunded after return inspection.
            </p>
          </>
        ) : (
          <div className="rounded-lg bg-gray-50 px-3 py-4 text-center">
            <p className="text-xs font-semibold text-gray-700">
              {quoting ? "Calculating…" : "Pick a duration for a live quote"}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-gray-100 px-3 py-3">
        <FieldLabel>Coupon</FieldLabel>
        <div className="flex min-w-0 gap-1.5">
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <TicketPercent className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <FormInput
              className="pl-8"
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                setAppliedCoupon("");
                setCouponAppliedMeta(null);
              }}
              placeholder="Code"
              aria-label="Coupon code"
            />
          </div>
          <button
            type="button"
            onClick={applyCoupon}
            disabled={quoting || !couponCode.trim()}
            className="shrink-0 rounded-lg border border-[#FF6A00]/30 bg-[#FF6A00]/10 px-3 text-xs font-extrabold text-[#FF6A00] disabled:opacity-50"
          >
            Apply
          </button>
        </div>
        {appliedCoupon ? (
          <div className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{appliedCoupon} applied</span>
              <button type="button" className="font-bold underline" onClick={clearCoupon}>
                Remove
              </button>
            </div>
            {Number(quote?.discountAmount || 0) > 0 ? (
              <p className="mt-0.5 text-emerald-700">
                Save {formatInr(quote.discountAmount)}
                {couponAppliedMeta?.applicableOn
                  ? ` on ${couponAppliedMeta.applicableOn === "both"
                    ? "rental + deposit"
                    : couponAppliedMeta.applicableOn}`
                  : ""}
              </p>
            ) : null}
          </div>
        ) : null}
        {!appliedCoupon && availableCoupons.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {availableCoupons.slice(0, 6).map((item) => (
              <button
                key={item.id || item.code}
                type="button"
                disabled={quoting}
                onClick={() => {
                  setCouponCode(item.code);
                  fetchQuote({ coupon: item.code });
                }}
                className="rounded-full border border-orange-100 bg-orange-50 px-2 py-1 text-[10px] font-bold text-[#FF6A00]"
              >
                <span className="font-mono">{item.code}</span>
                {item.label ? (
                  <span className="ml-1 font-semibold text-orange-700/80">{item.label}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        {!appliedCoupon && availableCoupons.length === 0 && Number(quote?.rentalFee || 0) > 0 ? (
          <p className="text-[10px] text-gray-400">
            No eligible coupons for this booking right now.
          </p>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-gray-100 px-3 py-3">
        <label
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5",
            errors.policies
              ? "border-red-300 bg-red-50/60"
              : "border-gray-200 bg-white",
          )}
        >
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[#FF6A00] focus:ring-[#FF6A00]"
            checked={policiesAccepted}
            onChange={(e) => {
              setPoliciesAccepted(e.target.checked);
              if (e.target.checked) {
                setErrors((prev) => ({ ...prev, policies: undefined }));
              }
            }}
          />
          <span className="min-w-0 text-xs leading-snug text-gray-700">
            I have read and agree to the{" "}
            <button
              type="button"
              className="font-bold text-[#FF6A00] underline underline-offset-2"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPoliciesOpen(true);
              }}
            >
              Bike Rental Policies
            </button>
            .
          </span>
        </label>
        {errors.policies ? (
          <p className="text-[11px] font-medium text-red-600">{errors.policies}</p>
        ) : null}
      </div>

      <div className="hidden border-t border-gray-100 px-3 py-3 lg:block">
        <PrimaryButton disabled={!canProceed} onClick={submitBookingRequest}>
          {loading || quoting
            ? "Please wait…"
            : quote
              ? `Request booking · ${formatInr(totalAmount)}`
              : "Continue"}
        </PrimaryButton>
        {!policiesAccepted ? (
          <p className="mt-1.5 text-center text-[10px] text-gray-400">
            Agree to policies to enable booking
          </p>
        ) : null}
      </div>
    </section>
  );

  const handlePoliciesLoaded = useCallback((data) => {
    if (data) setModuleSettings(data);
  }, []);

  const bikeImage = bikePrimaryImage(bike);

  return (
    <BikeRentPageShell maxWidth="max-w-6xl">
      <BikeRentPageHeader
        title="Checkout"
        subtitle="Confirm details & request booking"
        backTo={bikeId ? undefined : getBikeRentBrowsePath()}
      />

      <main className="w-full min-w-0 max-w-full overflow-x-hidden px-3 py-3 sm:px-4 pb-[7rem] lg:pb-6">
        {!bikeId ? (
          <EmptyState
            icon={Bike}
            title="No bike selected"
            subtitle="Choose a bike from browse to continue checkout."
            action={
              <PrimaryButton onClick={() => navigate(getBikeRentBrowsePath())}>
                Browse bikes
              </PrimaryButton>
            }
          />
        ) : bikeLoading ? (
          <CheckoutSkeleton />
        ) : !bike ? (
          <EmptyState
            icon={Bike}
            title="Bike unavailable"
            subtitle="This bike may no longer be available in your zone."
            action={
              <PrimaryButton onClick={() => navigate(getBikeRentBrowsePath())}>
                Browse bikes
              </PrimaryButton>
            }
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="grid w-full min-w-0 max-w-full items-start gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.9fr)] lg:gap-4"
          >
            <div className="w-full min-w-0 max-w-full space-y-3">
              {/* Selected bike — compact strip */}
              <section className="flex w-full min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <div className="relative h-[4.75rem] w-[4.75rem] shrink-0 overflow-hidden bg-gray-100 sm:h-24 sm:w-28">
                  {bikeImage ? (
                    <img
                      src={bikeImage}
                      alt={bike.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-gray-300">
                      <Bike className="h-7 w-7" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 px-2.5 py-2 sm:px-3 sm:py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h1 className="truncate text-sm font-black leading-tight text-gray-900 sm:text-base">
                        {bike.name}
                      </h1>
                      <p className="mt-0.5 truncate text-[11px] text-gray-500">
                        {[bike.brand, bike.model].filter(Boolean).join(" ")}
                        {bike.categoryName || bike.category?.name
                          ? ` · ${bike.categoryName || bike.category?.name}`
                          : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-[#FF6A00]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#FF6A00]">
                      {formatInr(bike.hourlyPrice)}/hr
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                      {formatInr(bike.dailyPrice)}/day
                    </span>
                    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                      {formatInr(bike.weeklyPrice || 0)}/wk
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                      <ShieldCheck className="h-3 w-3 text-[#FF6A00]" />
                      {formatInr(bike.securityDeposit)}
                    </span>
                    {bike.helmetIncluded ? (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <HardHat className="h-3 w-3" /> Helmet
                      </span>
                    ) : null}
                    <span className="inline-flex max-w-full items-center gap-0.5 truncate rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                      <MapPin className="h-3 w-3 shrink-0 text-[#FF6A00]" />
                      <span className="truncate">{pickupLabel}</span>
                    </span>
                  </div>
                </div>
              </section>

              <PickupLocationCard zoneName={pickupLabel} pickupHub={pickupHub} compact />

              {/* Rental period */}
              <section className="w-full max-w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-2 border-b border-gray-50 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FF6A00]/10 text-[#FF6A00]">
                      <Clock3 className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-extrabold text-gray-900">Rental period</h2>
                      <p className="truncate text-[10px] text-gray-500">
                        {minHours}–{maxHours} hours allowed
                      </p>
                    </div>
                  </div>
                </div>

                <div className="w-full min-w-0 space-y-3 p-3">
                  {availablePresets.length ? (
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                      {availablePresets.map((preset) => {
                        const selected = durationId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => selectDuration(preset)}
                            className={cn(
                              "min-w-0 rounded-xl border px-1 py-2 text-center transition active:scale-[0.98]",
                              selected
                                ? "border-[#FF6A00] bg-[#FF6A00] text-white shadow-sm shadow-[#FF6A00]/20"
                                : "border-gray-200 bg-white text-gray-800 hover:border-gray-300",
                            )}
                          >
                            <span className="block truncate text-[11px] font-extrabold sm:text-xs">
                              {preset.label}
                            </span>
                            <span
                              className={cn(
                                "mt-0.5 block truncate text-[9px]",
                                selected ? "text-white/80" : "text-gray-400",
                              )}
                            >
                              {preset.sub}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-700">
                      Set custom pickup/return within {minHours}–{maxHours} hours.
                    </p>
                  )}

                  <div className="rounded-xl bg-gradient-to-br from-orange-50 to-amber-50/60 px-2.5 py-2.5">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-[#FF6A00]">
                          Pickup
                        </p>
                        <p className="mt-0.5 break-words text-[11px] font-bold leading-snug text-gray-900 sm:text-xs">
                          {formatDisplayDate(startDate)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-center px-0.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm">
                          <ArrowRight className="h-3 w-3 text-[#FF6A00]" />
                        </div>
                        <p className="mt-0.5 max-w-[3.5rem] text-center text-[9px] font-bold leading-tight text-gray-600">
                          {estimatedDuration}
                        </p>
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-[#FF6A00]">
                          Return
                        </p>
                        <p className="mt-0.5 break-words text-[11px] font-bold leading-snug text-gray-900 sm:text-xs">
                          {formatDisplayDate(endDate)}
                        </p>
                      </div>
                    </div>
                    {!showScheduleEditors ? (
                      <button
                        type="button"
                        onClick={() => setEditSchedule(true)}
                        className="mt-2 w-full rounded-lg bg-white/80 py-1.5 text-[11px] font-bold text-[#FF6A00] ring-1 ring-[#FF6A00]/15"
                      >
                        Change pickup / return times
                      </button>
                    ) : null}
                  </div>

                  {showScheduleEditors ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                          Custom schedule
                        </p>
                        {durationId !== "custom" ? (
                          <button
                            type="button"
                            onClick={() => setEditSchedule(false)}
                            className="text-[11px] font-bold text-gray-500"
                          >
                            Hide
                          </button>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                            Custom
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-2.5">
                          <div className="mb-1.5 flex items-center gap-1 text-[11px] font-extrabold text-gray-800">
                            <CalendarDays className="h-3.5 w-3.5 text-[#FF6A00]" />
                            Pickup
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <label className="block min-w-0">
                              <FieldLabel required>Date</FieldLabel>
                              <FormInput
                                type="date"
                                value={startParts.date}
                                min={minPickupDate}
                                error={errors.period}
                                onChange={(e) => updateStartParts(e.target.value, startParts.time)}
                              />
                            </label>
                            <label className="block min-w-0">
                              <FieldLabel required>Time</FieldLabel>
                              <FormInput
                                type="time"
                                value={startParts.time}
                                min={minPickupTime}
                                error={errors.period}
                                onChange={(e) => updateStartParts(startParts.date, e.target.value)}
                              />
                            </label>
                          </div>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-2.5">
                          <div className="mb-1.5 flex items-center gap-1 text-[11px] font-extrabold text-gray-800">
                            <CalendarDays className="h-3.5 w-3.5 text-[#FF6A00]" />
                            Return
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <label className="block min-w-0">
                              <FieldLabel required>Date</FieldLabel>
                              <FormInput
                                type="date"
                                value={endParts.date}
                                min={minReturnDate}
                                error={errors.period}
                                onChange={(e) => updateEndParts(e.target.value, endParts.time)}
                              />
                            </label>
                            <label className="block min-w-0">
                              <FieldLabel required>Time</FieldLabel>
                              <FormInput
                                type="time"
                                value={endParts.time}
                                error={errors.period}
                                onChange={(e) => updateEndParts(endParts.date, e.target.value)}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {durationError || errors.period ? (
                    <p className="text-[11px] font-medium text-red-600">
                      {durationError || errors.period}
                    </p>
                  ) : null}

                  {periodValid && availabilityLoading ? (
                    <p className="text-[11px] font-medium text-gray-500">Checking availability…</p>
                  ) : null}

                  <ConflictBanner
                    check={availabilityCheck}
                    onUseNextSlot={applyNextSlot}
                  />
                </div>
              </section>

              {/* Required documents (profile-backed) */}
              <CheckoutRequiredDocuments
                userProfile={auth.userProfile}
                licenseNumber={licenseNumber}
                onLicenseChange={(value) => {
                  setLicenseNumber(normalizeLicense(value));
                  setErrors((prev) => ({ ...prev, licenseNumber: undefined }));
                }}
                licenseError={errors.licenseNumber}
                errors={errors}
                onDocumentsChange={handleDocumentsChange}
                requiredDocTypes={requiredDocTypes}
              />
              {errors.documents ? (
                <p className="-mt-1 px-1 text-[11px] font-medium text-red-600">
                  {errors.documents}
                </p>
              ) : null}
            </div>

            <aside className="w-full min-w-0 max-w-full lg:sticky lg:top-24">
              {summaryCard}
            </aside>
          </motion.div>
        )}
      </main>

      {bike && bikeId ? (
        <div className="fixed inset-x-0 bottom-0 z-40 w-full max-w-[100vw] overflow-hidden border-t border-gray-200 bg-white/95 px-3 py-2.5 backdrop-blur-md sm:px-4 lg:hidden pb-[max(0.65rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full max-w-lg min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">
                {quoting ? "Updating…" : "Total"}
              </p>
              <p className="truncate text-base font-black text-gray-900">
                {quote ? formatInr(totalAmount) : "—"}
              </p>
              <p className="truncate text-[10px] text-gray-500">
                {!policiesAccepted
                  ? "Agree to policies to book"
                  : !areCheckoutDocumentsComplete(identityDocs, requiredDocTypes)
                    ? "Upload required documents"
                    : estimatedDuration}
              </p>
            </div>
            <PrimaryButton
              className="!w-auto max-w-[55%] shrink-0 truncate px-3.5 py-2.5 text-sm"
              disabled={!canProceed}
              onClick={submitBookingRequest}
            >
              {loading || quoting ? "Wait…" : quote ? "Request booking" : "Continue"}
            </PrimaryButton>
          </div>
        </div>
      ) : null}

      <BikeRentPoliciesSheet
        open={policiesOpen}
        onClose={() => setPoliciesOpen(false)}
        settings={moduleSettings}
        onSettingsLoaded={handlePoliciesLoaded}
        bikeId={bikeId}
      />
    </BikeRentPageShell>
  );
}
