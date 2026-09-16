import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/next-path";

describe("safeNextPath", () => {
  it("accepts same-origin paths, with or without a query", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/clients/abc")).toBe("/clients/abc");
    expect(safeNextPath("/account?tab=billing")).toBe("/account?tab=billing");
  });

  it("rejects anything that could leave this origin", () => {
    expect(safeNextPath("https://evil.example/")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\u005Cevil.example")).toBeNull();
    expect(safeNextPath("clients")).toBeNull();
  });

  it("rejects empty, oversized and control-character input", () => {
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath("/a".padEnd(600, "b"))).toBeNull();
    expect(safeNextPath("/a\nLocation: https://evil.example")).toBeNull();
  });
});
