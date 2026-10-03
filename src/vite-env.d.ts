/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_DEBUG_TIME?: string
  readonly VITE_WF_BOARD_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
