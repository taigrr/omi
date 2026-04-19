# Omi Device Connection Documentation

This document outlines the Bluetooth Low Energy (BLE) connection functionality for Omi devices based on the Flutter implementation in `app/lib/services/devices/omi_connection.dart`, the React Native SDK implementation in `sdks/react-native/src/OmiConnection.ts`, and the current firmware storage service implementation.

## Overview

The Omi connection module provides functionality to connect to Omi devices via Bluetooth Low Energy (BLE), retrieve device information, and interact with core device features such as audio streaming, button events, battery status, time sync, feature flags, and offline storage sync.

## BLE UUID families

There are two separate BLE UUID families in active use.

### Core Omi service family

```text
Omi Service UUID: 19b10000-e8f2-537e-4f6c-d104768a1214

Audio Data Stream Characteristic: 19b10001-e8f2-537e-4f6c-d104768a1214
Audio Codec Characteristic: 19b10002-e8f2-537e-4f6c-d104768a1214

Features Service UUID: 19b10020-e8f2-537e-4f6c-d104768a1214
Features Characteristic: 19b10021-e8f2-537e-4f6c-d104768a1214

Time Sync Service UUID: 19b10030-e8f2-537e-4f6c-d104768a1214
Time Sync Write Characteristic: 19b10031-e8f2-537e-4f6c-d104768a1214
```

### Button and battery

```text
Button Service UUID: 23ba7924-0000-1000-7450-346eac492e92
Button Trigger Characteristic: 23ba7925-0000-1000-7450-346eac492e92

Battery Service UUID: 0000180f-0000-1000-8000-00805f9b34fb
Battery Level Characteristic: 00002a19-0000-1000-8000-00805f9b34fb
```

### Storage service family

Offline storage is not part of the `19b100...` service family. It uses a dedicated UUID family:

```text
Storage Service UUID: 30295780-4301-eabd-2904-2849adfeae43
Storage Write/Notify Characteristic: 30295781-4301-eabd-2904-2849adfeae43
Storage Read/Status Characteristic: 30295782-4301-eabd-2904-2849adfeae43
Storage Wi-Fi Characteristic: 30295783-4301-eabd-2904-2849adfeae43
```

## Storage protocol

The current multi-file storage protocol uses:

- `0x03` stop sync
- `0x10` list files
- `0x11` read file
- `0x12` delete file

### Storage behavior

- Read storage stats from the storage read/status characteristic `30295782...`
- Send storage commands to the storage write/notify characteristic `30295781...`
- Receive file list and file download responses through notifications on `30295781...`

### Storage status format

Current firmware returns little-endian uint32 fields from the storage read/status characteristic:

- `[0]` total used bytes
- `[1]` file count
- `[2]` free bytes, optional / placeholder in current firmware
- `[3]` status flags, optional / placeholder in current firmware

### File list response format

```text
[count:1][timestamp1:4 big-endian][size1:4 big-endian]...
```

### File read response format

Download packets are emitted on the storage write/notify characteristic. Data packets currently include a 4-byte timestamp prefix followed by encoded audio payload. Single-byte responses may indicate completion or status.

## Core functions

### Connection management

- `connect`: establishes a connection to the Omi device
- `disconnect`: terminates the connection with the device
- `isConnected`: checks if the device is currently connected
- `ping`: sends a ping to the device to check connectivity when supported by the transport

### Audio functions

- `getAudioCodec`: retrieves the current audio codec used by the device
- `getBleAudioBytesListener` / `startAudioBytesListener`: sets up a listener for audio data from the device

### Button functions

- `getBleButtonState`: gets the current state of the device buttons
- `getBleButtonListener` / `startButtonListener`: sets up a listener for button press events

### Battery functions

- `retrieveBatteryLevel` / `getBatteryLevel`: gets the current battery level of the device
- `getBleBatteryLevelListener`: sets up a listener for battery level changes

### Time sync and features

- `performSyncTime` / `syncTime`: writes the current epoch seconds to the time sync characteristic
- `getFeatures`: reads the device feature bitmask from the features characteristic

### Storage functions

- `performGetStorageFileStats` / `getStorageStatus`: reads total used bytes and file count
- `performListStorageFiles` / `listStorageFiles`: requests and parses the multi-file list
- `performReadStorageFile` / `downloadStorageFile`: reads a specific file by index
- `performDeleteStorageFile`: deletes a file by index

## Audio codecs

The Omi device supports several audio codecs depending on firmware:

- PCM8
- PCM16
- Opus
- Opus FS320 in Flutter app code paths

## Implementation notes

1. Always check if the device is connected before attempting BLE interaction
2. Handle disconnection events gracefully and clean up listeners
3. For Android devices, requesting a larger MTU can improve stability and throughput
4. Do not assume storage UUIDs are part of the main `19b100...` service family
5. Storage status reads and storage transfer notifications happen on different characteristics in the same storage service family
