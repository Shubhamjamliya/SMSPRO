import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapPin, Phone, Star, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Screen from "../components/Screen";
import { PrimaryButton, FareRow, SectionLabel, inr } from "../components/ui";
import {
  getPorterInvoicePath,
  getPorterTrackingPath,
  getPorterFindingPartnerPath,
  getPorterPartnerAssignedPath,
  getPorterShipmentsPath,
} from "../utils/routes";
import { porterUserApi } from "../services/api";
import {
  formatTripStatusLabel,
  isTripActive,
  tripToShipment,
} from "../utils/tripShipment";
import { useBooking } from "../context/BookingContext";

export default function ShipmentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setActiveShipment } = useBooking();
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id || id === "current") {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const trip = await porterUserApi.getTrip(id);
        if (cancelled) return;
        setShipment(tripToShipment(trip));
      } catch (err) {
        if (!cancelled) {
          toast.error(err?.response?.data?.message || "Shipment not found");
          setShipment(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <Screen title="Shipment details">
        <div className="flex flex-col items-center py-16">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-[#2F6BFF]" />
          <p className="text-[13px] text-gray-500">Loading shipment…</p>
        </div>
      </Screen>
    );
  }

  if (!shipment) {
    return (
      <Screen title="Shipment details">
        <p className="text-[14px] text-gray-500">Shipment not found.</p>
        <PrimaryButton
          className="mt-4 !bg-[#2F6BFF] !shadow-[0_10px_24px_rgba(47,107,255,0.35)] hover:!bg-[#2557D6]"
          onClick={() => navigate(getPorterShipmentsPath())}
        >
          Back to shipments
        </PrimaryButton>
      </Screen>
    );
  }

  const active = isTripActive(shipment.statusRaw);
  const isDelivered = shipment.status === "delivered";
  const searching = ["quoted", "searching"].includes(shipment.statusRaw);
  const assigned = [
    "assigned",
    "en_route_pickup",
    "at_pickup",
    "in_transit",
    "at_drop",
  ].includes(shipment.statusRaw);

  const openLive = () => {
    setActiveShipment({
      id: shipment.id,
      trackingId: shipment.trackingId,
      status: shipment.statusRaw,
      stage: shipment.stage,
      partner: shipment.partner,
      pickup: shipment.pickup,
      delivery: shipment.delivery,
      vehicle: shipment.vehicle,
      total: shipment.total,
      createdAt: shipment.createdAt,
      trip: shipment.trip,
    });
    try {
      sessionStorage.setItem("porter_active_trip_id", String(shipment.id));
    } catch {
      /* ignore */
    }
    if (searching) {
      navigate(getPorterFindingPartnerPath());
      return;
    }
    if (assigned) {
      navigate(getPorterPartnerAssignedPath());
      return;
    }
    navigate(getPorterTrackingPath());
  };

  return (
    <Screen title="Shipment details" subtitle={shipment.trackingId}>
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <p className="text-[11px] font-bold uppercase text-gray-400">Status</p>
          <p className="text-[16px] font-extrabold capitalize text-gray-900">
            {formatTripStatusLabel(shipment.statusRaw)}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize ${
            isDelivered
              ? "bg-green-50 text-[#2e7d32]"
              : shipment.status === "cancelled"
                ? "bg-gray-100 text-gray-500"
                : "bg-amber-50 text-amber-700"
          }`}
        >
          {String(shipment.stage || "").replace(/_/g, " ")}
        </span>
      </div>

      <SectionLabel>Route</SectionLabel>
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
        <div className="mb-3 flex items-start gap-2">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-[#2e7d32]" />
          <div>
            <p className="text-[13px] font-bold text-gray-900">{shipment.pickup.title}</p>
            <p className="text-[12px] text-gray-500">{shipment.pickup.address}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#2F6BFF]" />
          <div>
            <p className="text-[13px] font-bold text-gray-900">{shipment.delivery.title}</p>
            <p className="text-[12px] text-gray-500">{shipment.delivery.address}</p>
          </div>
        </div>
      </div>

      <SectionLabel>Parcel info</SectionLabel>
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 text-[13px]">
        {shipment.goodsTypeName ? (
          <p>
            <span className="text-gray-500">Goods:</span>{" "}
            <span className="font-bold">{shipment.goodsTypeName}</span>
          </p>
        ) : null}
        <p className={shipment.goodsTypeName ? "mt-1" : ""}>
          <span className="text-gray-500">Weight:</span>{" "}
          <span className="font-bold">{shipment.weightKg || 0} kg</span>
        </p>
        <p className="mt-1">
          <span className="text-gray-500">Vehicle:</span>{" "}
          <span className="font-bold">{shipment.vehicle}</span>
        </p>
        {shipment.cancelReason ? (
          <p className="mt-1 text-red-500">
            <span className="text-gray-500">Cancel reason:</span> {shipment.cancelReason}
          </p>
        ) : null}
      </div>

      {shipment.partner ? (
        <>
          <SectionLabel>Delivery partner</SectionLabel>
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[#EEF3FF] text-[18px] font-bold text-[#2F6BFF]">
              {shipment.partner.photo ? (
                <img src={shipment.partner.photo} alt="" className="h-full w-full object-cover" />
              ) : (
                (shipment.partner.name || "P").charAt(0)
              )}
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-gray-900">{shipment.partner.name}</p>
              <p className="text-[12px] text-gray-500">{shipment.partner.vehicleNumber}</p>
              {shipment.rating ? (
                <div className="mt-0.5 flex items-center gap-1 text-[11px]">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  <span className="font-bold">You rated {shipment.rating}/5</span>
                </div>
              ) : null}
            </div>
            {shipment.partner.phone ? (
              <a
                href={`tel:${String(shipment.partner.phone).replace(/\s/g, "")}`}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100"
              >
                <Phone className="h-4 w-4 text-[#2F6BFF]" />
              </a>
            ) : null}
          </div>
        </>
      ) : null}

      <SectionLabel>Payment</SectionLabel>
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
        <FareRow label="Delivery fare" value={inr(shipment.fare)} />
        {shipment.discount > 0 ? (
          <FareRow label="Discount" value={`−${inr(shipment.discount)}`} accent />
        ) : null}
        <div className="my-2 border-t border-gray-100" />
        <FareRow label="Amount" value={inr(shipment.total)} strong />
        <p className="mt-1 text-[11px] capitalize text-gray-400">
          {shipment.paymentMethod}
          {shipment.paymentStatus ? ` · ${shipment.paymentStatus}` : ""}
        </p>
      </div>

      <div className="flex gap-2">
        {active ? (
          <PrimaryButton
            className="flex-1 !bg-[#2F6BFF] !shadow-[0_10px_24px_rgba(47,107,255,0.35)] hover:!bg-[#2557D6]"
            onClick={openLive}
          >
            {searching ? "View search" : "Track parcel"}
          </PrimaryButton>
        ) : null}
        {isDelivered ? (
          <PrimaryButton
            variant="outline"
            className="flex-1 border-[#2F6BFF]/30 text-[#2F6BFF]"
            onClick={() => navigate(getPorterInvoicePath(shipment.id))}
          >
            <FileText className="h-4 w-4" />
            Invoice
          </PrimaryButton>
        ) : null}
      </div>
    </Screen>
  );
}
