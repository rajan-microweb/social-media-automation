// Public holidays data for multiple years
// These are US Federal Holidays - can be extended for other countries

export interface Holiday {
  name: string;
  date: string; // MM-DD format
  type: 'federal' | 'observance';
}

// Fixed-date holidays (MM-DD format)
const fixedHolidays: Holiday[] = [
  { name: "New Year's Day", date: "01-01", type: "federal" },
  { name: "Valentine's Day", date: "02-14", type: "observance" },
  { name: "St. Patrick's Day", date: "03-17", type: "observance" },
  { name: "Independence Day", date: "07-04", type: "federal" },
  { name: "Halloween", date: "10-31", type: "observance" },
  { name: "Veterans Day", date: "11-11", type: "federal" },
  { name: "Christmas Eve", date: "12-24", type: "observance" },
  { name: "Christmas Day", date: "12-25", type: "federal" },
  { name: "New Year's Eve", date: "12-31", type: "observance" },
];

// Calculate nth weekday of a month
function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  let dayOffset = weekday - firstWeekday;
  if (dayOffset < 0) dayOffset += 7;
  const day = 1 + dayOffset + (n - 1) * 7;
  return new Date(year, month, day);
}

// Calculate last weekday of a month
function getLastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const lastWeekday = lastDay.getDay();
  let dayOffset = lastWeekday - weekday;
  if (dayOffset < 0) dayOffset += 7;
  return new Date(year, month, lastDay.getDate() - dayOffset);
}

// Calculate Easter Sunday (Computus algorithm)
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

// Get all holidays for a specific year
export function getHolidaysForYear(year: number): { date: Date; name: string; type: 'federal' | 'observance' }[] {
  const holidays: { date: Date; name: string; type: 'federal' | 'observance' }[] = [];

  // Add fixed holidays
  fixedHolidays.forEach((h) => {
    const [month, day] = h.date.split("-").map(Number);
    holidays.push({
      date: new Date(year, month - 1, day),
      name: h.name,
      type: h.type,
    });
  });

  // Martin Luther King Jr. Day - 3rd Monday of January
  holidays.push({
    date: getNthWeekdayOfMonth(year, 0, 1, 3),
    name: "Martin Luther King Jr. Day",
    type: "federal",
  });

  // Presidents' Day - 3rd Monday of February
  holidays.push({
    date: getNthWeekdayOfMonth(year, 1, 1, 3),
    name: "Presidents' Day",
    type: "federal",
  });

  // Easter Sunday
  const easter = getEasterSunday(year);
  holidays.push({
    date: easter,
    name: "Easter Sunday",
    type: "observance",
  });

  // Good Friday - 2 days before Easter
  holidays.push({
    date: new Date(easter.getTime() - 2 * 24 * 60 * 60 * 1000),
    name: "Good Friday",
    type: "observance",
  });

  // Mother's Day - 2nd Sunday of May
  holidays.push({
    date: getNthWeekdayOfMonth(year, 4, 0, 2),
    name: "Mother's Day",
    type: "observance",
  });

  // Memorial Day - Last Monday of May
  holidays.push({
    date: getLastWeekdayOfMonth(year, 4, 1),
    name: "Memorial Day",
    type: "federal",
  });

  // Father's Day - 3rd Sunday of June
  holidays.push({
    date: getNthWeekdayOfMonth(year, 5, 0, 3),
    name: "Father's Day",
    type: "observance",
  });

  // Labor Day - 1st Monday of September
  holidays.push({
    date: getNthWeekdayOfMonth(year, 8, 1, 1),
    name: "Labor Day",
    type: "federal",
  });

  // Columbus Day - 2nd Monday of October
  holidays.push({
    date: getNthWeekdayOfMonth(year, 9, 1, 2),
    name: "Columbus Day",
    type: "federal",
  });

  // Thanksgiving - 4th Thursday of November
  holidays.push({
    date: getNthWeekdayOfMonth(year, 10, 4, 4),
    name: "Thanksgiving",
    type: "federal",
  });

  // Black Friday - Day after Thanksgiving
  const thanksgiving = getNthWeekdayOfMonth(year, 10, 4, 4);
  holidays.push({
    date: new Date(thanksgiving.getTime() + 24 * 60 * 60 * 1000),
    name: "Black Friday",
    type: "observance",
  });

  return holidays.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Check if a specific date is a holiday
export function getHolidayForDate(date: Date): { name: string; type: 'federal' | 'observance' } | null {
  const year = date.getFullYear();
  const holidays = getHolidaysForYear(year);
  
  const holiday = holidays.find(
    (h) =>
      h.date.getFullYear() === date.getFullYear() &&
      h.date.getMonth() === date.getMonth() &&
      h.date.getDate() === date.getDate()
  );

  return holiday ? { name: holiday.name, type: holiday.type } : null;
}
