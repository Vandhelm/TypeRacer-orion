import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { unnamedSvgs } from "../../../tests/a11y/markup";
import { GeneratedAvatar, ProfileAvatar } from "./ProfileAvatar";

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

describe("A11Y-03 — the generated avatar is hidden next to the name, named when alone", () => {
  test("next to the name, the avatar is hidden and its svg too, even used on its own (race track)", () => {
    expect(render("Corail_418")).toContain('aria-hidden="true"');
    expect(unnamedSvgs(renderToStaticMarkup(<GeneratedAvatar name="Corail_418" />))).toEqual([]);
  });

  test("alone, the generated avatar is an image named after the player", () => {
    const html = renderToStaticMarkup(<GeneratedAvatar name="Corail_418" label="Corail_418" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Corail_418"');
    expect(html).not.toContain('aria-hidden="true"');
  });

  test("alone with a photo, the photo has the name as its alternative", () => {
    const html = renderToStaticMarkup(<ProfileAvatar name="Corail_418" src="/photo.webp" label="Corail_418" />);
    expect(html).toContain('alt="Corail_418"');
    expect(html).not.toContain('aria-hidden="true"');
  });

  test("alone without a photo, the avatar is named once, by its svg", () => {
    const html = renderToStaticMarkup(<ProfileAvatar name="Corail_418" label="Corail_418" />);
    expect(html).not.toContain('aria-hidden="true"');
    expect(html.match(/aria-label="Corail_418"/g)?.length).toBe(1);
    expect(unnamedSvgs(html)).toEqual([]);
  });
});
