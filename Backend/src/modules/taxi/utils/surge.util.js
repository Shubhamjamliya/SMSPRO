import { TaxiSurgeSlot } from '../models/taxiSurgeSlot.model.js';
import { round2 } from './fare.util.js';

const IST = 'Asia/Kolkata';

const WEEKDAY_TO_INDEX = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

export function timeToMinutes(hhmm = '00:00') {
    const [h, m] = String(hhmm).split(':').map((n) => Number(n));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return h * 60 + m;
}

/** Inclusive start, exclusive end. Supports overnight (start > end). */
export function isTimeInWindow(nowMin, startMin, endMin) {
    if (startMin === endMin) return true;
    if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
    return nowMin >= startMin || nowMin < endMin;
}

export function getIstClockParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: IST,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);

    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const dayOfWeek = WEEKDAY_TO_INDEX[map.weekday] ?? 0;
    let hour = Number(map.hour);
    if (hour === 24) hour = 0;
    const minute = Number(map.minute);
    return {
        dayOfWeek,
        minutesOfDay: hour * 60 + minute,
        timeLabel: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
}

export function slotMatchesAt(slot, { dayOfWeek, minutesOfDay }) {
    if (!slot) return false;
    if (slot.isActive === false) return false;
    const days = Array.isArray(slot.daysOfWeek) ? slot.daysOfWeek : [];
    if (!days.map(Number).includes(Number(dayOfWeek))) return false;
    return isTimeInWindow(
        minutesOfDay,
        timeToMinutes(slot.startTime),
        timeToMinutes(slot.endTime),
    );
}

/**
 * Among matching slots pick highest priority, then higher amount, then newest updatedAt.
 */
export function pickWinningSurgeSlot(slots = [], at = new Date()) {
    const clock = getIstClockParts(at);
    const matches = slots.filter((s) => slotMatchesAt(s, clock));
    if (!matches.length) return null;

    matches.sort((a, b) => {
        const p = Number(b.priority || 0) - Number(a.priority || 0);
        if (p !== 0) return p;
        const amt = Number(b.amount || 0) - Number(a.amount || 0);
        if (amt !== 0) return amt;
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });

    return matches[0];
}

/**
 * Fail-open: returns null on error / no match.
 */
export async function resolveActiveSurgeSlot(at = new Date()) {
    try {
        const slots = await TaxiSurgeSlot.find({
            isDeleted: { $ne: true },
            isActive: true,
        }).lean();
        return pickWinningSurgeSlot(slots, at);
    } catch {
        return null;
    }
}

/**
 * Add flat time-slot surge onto an existing computeFare() result.
 * Does not change subtotal; adds to total.
 */
export function applyTimeSlotSurge(fare, surge = null) {
    const amount = round2(Math.max(0, Number(surge?.amount ?? 0)));
    const baseTotal = round2(Number(fare?.total || 0));
    const id = surge?._id || surge?.id || null;

    return {
        ...fare,
        timeSlotSurge: amount,
        surgeSlotId: id ? String(id) : null,
        surgeSlotName: surge?.name ? String(surge.name) : null,
        total: round2(baseTotal + amount),
    };
}

/**
 * Re-apply a previously locked surge snapshot (quote/book) after recompute.
 */
export function applyLockedTimeSlotSurge(fare, locked = {}) {
    return applyTimeSlotSurge(fare, {
        amount: locked.timeSlotSurge ?? locked.amount ?? 0,
        _id: locked.surgeSlotId || null,
        name: locked.surgeSlotName || null,
    });
}
