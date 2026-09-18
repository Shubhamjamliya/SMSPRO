import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Star } from "lucide-react";
import { toast } from "sonner";
import bikeRentUserApi from "../services/userApi";
import { BikeRentPageHeader, BikeRentPageShell, PrimaryButton } from "../components/ui";
import { getBikeRentBookingPath } from "../utils/routes";
export default function Review() {
  const { id } = useParams(); const navigate = useNavigate(); const [stars, setStars] = useState(0); const [comment, setComment] = useState(""); const [submitting, setSubmitting] = useState(false);
  const submit = async (event) => { event.preventDefault(); if (!stars) return toast.error("Choose a rating"); setSubmitting(true); try { await bikeRentUserApi.submitReview(id, { stars, comment }); toast.success("Thanks for your review"); navigate(getBikeRentBookingPath(id)); } catch (error) { toast.error(error?.response?.data?.message || "Could not submit review"); } finally { setSubmitting(false); } };
  return <BikeRentPageShell><BikeRentPageHeader title="Rate your rental" /><main className="p-4"><form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">How was your bike rental experience?</p><div className="my-6 flex justify-center gap-2">{[1,2,3,4,5].map((value) => <button key={value} type="button" onClick={() => setStars(value)} aria-label={`${value} stars`}><Star className={`h-9 w-9 ${value <= stars ? "fill-[#FF6A00] text-[#FF6A00]" : "text-gray-300"}`} /></button>)}</div><textarea className="min-h-28 w-full rounded-xl border p-3 text-sm" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell us more (optional)" /><PrimaryButton className="mt-4" disabled={submitting}>{submitting ? "Submitting…" : "Submit review"}</PrimaryButton></form></main></BikeRentPageShell>;
}
