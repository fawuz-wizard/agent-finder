import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The Android shell around the web app. The screens are the same Vite build that runs in the
 * browser; Capacitor only packages `dist/` into the APK. The API address is baked in at build
 * time through VITE_API_BASE_URL / VITE_API_MODE (see .github/workflows/android.yml).
 *
 * Origin: the page is served from https://localhost, which must be in the API's CORS list.
 * A page on https may not call a plain-http API: the WebView blocks the fetch as mixed content,
 * and the mixed-content allowance does not cover fetch. The only plain-http API is a demo
 * against a laptop on the phone's hotspot, so for exactly those builds the workflow sets
 * CAP_ALLOW_HTTP=1 and the page is served from http://localhost instead (also in the CORS
 * list), together with the debug manifest's cleartext permission. Builds against a hosted
 * https API always use https://localhost.
 */
const plainHttpApi = process.env.CAP_ALLOW_HTTP === '1'

const config: CapacitorConfig = {
  appId: 'com.agentfinder.app',
  appName: 'Agent Finder',
  webDir: 'dist',
  server: {
    androidScheme: plainHttpApi ? 'http' : 'https',
  },
  android: {
    allowMixedContent: plainHttpApi,
  },
}

export default config
