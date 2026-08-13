import { describe, expect, it } from "vitest";

import { formatCurrency, formatDate, relativeDays } from "@/lib/format";

describe("formatDate", () => {
  it("renders a UTC-midnight date as that same calendar day", () => {
    // Formatting a UTC-midnight instant in local time shows the PREVIOUS day
    // for anyone west of UTC — the day-marker trap. Pinning to UTC avoids it.
    expect(formatDate("2026-11-01T00:00:00.000Z")).toBe("Nov 1, 2026");
  });

  it("returns a dash for missing or unparseable values", () => {
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("formatCurrency", () => {
  it("formats whole dollars", () => {
    expect(formatCurrency(240000)).toBe("$240,000");
  });

  it("returns a dash rather than $0 for a missing value", () => {
    // A missing ARR and a genuine zero mean different things.
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCurrency(0)).toBe("$0");
  });
});

describe("relativeDays", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  it("describes future and past", () => {
    expect(relativeDays("2026-08-20T12:00:00.000Z", now)).toBe("in 7 days");
    expect(relativeDays("2026-08-12T12:00:00.000Z", now)).toBe("1 day ago");
    expect(relativeDays("2026-08-13T12:00:00.000Z", now)).toBe("today");
  });
});
