import { fullMoney } from "./format";

/**
 * BRD §13 — Escrow Financial Summary Bar.
 * held, released and pending amounts add up to the agreed project price.
 */
export default function MoneyBar({ money, side = "customer" }) {
  const agreed = Number(money?.agreedValue) || 0;
  const released = Number(money?.releasedAmount) || 0;
  const refunded = Number(money?.refundedAmount) || 0;
  const funded = Number(money?.fundedAmount) || 0;
  const held = Math.max(0, funded - released - refunded);
  const pending = Math.max(0, agreed - funded);
  const retention = Number(money?.retentionHeld) || 0;

  const pct = (n) => (agreed > 0 ? (n / agreed) * 100 : 0);

  const segments = [
    { key: "released", value: released, className: "bg-emerald-500" },
    { key: "held", value: held, className: "bg-amber-500" },
    { key: "pending", value: pending, className: "bg-slate-200" },
  ].filter((s) => s.value > 0.005);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Agreed Project Total</span>
        <span className="text-xl font-black tracking-tight tabular-nums text-slate-900">{fullMoney(agreed)}</span>
      </div>

      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 p-0.5 ring-1 ring-slate-200/60">
        {segments.map((s) => (
          <div key={s.key} className={`h-full rounded-full transition-all duration-500 ${s.className}`} style={{ width: `${pct(s.value)}%` }} />
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Figure
          dot="bg-emerald-500"
          label={side === "customer" ? "Paid to contractor" : "Paid to you"}
          value={released}
        />
        <Figure
          dot="bg-amber-500"
          label={side === "customer" ? "Safely held in Escrow" : "Held in Escrow"}
          value={held}
        />
        {pending > 0.005 && (
          <Figure dot="bg-slate-300" label="Still to fund" value={pending} />
        )}
        {refunded > 0.005 && (
          <Figure dot="bg-rose-500" label="Returned to customer" value={refunded} />
        )}
      </dl>

      {retention > 0.005 && (
        <p className="rounded-lg bg-amber-50/80 p-2.5 text-xs leading-relaxed text-amber-900 border border-amber-200/60 font-medium">
          <strong className="font-extrabold text-amber-950">{fullMoney(retention)}</strong> is retained until defect liability expiry
          {money?.retentionDueAt ? ` on ${new Date(money.retentionDueAt).toLocaleDateString("en-IN")}` : ""}
          , then automatically released.
        </p>
      )}

      {side === "customer" && held > 0.005 && (
        <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
          Escrow Protection: Money deposited is held by SMS Pro and released to the contractor only upon your explicit approval of each completed stage.
        </p>
      )}
    </div>
  );
}

function Figure({ dot, label, value }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-black tabular-nums text-slate-900">{fullMoney(value)}</dd>
    </div>
  );
}
