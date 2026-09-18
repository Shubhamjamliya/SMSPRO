import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, Share2, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Screen from "../components/Screen";
import { PrimaryButton, FareRow, SectionLabel, inr } from "../components/ui";
import { useBooking } from "../context/BookingContext";
import { getShipmentById } from "../utils/mock/shipments";
import { PAYMENT_METHODS } from "../utils/mock/payments";
import { porterUserApi } from "../services/api";
import { tripToShipment } from "../utils/tripShipment";
import { getPorterHomePath, getPorterShipmentsPath } from "../utils/routes";
import {
  downloadPorterInvoicePdf,
  sharePorterInvoice,
} from "../utils/porterInvoiceExport";
import {
  buildPorterFareBreakdownFromShipment,
  porterFareBreakdownForExport,
} from "../utils/porterFareBreakdown";

const paymentLabel = (method) => {
  const id = String(method || "").toLowerCase();
  const known = PAYMENT_METHODS.find((p) => p.id === id);
  if (known) return known.label;
  if (id === "upi" || id === "razorpay") return "Online (UPI)";
  if (id === "wallet") return "Just Order Wallet";
  if (id === "cash" || id === "cod") return "Cash on delivery";
  if (id === "qr" || id === "razorpay_qr") return "QR payment";
  return method || "—";
};

