import { requestLanguage } from "../src/i18n/request";
import { notFoundText } from "../src/i18n/server";

// I18N-01 : la 404 suit la langue choisie (cookie), sinon celle du navigateur.
export default async function NotFound() {
  const text = notFoundText(await requestLanguage());
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", textAlign: "center", color: "#fff", background: "#000", fontFamily: "monospace" }}>
      <div>
        <h1>{text.title}</h1>
        <p>{text.text}</p>
        <p><a href="/home" style={{ color: "inherit" }}>{text.home}</a></p>
      </div>
    </main>
  );
}
