/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CRM_SEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
