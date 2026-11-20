import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { unlabelledFields } from "../../../tests/a11y/markup";
import { createI18n } from "../../i18n";
import { TextEditorDialog } from "./TextEditorDialog";

const render = (language: "fr" | "en") =>
  renderToStaticMarkup(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(TextEditorDialog, { text: "", onUse: () => {} })));

describe("A11Y-03 — every field of the custom text dialog has a label", () => {
  test("no field is left without a label", () => {
    expect(unlabelledFields(render("en"))).toEqual([]);
  });

  test("the text name field is labelled in English and in French", () => {
    expect(render("en")).toMatch(/<label[^>]*for="editor-text-name"[^>]*>Text name<\/label>/);
    expect(render("fr")).toMatch(/<label[^>]*for="editor-text-name"[^>]*>Nom du texte<\/label>/);
    expect(render("en")).toMatch(/<input[^>]*id="editor-text-name"/);
  });
});
