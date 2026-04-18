# Omi Minimal Expo

Minimal Expo-native React Native prototype focused on Omi pendant BLE flows.

## Scope
- Scan and connect to likely Omi/Friend pendant devices
- Sync time to device
- Monitor battery
- Monitor button events

## Notes
This is intentionally pendant-first and does not yet implement:
- firmware updates
- storage file sync
- auth/backend conversation sync
- audio decoding/upload pipeline

## Why this shape
The original Omi app's main reusable assets for a React Native port are the BLE UUIDs, command semantics, and firmware/backend contracts, not the Flutter UI.
