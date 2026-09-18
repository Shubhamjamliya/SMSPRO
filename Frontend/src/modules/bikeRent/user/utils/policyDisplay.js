import { formatInr } from "./format";

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function minutesLabel(minutes) {
  const value = Math.max(0, num(minutes, 0));
  if (value === 0) return "0 minutes";
  if (value < 60) return `${value} minute${value === 1 ? "" : "s"}`;
  const hours = Math.floor(value / 60);
  const rem = value % 60;
  if (!rem) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours} hour${hours === 1 ? "" : "s"} ${rem} min`;
}

function hoursLabel(hours) {
  const value = Math.max(0, num(hours, 0));
  return `${value} hour${value === 1 ? "" : "s"}`;
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function depositModeLabel(mode) {
  const value = String(mode || "both").toLowerCase();
  if (value === "online") return "Online only (with rental payment)";
  if (value === "pay_at_pickup") return "At pickup only (Cash / UPI)";
  return "Online or at pickup (both options available)";
}

function cancelChargeLabel(settings) {
  const type = String(settings?.cancellationChargeType || "percent").toLowerCase();
  if (type === "fixed") {
    return `${formatInr(settings?.cancellationChargeFixed)} fixed charge on the rental fee`;
  }
  const percent = num(
    settings?.cancellationChargePercent ?? settings?.cancelFeePercentAfterReserve,
    0,
  );
  return `${percent}% of the rental fee`;
}

function noShowDepositLabel(settings) {
  const rule = String(settings?.noShowRefundRule || "full").toLowerCase();
  if (rule === "none") return "Full security deposit is kept (no refund to wallet)";
  if (rule === "partial") {
    const mode = String(settings?.noShowRefundMode || "percent").toLowerCase();
    if (mode === "fixed") {
      return `${formatInr(settings?.noShowRefundFixed)} may be deducted from the security deposit; remaining amount credited to wallet`;
    }
    return `${num(settings?.noShowRefundPercent, 0)}% may be deducted from the security deposit; remaining amount credited to wallet`;
  }
  return "Full security deposit is returned to your wallet";
}

function row(label, value) {
  if (value == null || value === "") return null;
  return { label, value: String(value) };
}

/**
 * Maps admin Bike Rent Settings → customer-facing policy sections.
 * Mirrors /admin/bike-rent/settings tabs. No hardcoded policy numbers.
 */
export function buildBikeRentPolicySections(settings) {
  if (!settings || typeof settings !== "object") return [];

  const sections = [];
  const freeCancelMins = num(settings.freeCancelBeforePickupMinutes, 0);
  const noShowEnabled = settings.noShowPolicyEnabled !== false;
  const noShowGrace = num(
    settings.noShowGraceMinutes ?? settings.pickupWindowMinutes,
    30,
  );
  const lateGrace = num(settings.lateReturnGraceMinutes, 0);
  const lateFee = num(settings.lateFeePerHour, 0);
  const lateMax = settings.lateReturnMaxCharge;
  const refundHours = num(settings.depositRefundHours, null);
  const refundDays = num(settings.depositRefundDays, null);
  const refundTiming =
    refundHours != null && refundHours > 0
      ? hoursLabel(refundHours)
      : refundDays != null && refundDays > 0
        ? `${refundDays} day${refundDays === 1 ? "" : "s"}`
        : null;

  const defaultNoShowMessage = noShowEnabled
    ? `If you do not pick up the bike within ${minutesLabel(noShowGrace)} of your scheduled pickup time, the refund will be processed according to the Bike Rental No Show Policy. ${noShowDepositLabel(settings)}.`
    : "";

  // 1) Booking — admin Booking tab
  sections.push({
    id: "booking",
    title: "Booking Rules",
    summary: "Rental length limits and unpaid booking timeout.",
    items: [
      row("Shortest rental", hoursLabel(settings.minBookingDurationHours)),
      row("Longest rental", hoursLabel(settings.maxBookingDurationHours)),
      row(
        "Cancel unpaid booking after",
        num(settings.unpaidBookingTtlMinutes) != null
          ? `${minutesLabel(settings.unpaidBookingTtlMinutes)} — if payment is not finished, the booking is cancelled`
          : null,
      ),
      row("Weekly price option", yesNo(Boolean(settings.allowWeeklyPricing))),
    ].filter(Boolean),
  });

  // 2) Cancellation — admin Cancel tab
  sections.push({
    id: "cancellation",
    title: "Cancellation Policy",
    summary: "Free cancel window and charges after that window.",
    items: [
      row(
        "Free cancel window",
        `Until ${minutesLabel(freeCancelMins)} before scheduled pickup`,
      ),
      row(
        "Charge type after free window",
        String(settings.cancellationChargeType || "percent").toLowerCase() === "fixed"
          ? "Fixed amount (₹)"
          : "Percent of rental fee",
      ),
      row("Cancel charge after free window", cancelChargeLabel(settings)),
      row(
        "Security deposit on cancel",
        "Always returned to your wallet when you cancel before pickup",
      ),
    ].filter(Boolean),
  });

  // 3) No-show — admin No-show tab (full message lives only here)
  const noShowItems = [];
  if (noShowEnabled) {
    noShowItems.push(
      row("Policy", settings.noShowPolicyMessage || defaultNoShowMessage),
      row("Wait time after pickup", minutesLabel(noShowGrace)),
      row("What happens to the security deposit?", noShowDepositLabel(settings)),
    );
    if (String(settings.noShowRefundRule || "").toLowerCase() === "partial") {
      noShowItems.push(
        row(
          "How much is kept?",
          String(settings.noShowRefundMode || "percent").toLowerCase() === "fixed"
            ? formatInr(settings.noShowRefundFixed)
            : `${num(settings.noShowRefundPercent, 0)}% of deposit`,
        ),
      );
    }
    if (num(settings.noShowPenaltyAmount, 0) > 0) {
      noShowItems.push(row("Additional penalty", formatInr(settings.noShowPenaltyAmount)));
    }
  } else {
    noShowItems.push(
      row("Policy status", "Disabled"),
      row("Note", "Automatic no-show handling is currently turned off"),
    );
  }
  sections.push({
    id: "no-show",
    title: "No Show Policy",
    summary: "If you do not collect the bike on time.",
    items: noShowItems.filter(Boolean),
  });

  // 4) Late return — admin Late return tab
  sections.push({
    id: "late-return",
    title: "Late Return & Extra Hour Charges",
    summary: "Fees when the bike comes back after end time.",
    items: [
      row("Extra charge per hour", `${formatInr(lateFee)} per hour (or part of an hour)`),
      row(
        "Free late minutes",
        lateGrace > 0
          ? `First ${minutesLabel(lateGrace)} after return time are free`
          : "0 minutes — late charges may start immediately after return time",
      ),
      row(
        "Maximum late charge",
        lateMax == null || lateMax === ""
          ? "No maximum (charged per extra hour)"
          : formatInr(lateMax),
      ),
    ].filter(Boolean),
  });

  // 5) Deposit — admin Deposit tab
  sections.push({
    id: "deposit",
    title: "Security Deposit & Refund Policy",
    summary: "How deposit is paid and when it returns to wallet.",
    items: [
      row("How you can pay the deposit", depositModeLabel(settings.securityDepositPaymentMode)),
      row(
        "Deposit amount",
        "Set on each bike — confirmed in your fare summary at checkout",
      ),
      row(
        "Auto refund after return",
        refundTiming
          ? `Within ${refundTiming} after return inspection, refundable deposit is credited to your wallet`
          : "After return inspection, refundable deposit is credited to your wallet",
      ),
      row(
        "Deductions",
        "Late return / no-show charges may be deducted from deposit before refund",
      ),
    ].filter(Boolean),
  });

  // 6) Support — admin Support tab
  const supportItems = [
    settings.supportPhone ? row("Support phone", settings.supportPhone) : null,
    settings.supportEmail ? row("Support email", settings.supportEmail) : null,
  ].filter(Boolean);
  if (supportItems.length) {
    sections.push({
      id: "support",
      title: "Customer Support",
      summary: "Contact details from Bike Rent Settings.",
      items: supportItems,
    });
  }

  return sections.filter((section) => section.items?.length);
}
