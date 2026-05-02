import { createRoot } from "react-dom/client";
import {
  InlineWordHelpScreen,
  OptionsGeneralScreen,
  OptionsTranslationScreen,
  PhraseHelpScreen,
  RecoverabilityScreen,
  SentenceHelpScreen,
  SupportedArticleScreen,
  SupportedSitePopupScreen,
  UnsupportedPagePopupScreen,
  publicPreviewScreens
} from "../index";
import "../styles.css";
import "./preview.css";

const referenceScreens = [
  ["popup-supported-site", "01-popup-supported-site.png"],
  ["popup-unsupported-page", "02-popup-unsupported-page.png"],
  ["supported-page", "03-supported-page.png"],
  ["inline-word-help", "04-inline-word-help.png"],
  ["phrase-help", "05-phrase-help.png"],
  ["sentence-help", "06-sentence-help.png"],
  ["options-general", "07-options-general.png"],
  ["options-translation", "08-options-translation.png"],
  ["recoverability", "09-recoverability.png"]
] as const;

const liveScreens = [
  ["popup-supported-site", SupportedSitePopupScreen],
  ["popup-unsupported-page", UnsupportedPagePopupScreen],
  ["supported-article", SupportedArticleScreen],
  ["inline-word-help", InlineWordHelpScreen],
  ["phrase-help", PhraseHelpScreen],
  ["sentence-help", SentenceHelpScreen],
  ["options-general", OptionsGeneralScreen],
  ["options-translation", OptionsTranslationScreen],
  ["recoverability", RecoverabilityScreen]
] as const;

function PreviewApp() {
  return (
    <main className="ik-preview-shell">
      <header className="ik-preview-header">
        <div>
          <p>ImmersionKit UI</p>
          <h1>Public Preview Screens</h1>
        </div>
        <nav aria-label="Preview sections">
          <a href="#generated">Generated references</a>
          <a href="#live">Live React screens</a>
        </nav>
      </header>

      <section id="generated" className="ik-preview-section">
        <div className="ik-preview-section-heading">
          <h2>Generated References</h2>
          <p>These are the image-generation outputs saved in `docs/design/public-preview-screens`.</p>
        </div>
        <div className="ik-preview-grid">
          {referenceScreens.map(([id, filename]) => (
            <article key={id} className="ik-preview-card">
              <header>
                <h3>{formatTitle(id)}</h3>
                <span>{filename}</span>
              </header>
              <img
                alt={`${formatTitle(id)} generated design reference`}
                src={`/design-screens/${filename}`}
              />
            </article>
          ))}
        </div>
      </section>

      <section id="live" className="ik-preview-section">
        <div className="ik-preview-section-heading">
          <h2>Live React Screens</h2>
          <p>
            These are exported from `@immersionkit/ui` and can be integrated into the
            extension later.
          </p>
          <p>{publicPreviewScreens.length} screen compositions exported.</p>
        </div>
        <div className="ik-preview-live-stack">
          {liveScreens.map(([id, Screen]) => (
            <article key={id} className="ik-preview-live-card">
              <header>
                <h3>{formatTitle(id)}</h3>
              </header>
              <div className="ik-preview-live-viewport">
                <Screen />
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function formatTitle(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

createRoot(document.getElementById("root") as HTMLElement).render(<PreviewApp />);
