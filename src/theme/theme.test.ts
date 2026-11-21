import { describe, expect, test } from "bun:test";
import { applyTheme, currentTheme, resolveTheme, subscribeTheme, THEME_COOKIE, themeCookie, THEMES } from "./theme";

/** Just what applyTheme touches: the cookie jar and the <html> dataset. */
const fakeDocument = (theme?: string) => ({ cookie: "", documentElement: { dataset: theme ? { theme } : ({} as Record<string, string>) } });

describe("DES-05 — the remembered theme", () => {
  test("two themes: the current one by default, and the colour-adapted one", () => {
    expect(THEMES).toEqual(["default", "cvd"]);
  });

  test("the cookie value is used when it names a theme", () => {
    expect(resolveTheme("cvd")).toBe("cvd");
    expect(resolveTheme("default")).toBe("default");
  });

  test("no cookie, or an unknown or forged value, gives the default theme", () => {
    for (const value of [undefined, null, "", "light", "CVD", "cvd ", "cvd;evil=1", "<script>"]) expect(resolveTheme(value)).toBe("default");
  });

  test("the choice is kept a year on the whole site, readable by the server", () => {
    expect(themeCookie("cvd")).toBe(`${THEME_COOKIE}=cvd; Path=/; Max-Age=31536000; SameSite=Lax`);
  });
});

describe("DES-05 — switching theme in the browser", () => {
  test("applyTheme writes the cookie and the data-theme attribute at once", () => {
    const doc = fakeDocument();
    applyTheme("cvd", doc);
    expect(doc.cookie).toBe(themeCookie("cvd"));
    expect(doc.documentElement.dataset.theme).toBe("cvd");
    applyTheme("default", doc);
    expect(doc.documentElement.dataset.theme).toBe("default");
  });

  test("currentTheme reads the attribute the server rendered, and falls back to the default", () => {
    expect(currentTheme(fakeDocument("cvd"))).toBe("cvd");
    expect(currentTheme(fakeDocument("bogus"))).toBe("default");
    expect(currentTheme(fakeDocument())).toBe("default");
  });

  test("subscribers hear every change until they unsubscribe", () => {
    let heard = 0;
    const stop = subscribeTheme(() => heard++);
    applyTheme("cvd", fakeDocument());
    stop();
    applyTheme("default", fakeDocument());
    expect(heard).toBe(1);
  });
});
