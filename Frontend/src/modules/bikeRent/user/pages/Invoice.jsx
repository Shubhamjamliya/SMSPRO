import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { initRazorpayPayment } from "@food/utils/razorpay";
import bikeRentUserApi from "../services/userApi";
import LateReturnBillingCard from "../components/LateReturnBillingCard";
import BookingPaymentSummaryCard from "../components/BookingPaymentSummaryCard";
import BookingRefundDetailsCard from "../components/BookingRefundDetailsCard";
import { BikeRentPageHeader, BikeRentPageShell, EmptyState } from "../components/ui";
import { formatInr } from "../utils/format";

function TaxInvoiceCard({ invoice }) {
  const ref = useRef(null);
  const [downloading, setDownloading] = useState(false);

  if (!invoice) return null;

  const downloadPdf = async () => {
    if (!ref.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { default: jsPDF } = await import("jspdf");

      const canvas = await html2canvas(ref.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF("p", "mm", "a4");
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`${invoice.invoiceNumber || "invoice"}.pdf`);
    } catch {
      toast.error("Could not generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500">TAX INVOICE</p>
          <h2 className="text-lg font-black">{invoice.invoiceNumber}</h2>
        </div>
        <button
          type="button"
          onClick={downloadPdf}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? "Preparing…" : "Download PDF"}
        </button>
      </div>

      <div ref={ref} className="space-y-4 bg-white p-1">
        {invoice.vendorSnapshot?.legalBusinessName ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
            <p className="font-semibold text-gray-800">{invoice.vendorSnapshot.legalBusinessName}</p>
            {invoice.vendorSnapshot.isGstRegistered && invoice.vendorSnapshot.gstin ? (
              <p>GSTIN: {invoice.vendorSnapshot.gstin}</p>
            ) : null}
            {invoice.vendorSnapshot.address ? <p>{invoice.vendorSnapshot.address}</p> : null}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-gray-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">GST</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((line) => (
                <tr key={line.type} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-700">{line.label}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{formatInr(line.amount)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">
                    {line.taxable ? formatInr(line.gstAmount) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Taxable amount</span>
            <span className="text-gray-800">{formatInr(invoice.taxableAmount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">GST ({invoice.gstRate}%)</span>
            <span className="text-gray-800">{formatInr(invoice.gstAmount)}</span>
          </div>
          {invoice.securityDeposit > 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Security deposit (refundable, non-taxable)</span>
              <span className="text-gray-800">{formatInr(invoice.securityDeposit)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 text-base">
            <span className="font-bold text-gray-900">Total payable</span>
            <span className="font-black text-gray-900">{formatInr(invoice.totalPayable)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Invoice() {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [payingLate, setPayingLate] = useState(false);

  useEffect(() => {
    bikeRentUserApi.getMyBookingById(id).then(setBooking).catch(() => setBooking(null));
    bikeRentUserApi.getMyInvoice(id).then(setInvoice).catch(() => setInvoice(null));
  }, [id]);

  if (!booking) {
    return (
      <BikeRentPageShell>
        <BikeRentPageHeader title="Invoice" />
        <main className="p-4">
          <EmptyState title="Invoice not found" />
        </main>
      </BikeRentPageShell>
    );
  }

  const late = booking.lateReturn;
  const needsLatePay =
    booking.status === "completed"
    && Number(late?.remainingAmount || 0) > 0
    && late?.paymentStatus === "pending";

  const payLateOnline = async () => {
    setPayingLate(true);
    try {
      const orderPayload = await bikeRentUserApi.createLateBalanceRazorpayOrder(id);
      const rz = orderPayload.razorpay || {};
      if (!rz.orderId || !rz.key) throw new Error("Razorpay is not configured");
      await initRazorpayPayment({
        key: rz.key,
        amount: rz.amount,
        currency: rz.currency || "INR",
        name: rz.name || "Bike Rent",
        description: rz.description || "Late charges",
        order_id: rz.orderId,
        handler: async (response) => {
          const paid = await bikeRentUserApi.verifyLateBalanceRazorpayPayment(id, {
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          setBooking(paid);
          toast.success("Late balance paid");
        },
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Payment failed");
    } finally {
      setPayingLate(false);
    }
  };

  const payLateWallet = async () => {
    setPayingLate(true);
    try {
      const paid = await bikeRentUserApi.payLateBalanceWithWallet(id);
      setBooking(paid);
      toast.success("Late balance paid from wallet");
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Wallet payment failed");
    } finally {
      setPayingLate(false);
    }
  };

  return (
    <BikeRentPageShell>
      <BikeRentPageHeader title="Invoice" />
      <main className="space-y-4 p-4">
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-500">BOOKING {booking.bookingNumber}</p>
          <h1 className="mt-1 text-xl font-black">Rental invoice</h1>
          <p className="mt-1 text-sm text-gray-500">
            Paid {formatInr(booking.money?.totalPaid ?? 0)} of{" "}
            {formatInr(booking.money?.totalPayable ?? 0)}
          </p>
        </section>

        <TaxInvoiceCard invoice={invoice} />

        <BookingPaymentSummaryCard booking={booking} />

        <LateReturnBillingCard
          booking={booking}
          paying={payingLate}
          onPayOnline={needsLatePay ? payLateOnline : undefined}
          onPayWallet={needsLatePay ? payLateWallet : undefined}
        />

        <BookingRefundDetailsCard booking={booking} />
      </main>
    </BikeRentPageShell>
  );
}
