/// <reference types="chrome" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IMMERSIONKIT_ASSET_BASE_URL?: string;
  readonly VITE_IMMERSIONKIT_API_BASE_URL?: string;
  readonly VITE_IMMERSIONKIT_ACCOUNT_REQUIRED?: string;
  readonly VITE_IMMERSIONKIT_BUILD_PROFILE?: string;
  readonly VITE_IMMERSIONKIT_EXTENSION_KEY?: string;
}

declare module "wink-nlp" {
  const winkNlp: unknown;
  export default winkNlp;
}

declare module "wink-eng-lite-web-model" {
  const winkModel: unknown;
  export default winkModel;
}
