/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROBLOX_CLIENT_ID?: string;
  readonly VITE_ROBLOX_OAUTH_SCOPES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
