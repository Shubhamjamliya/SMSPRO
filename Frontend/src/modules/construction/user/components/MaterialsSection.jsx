import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Layers,
  Minus,
  Plus,
  ShoppingBasket,
  X,
} from "lucide-react";
import constructionApi from "../services/api";
import { fullMoney } from "../../shared/format";

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

/** Why a basket line can't be sent yet, or null if it can. */
const qtyProblem = (material, qty) => {
  if (!(qty > 0)) return "Enter a quantity";
  if (qty < (material.minOrderQty || 0)) return `Minimum ${material.minOrderQty}`;
  return null;
};

/**
 * Stepping by 1 is fine for bags and tiles but hopeless for "minimum 100 kg" of
 * steel, so the step is a tenth of the minimum (at least 1). The number box in
 * the middle still takes any exact figure.
 */
const stepFor = (material) => Math.max(1, Math.floor((material.minOrderQty || 1) / 10));

/**
 * The Material Services section: browse materials with their list price, build a
 * basket, and send it to the office as a quote request. Nothing is ordered or
 * paid here — the office calls back to agree the final price and delivery.
 */
export default function MaterialsSection({ query = "", defaultCity = "" }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [category, setCategory] = useState("All");
  // { [materialId]: what is typed in the quantity box }. Kept as text so "0." and "0.5" can be typed.
  const [basket, setBasket] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sentRef, setSentRef] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", city: defaultCity, address: "", notes: "" });

  const load = () => {
    setLoading(true);
    setLoadError(false);
    constructionApi
      .getMaterials()
      .then((rows) => setMaterials(rows || []))
      .catch((error) => {
        setLoadError(true);
        toast.error(error?.response?.data?.message || "Could not load materials");
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // A city picked from the location selector after this mounted still fills an empty field.
  useEffect(() => {
    if (defaultCity) setForm((f) => (f.city ? f : { ...f, city: defaultCity }));
  }, [defaultCity]);

  const categories = useMemo(
    () => ["All", ...new Set(materials.map((m) => m.category).filter(Boolean))],
    [materials],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter((m) => {
      if (category !== "All" && m.category !== category) return false;
      if (!q) return true;
      return [m.name, m.brand, m.category, m.description].some((v) => v?.toLowerCase().includes(q));
    });
  }, [materials, category, query]);

  const byId = useMemo(() => new Map(materials.map((m) => [m._id, m])), [materials]);
  const basketLines = Object.entries(basket)
    .map(([id, raw]) => ({ material: byId.get(id), qty: Number(raw) }))
    .filter((line) => line.material);
  const estimatedTotal = basketLines.reduce(
    (sum, { material, qty }) => sum + (qty > 0 ? material.price * qty : 0),
    0,
  );

  const setQty = (material, raw) => setBasket((b) => ({ ...b, [material._id]: String(raw) }));
  const removeFromBasket = (id) =>
    setBasket((b) => {
      const { [id]: _removed, ...rest } = b;
      return rest;
    });

  const step = (material, direction) => {
    const current = Number(basket[material._id]) || 0;
    const next = current + direction * stepFor(material);
    if (next <= 0) removeFromBasket(material._id);
    else setQty(material, next);
  };

  const openRequest = () => {
    const problem = basketLines
      .map(({ material, qty }) => ({ material, problem: qtyProblem(material, qty) }))
      .find((line) => line.problem);
    if (problem) {
      toast.error(`${problem.material.name}: ${problem.problem}`);
      return;
    }
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.city.trim()) {
      toast.error("Please fill in your name, phone number and city.");
      return;
    }
    setSubmitting(true);
    try {
      const request = await constructionApi.createMaterialRequest({
        contact: { name: form.name.trim(), phone: form.phone.trim() },
        delivery: { city: form.city.trim(), address: form.address.trim() },
        notes: form.notes.trim(),
        items: basketLines.map(({ material, qty }) => ({ materialId: material._id, quantity: qty })),
      });
      setSentRef(`#${String(request._id).slice(-6).toUpperCase()}`);
      setBasket({});
      setModalOpen(false);
      setForm((f) => ({ ...f, address: "", notes: "" }));
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not send your request. Please try again.");
      // The catalogue may have changed under them (item removed, out of stock) — refresh it.
      load();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-3xl bg-slate-200/70" />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs">
        <p className="text-sm font-bold text-slate-800">We couldn't load the materials</p>
        <button
          type="button"
          onClick={load}
          className="mt-4 rounded-2xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white hover:bg-slate-800"
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          Material Services
        </h3>
        <p className="text-xs text-slate-500 font-medium">
          Add what you need and send a quote request — we'll confirm the final price and delivery.
        </p>
      </div>

      {sentRef && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-emerald-900">Request {sentRef} sent</p>
            <p className="text-xs font-medium text-emerald-800">
              Our team will call you shortly to confirm the price and delivery.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSentRef(null)}
            className="rounded-full p-1 text-emerald-700 hover:bg-emerald-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {materials.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 sm:p-10 text-center shadow-xs">
          <Layers className="mx-auto h-10 w-10 text-slate-300" />
          <h4 className="mt-3 text-lg font-black text-slate-900">No materials listed yet</h4>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            We are adding cement, steel, tiles and more. Please check back soon.
          </p>
        </div>
      ) : (
        <>
          {categories.length > 2 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {categories.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setCategory(name)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition-colors ${
                    category === name
                      ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {visible.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs">
              <p className="text-sm font-bold text-slate-800">No materials match</p>
              <p className="mt-1 text-xs text-slate-500">Try another category or clear the search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((material) => {
                const inStock = material.inStock !== false;
                const raw = basket[material._id];
                const inBasket = raw !== undefined;
                const qty = Number(raw);
                const problem = inBasket ? qtyProblem(material, qty) : null;
                const specs = (material.specifications || []).slice(0, 3);
                return (
                  <div
                    key={material._id}
                    className={`flex flex-col overflow-hidden rounded-3xl border bg-white shadow-sm transition-all ${
                      inBasket ? "border-blue-400 ring-2 ring-blue-400/20" : "border-slate-200"
                    }`}
                  >
                    {material.image ? (
                      <img
                        src={material.image}
                        alt=""
                        loading="lazy"
                        className={`h-36 w-full object-cover ${inStock ? "" : "opacity-60 grayscale"}`}
                      />
                    ) : (
                      <div className="flex h-24 items-center justify-center bg-gradient-to-b from-blue-50 to-white text-blue-400">
                        <Layers className="h-8 w-8" />
                      </div>
                    )}

                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[10.5px] font-extrabold uppercase tracking-wider text-blue-700">
                          {[material.brand, material.category].filter(Boolean).join(" · ")}
                        </span>
                        {!inStock && (
                          <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-extrabold uppercase text-red-700">
                            Out of stock
                          </span>
                        )}
                      </div>
                      <h4 className="text-base font-black text-slate-900">{material.name}</h4>
                      {material.description ? (
                        <p className="line-clamp-2 text-xs font-medium leading-relaxed text-slate-500">
                          {material.description}
                        </p>
                      ) : null}
                      {specs.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {specs.map((spec) => (
                            <span
                              key={spec}
                              className="rounded-md bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600"
                            >
                              {spec}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-auto space-y-3 border-t border-slate-100 pt-3">
                        <div>
                          <span className="text-xl font-black text-slate-900">{fullMoney(material.price)}</span>
                          <span className="ml-1 text-xs font-bold text-slate-500">{material.unit}</span>
                          {material.minOrderQty > 1 && (
                            <span className="block text-[11px] font-medium text-slate-500">
                              Minimum {material.minOrderQty}
                            </span>
                          )}
                        </div>

                        {!inStock ? (
                          <button
                            type="button"
                            disabled
                            className="w-full cursor-not-allowed rounded-xl bg-slate-100 py-2.5 text-xs font-extrabold text-slate-400"
                          >
                            Unavailable
                          </button>
                        ) : !inBasket ? (
                          <button
                            type="button"
                            onClick={() => setQty(material, Math.max(material.minOrderQty || 1, 1))}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-blue-500 active:scale-95"
                          >
                            <Plus className="h-4 w-4" />
                            Add to request
                          </button>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => step(material, -1)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={raw}
                                onChange={(e) => setQty(material, e.target.value)}
                                className={`h-9 min-w-0 flex-1 rounded-xl border px-2 text-center text-sm font-black outline-none focus:ring-2 ${
                                  problem
                                    ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-500/20"
                                }`}
                                aria-label={`Quantity of ${material.name}`}
                              />
                              <button
                                type="button"
                                onClick={() => step(material, 1)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100"
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFromBasket(material._id)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600"
                                aria-label="Remove from request"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            {problem ? (
                              <p className="text-[11px] font-bold text-red-600">{problem}</p>
                            ) : (
                              <p className="text-[11px] font-bold text-slate-500">
                                ≈ {fullMoney(material.price * qty)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {basketLines.length > 0 && (
        <div className="sticky bottom-24 z-30">
          <button
            type="button"
            onClick={openRequest}
            className="flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3.5 text-left text-white shadow-xl shadow-slate-900/25 transition-all hover:bg-slate-800 active:scale-[0.99]"
          >
            <span className="flex items-center gap-2.5">
              <ShoppingBasket className="h-5 w-5 text-blue-300" />
              <span>
                <span className="block text-xs font-extrabold">
                  {basketLines.length} material{basketLines.length === 1 ? "" : "s"} selected
                </span>
                <span className="block text-[11px] font-medium text-slate-300">
                  ≈ {fullMoney(estimatedTotal)} at list price
                </span>
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-xs font-black">
              Request quote
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-md sm:p-4">
          <form
            onSubmit={submit}
            className="relative my-auto w-full max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black">Request a quote</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  Nothing is charged now. We'll call to confirm the price and delivery.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
              {basketLines.map(({ material, qty }) => (
                <div key={material._id} className="flex items-start justify-between gap-3 text-xs">
                  <span className="min-w-0 font-bold text-slate-800">
                    {material.name}
                    <span className="block font-medium text-slate-500">
                      {qty} × {fullMoney(material.price)} {material.unit}
                    </span>
                  </span>
                  <span className="shrink-0 font-black tabular-nums">{fullMoney(material.price * qty)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-xs font-black">
                <span>Estimated total</span>
                <span className="tabular-nums">{fullMoney(estimatedTotal)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Your full name *"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
                required
              />
              <input
                type="tel"
                placeholder="Mobile number *"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={inputClass}
                required
              />
              <input
                type="text"
                placeholder="Delivery city *"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className={`${inputClass} sm:col-span-2`}
                required
              />
              <input
                type="text"
                placeholder="Delivery address / site (optional)"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className={`${inputClass} sm:col-span-2`}
              />
            </div>
            <textarea
              rows={2}
              placeholder="Anything else we should know (optional)"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={`${inputClass} resize-none`}
            />

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-black text-white shadow-md transition-all hover:bg-blue-500 active:scale-95 disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send request"}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
