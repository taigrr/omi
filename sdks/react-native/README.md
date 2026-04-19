<!-- This file is auto-generated from docs/doc/developer/sdk/ReactNative.mdx. Do not edit manually. -->
## Overview

A React Native SDK for connecting to and interacting with Omi devices via Bluetooth Low Energy (BLE). Build cross-platform mobile apps for iOS and Android.

<CardGroup cols={3}>
  <Card title="Cross-Platform" icon="mobile">
    iOS and Android support
  </Card>
  <Card title="BLE Connection" icon="bluetooth">
    Bluetooth Low Energy
  </Card>
  <Card title="Real-time Audio" icon="microphone">
    Stream and transcribe
  </Card>
</CardGroup>


## Installation

### In Your Project

```bash
npm install @omiai/omi-react-native
# or
yarn add @omiai/omi-react-native
```

This SDK relies on [react-native-ble-plx](https://github.com/Polidea/react-native-ble-plx) for BLE communication:

```bash
npm install react-native-ble-plx
```

<Warning>
For iOS projects, you **must** run `pod install` after installing dependencies:

```bash
cd ios && pod install
```
</Warning>

### Platform-Specific Setup

<Tabs>
  <Tab title="iOS">
    Add to your `Info.plist`:

    ```xml
    <key>NSBluetoothAlwaysUsageDescription</key>
    <string>This app uses Bluetooth to connect to Omi devices</string>
    <key>NSBluetoothPeripheralUsageDescription</key>
    <string>This app uses Bluetooth to connect to Omi devices</string>
    ```
  </Tab>
  <Tab title="Android">
    Add to your `AndroidManifest.xml`:

    ```xml
    <uses-permission android:name="android.permission.BLUETOOTH"/>
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
    <!-- For Android 12+ -->
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    ```
  </Tab>
</Tabs>


## Quick Start

```javascript
import { OmiConnection, DeviceConnectionState, BleAudioCodec } from '@omiai/omi-react-native';

// Create an instance of OmiConnection
const omiConnection = new OmiConnection();

// Scan for devices
const stopScan = omiConnection.scanForDevices((device) => {
  console.log('Found device:', device.name, device.id);
}, 10000); // Scan for 10 seconds

// Connect to a device
async function connectToDevice(deviceId) {
  const success = await omiConnection.connect(deviceId, (id, state) => {
    console.log(`Device ${id} connection state changed to: ${state}`);
  });

  if (success) {
    console.log('Connected successfully!');

    // Get the audio codec
    const codec = await omiConnection.getAudioCodec();
    console.log('Device audio codec:', codec);

    // Start listening for audio data
    const subscription = await omiConnection.startAudioBytesListener((bytes) => {
      console.log('Received audio bytes:', bytes.length);
    });

    // Get battery level
    const batteryLevel = await omiConnection.getBatteryLevel();
    console.log('Battery level:', batteryLevel);

    // Later, stop listening for audio
    await omiConnection.stopAudioBytesListener(subscription);

    // Disconnect when done
    await omiConnection.disconnect();
  }
}
```


## Storage protocol notes

Core audio/features and offline storage use different BLE UUID families.

### Core Omi service family
- Main service: `19b10000-e8f2-537e-4f6c-d104768a1214`
- Audio stream: `19b10001-e8f2-537e-4f6c-d104768a1214`
- Audio codec: `19b10002-e8f2-537e-4f6c-d104768a1214`
- Features service: `19b10020-e8f2-537e-4f6c-d104768a1214`
- Features characteristic: `19b10021-e8f2-537e-4f6c-d104768a1214`
- Time sync service: `19b10030-e8f2-537e-4f6c-d104768a1214`
- Time sync characteristic: `19b10031-e8f2-537e-4f6c-d104768a1214`

### Storage service family
- Storage service: `30295780-4301-eabd-2904-2849adfeae43`
- Storage write and notify characteristic: `30295781-4301-eabd-2904-2849adfeae43`
- Storage read and status characteristic: `30295782-4301-eabd-2904-2849adfeae43`

### Storage commands
- List files: `0x10`
- Read file: `0x11`
- Delete file: `0x12`
- Stop sync: `0x03`

Storage stats are read from the storage read characteristic. File list and download responses are delivered via notifications on the storage write characteristic.

## Troubleshooting

<AccordionGroup>
  <Accordion title="Build fails with native module errors on iOS" icon="apple">
    - Ensure you've run `pod install` in the ios directory
    - Try cleaning the build folder: **Product → Clean Build Folder**
    - Make sure you're opening the `.xcworkspace` file, not `.xcodeproj`
  </Accordion>
  <Accordion title="Device not found during scanning" icon="bluetooth">
    - Ensure Bluetooth is enabled on your device
    - Check that you have the necessary permissions
    - Make sure the Omi device is powered on and in range
    - Bluetooth scanning doesn't work in iOS simulators - use a physical device
  </Accordion>
  <Accordion title="Connection fails" icon="plug">
    - Try restarting the Omi device
    - Ensure the device is not connected to another application
    - Check the battery level of the Omi device
  </Accordion>
  <Accordion title="Audio data not received" icon="microphone">
    - Verify that the device supports the audio service
    - Check that you're properly handling the audio bytes in your callback
  </Accordion>
  <Accordion title="Transcription not working" icon="comment">
    - Ensure you have a valid Deepgram API key
    - Check that the audio listener is started before enabling transcription
    - Verify your internet connection is stable
  </Accordion>
  <Accordion title="Keyboard overlaps input fields" icon="keyboard">
    The example app includes padding at the bottom of the ScrollView to ensure input fields remain visible when the keyboard is open.
  </Accordion>
</AccordionGroup>


## Related

<CardGroup cols={2}>
  <Card title="SDK Overview" icon="cube" href="/doc/developer/sdk/sdk">
    Compare all available SDKs
  </Card>
  <Card title="GitHub Source" icon="github" href="https://github.com/BasedHardware/omi/tree/main/sdks/react-native">
    View source code and contribute
  </Card>
</CardGroup>
