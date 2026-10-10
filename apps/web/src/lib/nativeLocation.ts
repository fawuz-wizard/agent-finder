import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * The phone's own "Turn on location?" dialog, through the LocationSettings plugin in the
 * Android shell (android/app/src/main/java/com/agentfinder/app/LocationSettingsPlugin.java).
 * In a browser there is no such dialog, so every call says location is already on and the
 * page falls back to the browser's own permission prompt.
 */
export interface LocationStatus {
  enabled: boolean
  permission: 'granted' | 'prompt' | 'denied'
  /** The customer accepted the system dialog. */
  accepted?: boolean
  /** No Play services: the settings page was opened instead. */
  openedSettings?: boolean
}

interface LocationSettingsPlugin {
  status(): Promise<LocationStatus>
  turnOn(): Promise<LocationStatus>
}

const plugin = registerPlugin<LocationSettingsPlugin>('LocationSettings')

export const nativeLocation = {
  /** True inside the Android shell, where the system dialog exists. */
  available(): boolean {
    return Capacitor.isNativePlatform()
  },

  /** Ask the phone to switch location on. Resolves when the customer has answered. */
  async turnOn(): Promise<LocationStatus> {
    if (!nativeLocation.available()) return { enabled: true, permission: 'prompt' }
    try {
      return await plugin.turnOn()
    } catch {
      return { enabled: false, permission: 'prompt' }
    }
  },
}
