import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The Android shell around the web app. The screens are the same Vite build that runs in the
 * browser; Capacitor only packages `dist/` into the APK and serves it from https://localhost,
 * so the API's CORS list must include that origin. The API address is baked in at build time
 * through VITE_API_BASE_URL / VITE_API_MODE (see .github/workflows/android.yml).
 */
const config: CapacitorConfig = {
  appId: 'com.agentfinder.app',
  appName: 'Agent Finder',
  webDir: 'dist',
  server: {
    // The default, stated so a change to it is a deliberate one: the app's origin on Android.
    androidScheme: 'https',
  },
  android: {
    // Debug builds only ever talk to a laptop on the same wifi or a hosted API; the manifest in
    // app/src/debug allows plain http for the former. Release builds stay https-only.
    allowMixedContent: false,
  },
}

export default config
