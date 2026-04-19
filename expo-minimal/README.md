# Omi Minimal Expo

Minimal Expo-native React Native prototype focused on Omi pendant BLE flows.

## Current scope
- Scan and connect to likely Omi, Friend, and pendant devices
- Keep the currently connected device visible during rescans
- Sync time to device
- Monitor battery
- Monitor button events
- Read offline storage status
- List and download offline recordings from pendant storage
- Save downloaded recordings locally as WAV files
- Upload files and downloaded recordings to the self-host backend
- Configure backend HTTP and WebSocket endpoints from the app

## BLE contract used here
This app currently follows the BLE contracts present in this repo's firmware and desktop client.

### Main Omi service
Used for core pendant features like audio, settings, and feature flags.

- Service: `19b10000-e8f2-537e-4f6c-d104768a1214`
- Audio stream: `19b10001-e8f2-537e-4f6c-d104768a1214`
- Audio codec: `19b10002-e8f2-537e-4f6c-d104768a1214`
- Features service: `19b10020-e8f2-537e-4f6c-d104768a1214`
- Features characteristic: `19b10021-e8f2-537e-4f6c-d104768a1214`
- Time sync service: `19b10030-e8f2-537e-4f6c-d104768a1214`
- Time sync characteristic: `19b10031-e8f2-537e-4f6c-d104768a1214`

### Storage service
Offline storage is a separate UUID family, not part of the `19b100...` service.

- Service: `30295780-4301-eabd-2904-2849adfeae43`
- Write and notify characteristic: `30295781-4301-eabd-2904-2849adfeae43`
- Read and status characteristic: `30295782-4301-eabd-2904-2849adfeae43`

### Storage commands
- List files: `0x10`
- Read file: `0x11`

### Storage behavior assumptions
- Storage status is read from the storage read characteristic
- File list and file download responses arrive via notifications on the storage write characteristic
- Offline storage availability is inferred from the features bitmask, with offline storage currently checked as bit 6

## State management rules
- Use TanStack Query for promise-based state resolution and refresh flows
- Avoid ad hoc screen-level async state for BLE fetches when a query or mutation is appropriate
- `QueryClientProvider` is installed at the app layout level

## Current implementation notes
- This is intentionally pendant-first, not a full port of the Flutter app
- The app now supports storage file sync and local playback preparation via WAV conversion
- The local recordings list is still persisted with AsyncStorage
- Some local-only config and file flows still use direct async calls and can be migrated further to TanStack Query in follow-up cleanup

## Not implemented
- Firmware updates
- Full conversation/auth sync with production services
- Complete streaming audio pipeline from the original app
- Wi-Fi storage transfer path

## Why this shape
The most reusable parts of the original Omi app for this React Native prototype are the BLE UUIDs, command semantics, and firmware/backend contracts, not the Flutter UI.
