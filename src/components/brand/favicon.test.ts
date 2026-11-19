import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../..");
const iconPath = join(root, "app/icon.svg");
const pointsOf = (source: string) => [...source.matchAll(/<polygon[^>]*?points="([^"]+)"/g)].map((m) => m[1]);

describe("DES-02 — the team logo is the favicon", () => {
  test("app/icon.svg exists, so Next.js serves it as the favicon", () => {
    expect(existsSync(iconPath)).toBe(true);
  });

  test("the favicon reuses the exact shapes of the logo in LogoTitle", () => {
    const logo = pointsOf(readFileSync(join(import.meta.dir, "LogoTitle.tsx"), "utf8"));
    const icon = pointsOf(readFileSync(iconPath, "utf8"));
    expect(logo.length).toBeGreaterThan(0);
    expect(icon).toEqual(logo);
  });

  test("no other favicon overrides the logo (favicon.ico, metadata.icons)", () => {
    expect(existsSync(join(root, "app/favicon.ico"))).toBe(false);
    expect(existsSync(join(root, "public/favicon.ico"))).toBe(false);
    expect(readFileSync(join(root, "app/layout.tsx"), "utf8")).not.toMatch(/icons\s*:/);
  });

  test("the favicon has the same 100x100 view box as the logo", () => {
    expect(readFileSync(iconPath, "utf8")).toContain('viewBox="0 0 100 100"');
  });
});
