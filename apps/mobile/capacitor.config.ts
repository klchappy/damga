import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Damga mobile (iOS + Android) — Capacitor wrapper.
 *
 * Build akışı:
 *   1) pnpm --filter @damga/web build  (web → dist/)
 *   2) cp -r ../web/dist www  (veya symlink)
 *   3) pnpm cap:add:android  (ilk kez)
 *   4) pnpm cap:sync
 *   5) pnpm cap:open:android  (Android Studio)
 *
 * iOS için Xcode + Apple Developer hesabı şart.
 */
const config: CapacitorConfig = {
  appId: 'com.damga.app',
  appName: 'Damga',
  webDir: 'www',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    iosScheme: 'damga',
    // Production'da web app'i remote'tan da servis edebilirsin:
    // url: 'https://damga.deploi.net',
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#FFF4E8',
  },
  android: {
    backgroundColor: '#FFF4E8',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#FFF4E8',
      androidSplashResourceName: 'splash',
      iosSpinnerStyle: 'small',
      spinnerColor: '#FF6B35',
      showSpinner: true,
    },
    StatusBar: {
      style: 'light',
      backgroundColor: '#FFF4E8',
    },
    Geolocation: {
      // iOS için Info.plist'e NSLocationWhenInUseUsageDescription gerekir
      permissions: { location: 'Damga giriş/çıkış doğrulaması için konumunuzu kullanır.' },
    },
  },
};

export default config;