export default function DeliveryInvoice() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeShipment, total, paymentMethodId } = useBooking();
  const [fetchedShipment, setFetchedShipment] = useState(null);
  const [loading, setLoading] = useState(Boolean(id && id !== "current"));
  const [exportBusy, setExportBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!id || id === "current") {
        setLoading(false);
        return;
      }

      const mock = getShipmentById(id);
      if (mock) {
        if (!cancelled) {
          setFetchedShipment(mock);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const trip = await porterUserApi.getTrip(id);
        if (cancelled) return;
        setFetchedShipment(tripToShipment(trip));
      } catch (err) {
        if (!cancelled) {
          toast.error(err?.response?.data?.message || "Invoice not found");
          setFetchedShipment(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const shipment = useMemo(() => {
    if (id === "current" && activeShipment) {
      const trip = activeShipment.trip || null;
      return {
        trackingId: activeShipment.trackingId || trip?.tripNumber,
        vehicle: activeShipment.vehicle || trip?.vehicle?.name,
        pickup: activeShipment.pickup || trip?.pickup,
        delivery: activeShipment.delivery || trip?.drop,
        partner: activeShipment.partner,
        discount: 0,
        total: Number(
          trip?.fare?.total
            ?? trip?.fareEstimateTotal
            ?? activeShipment.total
            ?? total
            ?? 0,
        ),
        paymentMethod:
          trip?.payment?.method
          || paymentMethodId
          || "cash",
        createdAt:
          activeShipment.createdAt
          || trip?.createdAt
          || new Date().toISOString(),
        deliveredAt:
          activeShipment.deliveredAt
          || trip?.completedAt
          || trip?.updatedAt
          || new Date().toISOString(),
        trip,
      };
    }

    if (
      fetchedShipment
      && activeShipment
      && (activeShipment.id === id || activeShipment.trip?.id === id)
    ) {
      const trip = activeShipment.trip || {};
      return {
        ...fetchedShipment,
        partner: fetchedShipment.partner || activeShipment.partner,
        total: Number(
          trip.fare?.total
            ?? fetchedShipment.total
            ?? activeShipment.total
            ?? 0,
        ),
        paymentMethod: trip.payment?.method || fetchedShipment.paymentMethod,
        deliveredAt:
          fetchedShipment.deliveredAt
          || trip.completedAt
          || activeShipment.deliveredAt,
      };
    }

    return fetchedShipment;
  }, [id, activeShipment, fetchedShipment, total, paymentMethodId]);

  const fareBreakdown = useMemo(
    () => buildPorterFareBreakdownFromShipment(shipment),
    [shipment],
  );

  const invoiceBreakdown = useMemo(
    () => porterFareBreakdownForExport(
      fareBreakdown,
      paymentLabel(shipment?.paymentMethod),
    ),
    [fareBreakdown, shipment?.paymentMethod],
  );

  const amountPaid = Number(
    fareBreakdown.total || shipment?.total || 0,
  );

  if (loading) {
    return (
      <Screen title="Delivery invoice">
        <div className="flex flex-col items-center py-16">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-[#2F6BFF]" />
          <p className="text-[13px] text-gray-500">Loading invoice…</p>
        </div>
      </Screen>
    );
  }

  if (!shipment) {
    return (
      <Screen title="Delivery invoice">
        <p className="text-[14px] text-gray-500">Invoice not found.</p>
        <PrimaryButton className="mt-4" onClick={() => navigate(getPorterShipmentsPath())}>
          Back to shipments
        </PrimaryButton>
      </Screen>
    );
  }

  const handleDownloadPdf = async () => {
    if (exportBusy) return;
    setExportBusy("download");
    try {
      await downloadPorterInvoicePdf(shipment, invoiceBreakdown);
      toast.success("Invoice downloaded");
    } catch (err) {
      toast.error(err?.message || "Could not download invoice");
    } finally {
      setExportBusy(null);
    }
  };

  const handleShare = async () => {
    if (exportBusy) return;
    setExportBusy("share");
    try {
      const result = await sharePorterInvoice(shipment, invoiceBreakdown);
      if (result === "copied") {
        toast.success("Invoice details copied");
      } else if (result !== "cancelled") {
        toast.success("Invoice shared");
      }
    } catch (err) {
      toast.error(err?.message || "Could not share invoice");
    } finally {
      setExportBusy(null);
    }
  };

  return (
    <Screen title="Delivery invoice" subtitle={shipment.trackingId}>
      <div className="mb-4 flex flex-col items-center rounded-2xl bg-white p-6 shadow-sm">
        <CheckCircle2 className="mb-2 h-12 w-12 text-[#2e7d32]" />
        <h2 className="text-[18px] font-extrabold text-gray-900">Delivery completed</h2>
        <p className="text-[12px] text-gray-500">
          {new Date(shipment.deliveredAt || shipment.createdAt).toLocaleString()}
        </p>
      </div>

      <SectionLabel>Shipment details</SectionLabel>
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 text-[13px]">
        <p><span className="text-gray-500">Tracking ID:</span> <span className="font-bold">{shipment.trackingId}</span></p>
        <p className="mt-1"><span className="text-gray-500">Vehicle:</span> <span className="font-bold">{shipment.vehicle}</span></p>
        {shipment.partner ? (
          <p className="mt-1"><span className="text-gray-500">Partner:</span> <span className="font-bold">{shipment.partner.name}</span></p>
        ) : null}
      </div>

      <SectionLabel>Route</SectionLabel>
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 text-[12px]">
        <p className="font-bold text-gray-900">{shipment.pickup?.title || "Pickup"}</p>
        <p className="text-gray-500">{shipment.pickup?.address}</p>
        <div className="my-2 border-l-2 border-dashed border-gray-200 pl-3">
          <p className="font-bold text-gray-900">{shipment.delivery?.title || "Drop"}</p>
          <p className="text-gray-500">{shipment.delivery?.address}</p>
        </div>
      </div>

      <SectionLabel>Payment summary</SectionLabel>
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
        {fareBreakdown.rows.map((row) => (
          <FareRow
            key={row.label}
            label={row.meta ? `${row.label} (${row.meta})` : row.label}
            value={inr(row.value)}
          />
        ))}
        {(shipment.discount || 0) > 0 ? (
          <FareRow label="Discount" value={`−${inr(shipment.discount)}`} accent />
        ) : null}
        <div className="my-2 border-t border-gray-100" />
        <FareRow label="Total paid" value={inr(amountPaid)} strong />
        <p className="mt-2 text-[11px] text-gray-400">
          Paid via {paymentLabel(shipment.paymentMethod)}
        </p>
      </div>

      <div className="flex gap-2">
        <PrimaryButton
          variant="outline"
          className="flex-1"
          disabled={Boolean(exportBusy)}
          onClick={handleDownloadPdf}
        >
          {exportBusy === "download" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download PDF
        </PrimaryButton>
        <PrimaryButton
          variant="outline"
          className="flex-1"
          disabled={Boolean(exportBusy)}
          onClick={handleShare}
        >
          {exportBusy === "share" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          Share
        </PrimaryButton>
      </div>

      <PrimaryButton className="mt-3" onClick={() => navigate(getPorterHomePath())}>
        Book another parcel
      </PrimaryButton>
    </Screen>
  );
}
