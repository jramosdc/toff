/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for WMATA requests. Dev default: '/api/wmata' (Vite proxy).
   *  Production: your deployed Cloudflare Worker URL. */
  readonly VITE_WMATA_BASE?: string
  /** WMATA API key. Only needed when calling the API directly (dev).
   *  In production the Worker holds the key, so leave this unset. */
  readonly VITE_WMATA_API_KEY?: string
  /** Set to '1' to use built-in mock data (no key/network needed). */
  readonly VITE_WMATA_MOCK?: string
  /** Optional fallback coordinates if geolocation is unavailable (dev). */
  readonly VITE_DEFAULT_LAT?: string
  readonly VITE_DEFAULT_LON?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
