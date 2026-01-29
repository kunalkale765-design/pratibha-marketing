/**
 * Centralized IST (Indian Standard Time) date/time utilities.
 * IST is UTC+5:30. All business logic uses IST for day boundaries.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Convert a date to IST timezone components.
 * @param {Date} date - Date to convert (defaults to now)
 * @returns {{ hour: number, minutes: number, date: Date, dateOnly: Date }}
 *   - hour/minutes: IST time components
 *   - date: Full IST date object
 *   - dateOnly: Midnight IST as a UTC timestamp (for DB queries)
 */
function getISTTime(date = new Date()) {
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
  const istTime = new Date(utcTime + IST_OFFSET_MS);

  // Calculate midnight IST as a UTC timestamp for consistent DB comparisons
  const midnightIST = new Date(Date.UTC(
    istTime.getFullYear(),
    istTime.getMonth(),
    istTime.getDate(),
    0, 0, 0, 0
  ) - IST_OFFSET_MS);

  return {
    hour: istTime.getHours(),
    minutes: istTime.getMinutes(),
    date: istTime,
    dateOnly: midnightIST
  };
}

/**
 * Get the next day's date at midnight IST.
 * @param {Date} istDateOnly - Current date at midnight IST (UTC timestamp)
 * @returns {Date} Next day at midnight IST
 */
function getNextDay(istDateOnly) {
  // Add exactly 24 hours — avoids local-timezone pitfalls with setDate/getDate
  return new Date(istDateOnly.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Get IST date components from a UTC date (for display formatting).
 * @param {Date} date - UTC date
 * @returns {{ day: string, month: string, year: number, fullDate: Date }}
 */
function getISTDateComponents(date) {
  const d = new Date(date);
  const istDate = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    day: istDate.getUTCDate().toString().padStart(2, '0'),
    month: (istDate.getUTCMonth() + 1).toString().padStart(2, '0'),
    year: istDate.getUTCFullYear(),
    fullDate: istDate
  };
}

/**
 * Format a date as DD/MM/YYYY in IST.
 * @param {Date} date - Date to format
 * @param {string} context - Context for error messages
 * @returns {string} Formatted date string
 * @throws {Error} If date is null or invalid
 */
function formatDateIST(date, context = 'unknown') {
  if (!date) {
    throw new Error(`Cannot format date: missing date (context: ${context})`);
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error(`Cannot format date: invalid date "${date}" (context: ${context})`);
  }
  const { day, month, year } = getISTDateComponents(d);
  return `${day}/${month}/${year}`;
}

/**
 * Get IST year and month prefix for sequential numbering (e.g., "2601" for Jan 2026).
 * @param {Date} [date] - Date to use (defaults to now)
 * @returns {{ year: string, month: string, prefix: string }}
 */
function getISTYearMonthPrefix(date = new Date()) {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  const year = istDate.getUTCFullYear().toString().slice(-2);
  const month = (istDate.getUTCMonth() + 1).toString().padStart(2, '0');
  return { year, month, prefix: `${year}${month}` };
}

module.exports = {
  IST_OFFSET_MS,
  IST_TIMEZONE,
  getISTTime,
  getNextDay,
  getISTDateComponents,
  formatDateIST,
  getISTYearMonthPrefix
};
