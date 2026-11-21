import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { THEME_COOKIE } from "./theme";

// Le cookie de la requête simulée, lu par next/headers dans le layout.
let cookie: Record<string, string> = {};
mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name in cookie ? { name, value: cookie[name] } : undefined) }),
  headers: async () => new Headers({ "accept-language": "en" }),
}));

const { default: RootLayout } = await import("../../app/layout");

/** The first bytes the browser receives: the <html> tag rendered by the server. */
async function htmlTag(cookies: Record<string, string>) {
  cookie = cookies;
  const markup = renderToStaticMarkup(await RootLayout({ children: null }));
  return markup.match(/^<html[^>]*>/)?.[0] ?? "";
}

describe("DES-05 — no flash of the wrong theme: the server renders the chosen theme", () => {
  test("with the cookie set to cvd, <html> already carries data-theme=cvd", async () => {
    expect(await htmlTag({ [THEME_COOKIE]: "cvd" })).toContain('data-theme="cvd"');
  });

  test("without a cookie, or with a forged one, <html> carries the default theme", async () => {
    expect(await htmlTag({})).toContain('data-theme="default"');
    expect(await htmlTag({ [THEME_COOKIE]: '"><script>alert(1)</script>' })).toContain('data-theme="default"');
  });

  test("the colours hang on that attribute alone, so no script has to run before the first paint", () => {
    const css = readFileSync(new URL("../styles/base/tokens.css", import.meta.url), "utf8");
    expect(css).toContain(':root[data-theme="cvd"]{');
    expect(readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8")).not.toContain("<script");
  });
});
