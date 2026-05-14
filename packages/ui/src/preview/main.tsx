import { createRoot } from "react-dom/client";
import {
  ExtensionOptions,
  ExtensionPopup,
  ReadingPage
} from "../index";
import "../styles.css";

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

const designAssets = [
  [
    "public-preview-design-system",
    "ImmersionKit public-preview design system board",
    "public-preview-design-system-board.png"
  ]
] as const;

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
    <main className="ik-preview-root grid gap-8 p-7">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-5 rounded-lg border bg-card/90 p-5 shadow-soft backdrop-blur max-md:static max-md:flex-col max-md:items-start">
        <div>
          <p className="text-xs font-bold uppercase text-primary">ImmersionKit UI</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">Preview Screens</h1>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Preview sections">
          <a className="rounded-md border bg-background px-3 py-2 text-sm font-semibold text-foreground no-underline" href="#generated">Generated references</a>
          <a className="rounded-md border bg-background px-3 py-2 text-sm font-semibold text-foreground no-underline" href="#live">Live React screens</a>
        </nav>
      </header>

      <section id="design-system" className="grid gap-5">
        <div className="grid gap-1">
          <h2 className="text-2xl font-semibold tracking-normal">Design System</h2>
          <p className="text-muted-foreground">
            Generated visual reference for the color palette, spacing, shadows,
            and public-preview component language.
          </p>
        </div>
        <div className="grid gap-5">
          {designAssets.map(([id, title, filename]) => (
            <article key={id} className="overflow-hidden rounded-lg border bg-card shadow-soft">
              <header className="flex items-baseline justify-between gap-3 border-b p-4">
                <h3>{title}</h3>
                <span className="text-sm text-muted-foreground">{filename}</span>
              </header>
              <img
                className="block max-h-[820px] w-full bg-muted/30 object-contain"
                alt={`${title} generated asset`}
                src={`/design-assets/${filename}`}
              />
            </article>
          ))}
        </div>
      </section>

      <section id="generated" className="grid gap-5">
        <div className="grid gap-1">
          <h2 className="text-2xl font-semibold tracking-normal">Generated References</h2>
          <p className="text-muted-foreground">These are the generated design references used to check the component states.</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-5 max-sm:grid-cols-1">
          {referenceScreens.map(([id, filename]) => (
            <article key={id} className="overflow-hidden rounded-lg border bg-card shadow-soft">
              <header className="flex items-baseline justify-between gap-3 border-b p-4">
                <h3>{formatTitle(id)}</h3>
                <span className="text-sm text-muted-foreground">{filename}</span>
              </header>
              <img
                className="block h-[420px] w-full bg-muted/30 object-contain"
                alt={`${formatTitle(id)} generated design reference`}
                src={`/design-screens/${filename}`}
              />
            </article>
          ))}
        </div>
      </section>

      <section id="live" className="grid gap-5">
        <div className="grid gap-1">
          <h2 className="text-2xl font-semibold tracking-normal">Live React Screens</h2>
          <p className="text-muted-foreground">
            These are exported from `@immersionkit/ui` and can be integrated into the
            extension later.
          </p>
          <p className="text-muted-foreground">3 reusable components, 9 state examples.</p>
        </div>
        <div className="grid gap-6">
          {liveScreens.map(([id, Screen]) => (
            <article key={id} className="overflow-hidden rounded-lg border bg-card shadow-soft">
              <header className="border-b p-4">
                <h3>{formatTitle(id)}</h3>
              </header>
              <div className="overflow-hidden bg-muted/30">
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
