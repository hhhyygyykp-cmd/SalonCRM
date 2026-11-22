/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_WALLET_PUBLIC_BASE_URL?: string
  readonly VITE_META_APP_ID?: string
  readonly VITE_META_EMBEDDED_SIGNUP_CONFIG_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
