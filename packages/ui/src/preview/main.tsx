import { createRoot } from "react-dom/client";
import {
  ExtensionOptions,
  ExtensionPopup,
  ReadingPage
} from "../index";
import "../styles.css";
import "./preview.css";

const liveScreens = [
  ["popup-supported-site", () => <ExtensionPopup state="supported" />],
  ["popup-unsupported-page", () => <ExtensionPopup state="unsupported" />],
  ["supported-article", () => <ReadingPage state="supported" />],
  ["inline-word-help", () => <ReadingPage state="word" />],
  ["phrase-help", () => <ReadingPage state="phrase" />],
  ["sentence-help", () => <ReadingPage state="sentence" />],
  ["options-general", () => <ExtensionOptions initialSection="General" />],
  ["options-translation", () => <ExtensionOptions initialSection="Translation" />],
  ["recoverability", () => <ExtensionOptions initialSection="Advanced" />]
] as const;

function PreviewApp() {
  return (
    <main className="ik-preview-shell">
      <header className="ik-preview-header">
        <div>
          <p>ImmersionKit UI</p>
          <h1>Preview Screens</h1>
        </div>
        <nav aria-label="Preview sections">
          <a href="#live">Live React screens</a>
        </nav>
      </header>

      <section id="live" className="ik-preview-section">
        <div className="ik-preview-section-heading">
          <h2>Live React Screens</h2>
          <p>
            These are exported from `@immersionkit/ui` and can be integrated into the
            extension later.
          </p>
          <p>3 reusable components, 9 state examples.</p>
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
