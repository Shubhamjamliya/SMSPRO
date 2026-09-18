import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { BikeRentPageHeader, BikeRentPageShell, EmptyState, PrimaryButton } from "../components/ui";
import ReturnSettlementSummaryCard from "../components/ReturnSettlementSummaryCard";
import bikeRentUserApi from "../services/userApi";
import { getBikeRentActivePath, getBikeRentBookingsPath } from "../utils/routes";
import { bookingStatusLabel } from "../utils/bookingDisplay";

const RETURNABLE = [
  "reserved",
  "pickup_completed",
  "rental_started",
  "active",
];

export default function ReturnRequest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      bikeRentUserApi.getMyBookingById(id),
      bikeRentUserApi.previewReturnSettlement(id).catch(() => null),
    ])
      .then(([nextBooking, nextPreview]) => {
        if (cancelled) return;
        setBooking(nextBooking);
        setPreview(nextPreview);
      })
      .catch(() => {
        if (!cancelled) {
          setBooking(null);
          setPreview(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await bikeRentUserApi.requestReturn(id, {
        notes,
        photos: photoUrl ? [{ url: photoUrl }] : [],
      });
      toast.success("Return notified — hub staff will end the ride after inspection");
      navigate(getBikeRentActivePath(id), { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not submit return");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <BikeRentPageShell>
        <BikeRentPageHeader title="Request return" backTo={getBikeRentActivePath(id)} />
        <main className="space-y-4 px-4 py-4">
          <div className="h-48 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
        </main>
      </BikeRentPageShell>
    );
  }

  if (!booking) {
    return (
      <BikeRentPageShell>
        <BikeRentPageHeader title="Request return" backTo={getBikeRentBookingsPath()} />
        <main className="px-4 py-4">
          <EmptyState title="Booking not found" subtitle="It may no longer be available." />
        </main>
      </BikeRentPageShell>
    );
  }

  const canSubmit = RETURNABLE.includes(String(booking.status || "").toLowerCase());
  const alreadyReturned = ["return_requested", "inspection", "completed", "refund_processing", "deposit_refunded"]
    .includes(String(booking.status || "").toLowerCase());

  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="Request return"
        subtitle={booking.bookingNumber || bookingStatusLabel(booking.status)}
        backTo={getBikeRentActivePath(id)}
      />
      <main className="space-y-4 px-4 py-4 pb-8">
        <ReturnSettlementSummaryCard preview={preview} />

        {alreadyReturned ? (
          <section className="rounded-2xl border border-orange-100 bg-orange-50 p-4 text-sm text-orange-900">
            Return already requested or settled. Hub staff will finish inspection and deposit refund.
          </section>
        ) : null}

        {canSubmit ? (
          <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">
              Tell the hub you’ve arrived. Staff will inspect the bike, end the ride, and settle your
              deposit using the calculation above (updated if damage or extra time applies).
            </p>
            <label className="block text-sm font-bold">
              Notes
              <textarea
                className="mt-1 min-h-28 w-full rounded-xl border p-3 font-normal"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any damage or handover notes?"
              />
            </label>
            <label className="block text-sm font-bold">
              Photo URL <span className="font-normal text-gray-400">(optional)</span>
              <input
                className="mt-1 w-full rounded-xl border p-3 font-normal"
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Notify hub I’ve returned"}
            </PrimaryButton>
          </form>
        ) : !alreadyReturned ? (
          <section className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-600 shadow-sm">
            Return is not available while this booking is{" "}
            <b>{bookingStatusLabel(booking.status)}</b>.
          </section>
        ) : null}
      </main>
    </BikeRentPageShell>
  );
}
