/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POLAR_CHECKOUT_LINK?: string
  readonly VITE_POLAR_ORG?: string
  readonly VITE_POLAR_VALIDATE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
