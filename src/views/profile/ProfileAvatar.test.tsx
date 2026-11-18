import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileAvatar } from "./ProfileAvatar";

const render = (name: string, src?: string | null) => renderToStaticMarkup(<ProfileAvatar name={name} src={src} />);

describe("AUTH-03 — ProfileAvatar without a photo", () => {
  test("draws a different avatar for two names", () => {
    expect(render("Corail_418")).not.toBe(render("Banc_07"));
  });

  test("draws the same avatar each time for one name", () => {
    expect(render("Corail_418")).toBe(render("Corail_418"));
  });

  test("draws the initial in an svg, not hidden behind a shared image", () => {
    const html = render("Corail_418");
    expect(html).toContain("<svg");
    expect(html).toContain(">C</text>");
    expect(html).not.toContain("avatar-default");
  });

  test("shows the photo when there is one", () => {
    const html = render("Corail_418", "/photo.webp");
    expect(html).toContain('src="/photo.webp"');
    expect(html).not.toContain("<svg");
  });
});
