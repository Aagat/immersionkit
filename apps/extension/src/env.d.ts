/// <reference types="chrome" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IMMERSIONKIT_ASSET_BASE_URL?: string;
}

declare module "wink-nlp" {
  const winkNlp: unknown;
  export default winkNlp;
}

declare module "wink-eng-lite-web-model" {
  const winkModel: unknown;
  export default winkModel;
}
