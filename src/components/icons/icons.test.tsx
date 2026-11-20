import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { unnamedSvgs } from "../../../tests/a11y/markup";
import { ArrowIcon, CheckIcon, ChevronIcon, CopyIcon, DiscordIcon, GithubIcon, GoogleIcon, LinkIcon, MinusIcon, PlusIcon, UserIcon } from ".";

describe("A11Y-03 — icons are decorative: hidden from screen readers", () => {
  test("every icon svg is aria-hidden, its button or link carries the name", () => {
    const html = renderToStaticMarkup(
      <>
        <ArrowIcon />
        <UserIcon />
        <GoogleIcon />
        <GithubIcon />
        <DiscordIcon />
        <PlusIcon />
        <MinusIcon />
        <CopyIcon />
        <LinkIcon />
        <CheckIcon />
        <ChevronIcon direction="up" />
        <ChevronIcon direction="down" />
      </>,
    );
    expect(unnamedSvgs(html)).toEqual([]);
  });
});
