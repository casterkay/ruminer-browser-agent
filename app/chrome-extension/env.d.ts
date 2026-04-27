/// <reference types="chrome" />
/// <reference types="vite/client" />
/// <reference types="unplugin-icons/types/vue" />

interface ImportMetaEnv {
  readonly WXT_PUBLIC_RUMINER_WEB_URL?: string;
  readonly VITE_RUMINER_WEB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  type Props = Record<string, never>;
  type RawBindings = Record<string, never>;
  const component: DefineComponent<Props, RawBindings, any>;
  export default component;
}
