# Damga Mobile

Damga'nın iOS ve Android wrapper'ı (Capacitor 6).

## Build

```bash
# 1) Web app'i build et
cd ../..
pnpm --filter @damga/web build

# 2) Web dist'i mobile app'e kopyala (veya symlink)
mkdir -p apps/mobile/www
cp -r apps/web/dist/* apps/mobile/www/

# 3) İlk kez Android/iOS ekle
cd apps/mobile
pnpm cap:add:android
pnpm cap:add:ios   # macOS + Xcode gerekli

# 4) Sync (her web build sonrası)
pnpm cap:sync

# 5) Native IDE'de aç
pnpm cap:open:android   # Android Studio
pnpm cap:open:ios       # Xcode (macOS only)
```

## NFC

Web NFC API + Capacitor wrapper:
- **Android**: `@capacitor-community/nfc` (manuel ekle gerekirse)
- **iOS**: Apple Core NFC framework (Capacitor v6 destek sınırlı, native plugin gerekir)

iOS NFC için ek konfig:
- Xcode → Signing & Capabilities → Add Capability → Near Field Communication Tag Reading
- `Info.plist` → NFCReaderUsageDescription
