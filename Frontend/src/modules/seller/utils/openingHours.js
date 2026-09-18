import {
  formatTimeAMPM,
  parseOpeningHoursRange,
  parseTimeToMinutes,
} from "@shared/utils/timeFormat";

const minutesToTime24 = (totalMinutes) => {
  const mins = Number(totalMinutes);
  if (!Number.isFinite(mins) || mins < 0) return "";
  const hours = Math.floor(mins / 60) % 24;
  const minutes = mins % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

/** Parse DB/UI opening-hours labels into 24h select values. Supports AM/PM. */
export const parseOpeningHours = (value) => {
  const range = parseOpeningHoursRange(value);
  if (range) {
    return {
      openingTime: minutesToTime24(range.openMinutes),
      closingTime: minutesToTime24(range.closeMinutes),
    };
  }

  const raw = String(value || "").trim();
  if (!raw) return { openingTime: "", closingTime: "" };

  const match = raw.match(
    /(\d{1,2}:\d{2})(?::\d{2})?\s*(?:AM|PM)?\s*(?:-|to|–|—)\s*(\d{1,2}:\d{2})(?::\d{2})?\s*(?:AM|PM)?/i,
  );
  if (!match) return { openingTime: "", closingTime: "" };

  const openMinutes = parseTimeToMinutes(match[1]);
  const closeMinutes = parseTimeToMinutes(match[2]);
  if (openMinutes == null || closeMinutes == null) {
    return {
      openingTime: match[1].padStart(5, "0"),
      closingTime: match[2].padStart(5, "0"),
    };
  }

  return {
    openingTime: minutesToTime24(openMinutes),
    closingTime: minutesToTime24(closeMinutes),
  };
};

export const buildOpeningHoursLabel = (openingTime, closingTime) => {
  if (!openingTime || !closingTime) return "";
  return `${formatTimeAMPM(openingTime)} - ${formatTimeAMPM(closingTime)}`;
};

export const normalizeTimeValue = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

export const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  const minutes = index % 2 === 0 ? "00" : "30";
  const value = `${hours}:${minutes}`;
  return { value, label: formatTimeAMPM(value) };
});
