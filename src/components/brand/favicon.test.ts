import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../..");

describe("DES-02 — the team logo is the favicon and the brand mark", () => {
  test("app/icon.png and app/apple-icon.png exist, so Next.js serves them as icons", () => {
    expect(existsSync(join(root, "app/icon.png"))).toBe(true);
    expect(existsSync(join(root, "app/apple-icon.png"))).toBe(true);
  });

  test("the logo image used in the app exists", () => {
    expect(existsSync(join(root, "public/logo.png"))).toBe(true);
  });

  test("LogoTitle and the navbar show the logo image", () => {
    expect(readFileSync(join(import.meta.dir, "LogoTitle.tsx"), "utf8")).toContain('src="/logo.png"');
    expect(readFileSync(join(root, "src/components/navigation/Navbar.tsx"), "utf8")).toContain('src="/logo.png"');
  });

  test("no other favicon overrides the logo (icon.svg, favicon.ico, metadata.icons)", () => {
    expect(existsSync(join(root, "app/icon.svg"))).toBe(false);
    expect(existsSync(join(root, "app/favicon.ico"))).toBe(false);
    expect(existsSync(join(root, "public/favicon.ico"))).toBe(false);
    expect(readFileSync(join(root, "app/layout.tsx"), "utf8")).not.toMatch(/icons\s*:/);
  });
});
