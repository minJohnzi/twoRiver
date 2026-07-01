/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_TIPTAP_NEW_ARTICLE_ENABLED?: string;
  readonly VITE_TIPTAP_PUBLISH_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
