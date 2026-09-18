import { getCompanyNameAsync } from "@/modules/common/utils/businessSettings";

const safeFilePart = (value) =>
  String(value || "invoice")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 64);

const fareRowLabel = (row) => {
  if (!row?.meta) return row?.label || "Charge";
  return `${row.label} (${row.meta})`;
};

const paymentLines = (breakdown = {}) => {
  if (Array.isArray(breakdown.rows) && breakdown.rows.length) {
    return breakdown.rows.map((row) => ({
      label: fareRowLabel(row),
      value: Number(row.value || 0),
    }));
  }

  const lines = [
    { label: "Delivery fare", value: Number(breakdown.baseFare || 0) },
  ];
  if (Number(breakdown.waitingCharge || 0) > 0) {
    lines.push({ label: "Loading overtime", value: Number(breakdown.waitingCharge) });
  }
  if (Number(breakdown.platformFee || 0) > 0) {
    lines.push({ label: "Platform fee", value: Number(breakdown.platformFee) });
  }
  return lines.filter((line) => line.value > 0);
};

export function buildPorterInvoiceShareText(shipment, breakdown = {}, companyName = "Just Order") {
  const lines = [
    `${companyName} — Porter delivery invoice`,
    `Tracking ID: ${shipment.trackingId || "—"}`,
    `Vehicle: ${shipment.vehicle || "—"}`,
    shipment.partner?.name ? `Partner: ${shipment.partner.name}` : null,
    "",
    "Route",
    `Pickup: ${shipment.pickup?.address || "—"}`,
    `Drop: ${shipment.delivery?.address || "—"}`,
    "",
    "Payment",
    ...paymentLines(breakdown).map(
      (line) => `${line.label}: ₹${Math.round(line.value)}`,
    ),
    `Total paid: ₹${Math.round(Number(breakdown.total ?? shipment.total ?? 0))}`,
    `Paid via: ${breakdown.paymentLabel || shipment.paymentMethod || "—"}`,
    "",
    `Delivered: ${new Date(shipment.deliveredAt || shipment.createdAt).toLocaleString()}`,
  ].filter(Boolean);

  return lines.join("\n");
}

export async function createPorterInvoicePdf(shipment, breakdown = {}, companyName = "Just Order") {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF();
  let y = 18;

  const writeLine = (text, { bold = false, size = 10, gap = 6 } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text || ""), 170);
    doc.text(lines, 20, y);
    y += lines.length * (size * 0.45) + gap;
  };

  writeLine(`${companyName} — Porter Invoice`, { bold: true, size: 16, gap: 8 });
  writeLine(`Tracking ID: ${shipment.trackingId || "—"}`, { bold: true });
  writeLine(`Delivered: ${new Date(shipment.deliveredAt || shipment.createdAt).toLocaleString()}`);
  writeLine(`Vehicle: ${shipment.vehicle || "—"}`);
  if (shipment.partner?.name) {
    writeLine(`Partner: ${shipment.partner.name}`);
  }

  y += 2;
  writeLine("Route", { bold: true, size: 12, gap: 4 });
  writeLine(`Pickup: ${shipment.pickup?.address || "—"}`);
  writeLine(`Drop: ${shipment.delivery?.address || "—"}`);

  y += 2;
  writeLine("Payment summary", { bold: true, size: 12, gap: 4 });
  for (const line of paymentLines(breakdown)) {
    writeLine(`${line.label}: ₹${Math.round(line.value)}`);
  }
  if (Number(shipment.discount || 0) > 0) {
    writeLine(`Discount: −₹${Math.round(Number(shipment.discount || 0))}`);
  }
  writeLine(
    `Total paid: ₹${Math.round(Number(breakdown.total ?? shipment.total ?? 0))}`,
    { bold: true, size: 11 },
  );
  writeLine(`Paid via: ${breakdown.paymentLabel || shipment.paymentMethod || "—"}`);

  return doc;
}

export async function downloadPorterInvoicePdf(shipment, breakdown = {}) {
  const companyName = await getCompanyNameAsync();
  const doc = await createPorterInvoicePdf(shipment, breakdown, companyName);
  const filename = `porter-invoice-${safeFilePart(shipment.trackingId)}.pdf`;
  doc.save(filename);
  return filename;
}

export async function sharePorterInvoice(shipment, breakdown = {}) {
  const companyName = await getCompanyNameAsync();
  const text = buildPorterInvoiceShareText(shipment, breakdown, companyName);
  const title = `Porter invoice · ${shipment.trackingId || "delivery"}`;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const doc = await createPorterInvoicePdf(shipment, breakdown, companyName);
      const blob = doc.output("blob");
      const filename = `porter-invoice-${safeFilePart(shipment.trackingId)}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });

      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ title, text, files: [file] });
        return "shared-file";
      }

      await navigator.share({ title, text });
      return "shared-text";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
      // Fall through to clipboard
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return "copied";
  }

  throw new Error("Sharing is not supported on this device");
}
