import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The Android shell around the web app. The screens are the same Vite build that runs in the
 * browser; Capacitor only packages `dist/` into the APK and serves it from https://localhost,
 * so the API's CORS list must include that origin. The API address is baked in at build time
 * through VITE_API_BASE_URL / VITE_API_MODE (see .github/workflows/android.yml).
 *
 * A page served from https://localhost may not call a plain-http API: the WebView blocks it as
 * mixed content. The only time the API is plain http is a demo against a laptop on the phone's
 * hotspot, so the workflow sets CAP_ALLOW_HTTP=1 for exactly those builds (together with the
 * debug manifest's cleartext permission). Builds against a hosted https API never allow it.
 */
const allowPlainHttpApi = process.env.CAP_ALLOW_HTTP === '1'

const config: CapacitorConfig = {
  appId: 'com.agentfinder.app',
  appName: 'Agent Finder',
  webDir: 'dist',
  server: {
    // The default, stated so a change to it is a deliberate one: the app's origin on Android.
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: allowPlainHttpApi,
  },
}

export default config
