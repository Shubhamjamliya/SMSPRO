import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Bell, BellOff, CalendarClock, CheckCheck, FileText, HardHat, Inbox, ShieldAlert, Trash2, Wallet, X,
} from "lucide-react";
import contractorApi from "../services/contractorApi";
import { CONSTRUCTION_FONT } from "../../shared/fonts";

const SOURCE_ICON = {
  NEW_LEAD: { icon: Inbox, tone: "bg-blue-100 text-blue-600" },
  QUOTATION_RECEIVED: { icon: FileText, tone: "bg-violet-100 text-violet-600" },
  PAYMENT_RELEASED: { icon: Wallet, tone: "bg-emerald-100 text-emerald-600" },
  STAGE_SUBMITTED: { icon: HardHat, tone: "bg-amber-100 text-amber-600" },
  STAGE_APPROVED: { icon: HardHat, tone: "bg-emerald-100 text-emerald-600" },
  STAGE_DELAYED: { icon: HardHat, tone: "bg-red-100 text-red-600" },
  PROJECT_STATUS: { icon: HardHat, tone: "bg-slate-200 text-slate-600" },
  SITE_VISIT_REMINDER: { icon: CalendarClock, tone: "bg-teal-100 text-teal-600" },
  DOCUMENT_EXPIRY: { icon: ShieldAlert, tone: "bg-red-100 text-red-600" },
};

/** "just now", "5m", "3h", "2d", then a date — short enough for a narrow row. */
const ago = (value) => {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/**
 * The bell in the contractor header: an unread badge, and a panel with recent notifications.
 *
 * The count is refreshed quietly on a timer and whenever the app regains focus, because a push
 * arriving while the app is open should show up without the contractor reloading. Opening the
 * panel refreshes the list and, since seeing everything in it counts as "read", also clears the
 * badge right away rather than waiting for each row to be tapped. Tapping a row still marks it
 * read individually (needed for correctness the instant it happens) and goes to the screen it is
 * about. "Clear all" removes every row for good, not just marks them read.
 * A failed load never blocks the header — the bell simply shows no badge.
 */
export default function ContractorNotifications() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async ({ quiet = true } = {}) => {
    if (!quiet) setLoading(true);
    try {
      setInbox(await contractorApi.getNotifications());
    } catch {
      if (!quiet) toast.error("Could not load your notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = setInterval(tick, 45000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  // While the panel is open the page behind must not scroll, and Escape closes it.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const unread = inbox?.unread || 0;

  const openPanel = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const fresh = await contractorApi.getNotifications();
      setInbox(fresh);
      // Opening the panel means seeing everything in it — clear the badge now
      // instead of making the contractor tap through each row individually.
      if (fresh?.unread > 0) {
        setInbox(await contractorApi.markNotificationsRead());
      }
    } catch {
      toast.error("Could not load your notifications");
    } finally {
      setLoading(false);
    }
  };

  const openNotification = (n) => {
    setOpen(false);
    if (!n.isRead) {
      // Optimistic: the badge drops at once, and the server's answer replaces it.
      setInbox((cur) => cur && ({
        unread: Math.max(0, cur.unread - 1),
        notifications: cur.notifications.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
      }));
      contractorApi.markNotificationsRead(n.id).then(setInbox).catch(() => {});
    }
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    setInbox((cur) => cur && ({ unread: 0, notifications: cur.notifications.map((x) => ({ ...x, isRead: true })) }));
    try {
      setInbox(await contractorApi.markNotificationsRead());
    } catch {
      toast.error("Could not mark them as read");
      refresh();
    }
  };

  const clearAll = async () => {
    setInbox((cur) => cur && ({ unread: 0, notifications: [] }));
    try {
      setInbox(await contractorApi.clearNotifications());
    } catch {
      toast.error("Could not clear notifications");
      refresh();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="relative rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 active:scale-95"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <Bell className="h-[22px] w-[22px]" />
        {unread > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {/* Rendered on <body>: the header's backdrop blur would otherwise trap a fixed panel inside it. */}
      {open ? createPortal(
        <div
          className="fixed inset-0 z-50"
          style={{ fontFamily: CONSTRUCTION_FONT }}
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
        >
          <button
            type="button"
            aria-label="Close notifications"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 top-0 mx-auto flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-b-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5">
              <div>
                <h2 className="text-[16px] font-extrabold tracking-tight text-slate-900">Notifications</h2>
                <p className="text-xs text-slate-500">{unread ? `${unread} unread` : "You are all caught up"}</p>
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 ? (
                  <button
                    type="button"
                    onClick={markAll}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-orange-600 hover:bg-orange-50"
                  >
                    <CheckCheck className="h-4 w-4" /> Mark all read
                  </button>
                ) : null}
                {inbox?.notifications?.length ? (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" /> Clear all
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {loading && !inbox ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
                  ))}
                </div>
              ) : !inbox?.notifications?.length ? (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <BellOff className="h-6 w-6" />
                  </span>
                  <p className="mt-3 text-[15px] font-bold text-slate-900">No notifications yet</p>
                  <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-slate-500">
                    New enquiries, paid site visits, quotation replies and payments will show up here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {inbox.notifications.map((n) => {
                    const meta = SOURCE_ICON[n.source] || { icon: Bell, tone: "bg-slate-100 text-slate-500" };
                    const Icon = meta.icon;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openNotification(n)}
                          className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 ${n.isRead ? "" : "bg-orange-50/50"}`}
                        >
                          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}>
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className={`text-[13.5px] leading-snug ${n.isRead ? "font-semibold text-slate-700" : "font-bold text-slate-900"}`}>
                                {n.title}
                              </span>
                              <span className="shrink-0 text-[11px] font-medium text-slate-400">{ago(n.createdAt)}</span>
                            </span>
                            <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-relaxed text-slate-500">{n.message}</span>
                          </span>
                          {!n.isRead ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-500" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
