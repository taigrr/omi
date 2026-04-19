import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import base64 from 'react-native-base64';
import {
  BATTERY_LEVEL_CHARACTERISTIC_UUID,
  BATTERY_SERVICE_UUID,
  BUTTON_SERVICE_UUID,
  BUTTON_TRIGGER_CHARACTERISTIC_UUID,
  TIME_SYNC_SERVICE_UUID,
  TIME_SYNC_WRITE_CHARACTERISTIC_UUID,
  uint32ToLittleEndianBytes,
} from '@/lib/omi';

const STORAGE_SERVICE_UUID = '30295780-4301-eabd-2904-2849adfeae43';
const STORAGE_WRITE_CHARACTERISTIC_UUID = '30295781-4301-eabd-2904-2849adfeae43';
const STORAGE_READ_CHARACTERISTIC_UUID = '30295782-4301-eabd-2904-2849adfeae43';
const STORAGE_CMD_LIST_FILES = 0x10;
const STORAGE_CMD_READ_FILE = 0x11;

export function useOmiBle() {
  const managerRef = useRef(new BleManager());
  const scanSubRef = useRef<Subscription | null>(null);
  const discoveredDevicesRef = useRef(new Map<string, Device>());
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [buttonEvents, setButtonEvents] = useState<number[][]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(Platform.OS !== 'android');
  const [features, setFeatures] = useState<number>(0);

  const requestPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setHasPermissions(true);
      return true;
    }

    const permissions = Platform.Version >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

    const result = await PermissionsAndroid.requestMultiple(permissions);
    const granted = permissions.every((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED);
    setHasPermissions(granted);
    return granted;
  }, []);

  const startScan = useCallback(async () => {
    const allowed = await requestPermissions();
    if (!allowed) {
      setIsScanning(false);
      return;
    }

    setIsScanning(true);
    const seen = new Map(discoveredDevicesRef.current);
    if (connectedDevice?.id) {
      seen.set(connectedDevice.id, connectedDevice);
    }
    discoveredDevicesRef.current = seen;
    setDevices(Array.from(seen.values()));
    managerRef.current.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setIsScanning(false);
        return;
      }
      if (!device?.id) return;
      const name = `${device.name ?? ''} ${device.localName ?? ''}`.toLowerCase();
      if (!name.includes('omi') && !name.includes('friend') && !name.includes('pendant')) return;
      seen.set(device.id, device);
      discoveredDevicesRef.current = seen;
      setDevices(Array.from(seen.values()));
    });
  }, [connectedDevice, requestPermissions]);

  const stopScan = useCallback(() => {
    managerRef.current.stopDeviceScan();
    setIsScanning(false);
  }, []);

  const connect = useCallback(async (device: Device) => {
    stopScan();
    const connected = await managerRef.current.connectToDevice(device.id, { autoConnect: false });
    await connected.discoverAllServicesAndCharacteristics();
    setConnectedDevice(connected);
    discoveredDevicesRef.current.set(connected.id, connected);
    setDevices(Array.from(discoveredDevicesRef.current.values()));
    return connected;
  }, [stopScan]);

  const syncTime = useCallback(async () => {
    if (!connectedDevice) return;
    const epochSeconds = Math.floor(Date.now() / 1000);
    const payload = base64.encodeFromByteArray(uint8ArrayFrom(uint32ToLittleEndianBytes(epochSeconds)) as unknown as number[]);
    await connectedDevice.writeCharacteristicWithResponseForService(
      TIME_SYNC_SERVICE_UUID,
      TIME_SYNC_WRITE_CHARACTERISTIC_UUID,
      payload,
    );
  }, [connectedDevice]);

  const readBattery = useCallback(async (deviceOverride?: Device | null) => {
    const device = deviceOverride ?? connectedDevice;
    if (!device) return null;
    const characteristic = await device.readCharacteristicForService(
      BATTERY_SERVICE_UUID,
      BATTERY_LEVEL_CHARACTERISTIC_UUID,
    );
    if (!characteristic?.value) return null;
    const bytes = Uint8Array.from(base64.decode(characteristic.value), (char) => char.charCodeAt(0));
    const next = bytes.length > 0 ? (bytes[0] ?? null) : null;
    setBattery(next);
    return next;
  }, [connectedDevice]);

  const monitorBattery = useCallback(async (deviceOverride?: Device | null) => {
    const device = deviceOverride ?? connectedDevice;
    if (!device) return;
    return device.monitorCharacteristicForService(
      BATTERY_SERVICE_UUID,
      BATTERY_LEVEL_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        const bytes = Uint8Array.from(base64.decode(characteristic.value), (char) => char.charCodeAt(0));
        if (bytes.length > 0) setBattery(bytes[0] ?? null);
      },
    );
  }, [connectedDevice]);

  const monitorButton = useCallback(async (deviceOverride?: Device | null) => {
    const device = deviceOverride ?? connectedDevice;
    if (!device) return;
    return device.monitorCharacteristicForService(
      BUTTON_SERVICE_UUID,
      BUTTON_TRIGGER_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        const bytes = base64.decode(characteristic.value);
        const decoded = Array.from(bytes, (char) => char.charCodeAt(0));
        setButtonEvents((prev) => [...prev.slice(-19), decoded]);
      },
    );
  }, [connectedDevice]);

  const getFeatures = useCallback(async () => {
    if (!connectedDevice) return 0;
    const services = await connectedDevice.services();
    const featuresService = services.find((service: any) => service.uuid.toLowerCase() === '19b10020-e8f2-537e-4f6c-d104768a1214');
    if (!featuresService) return 0;
    const characteristics = await featuresService.characteristics();
    const featuresCharacteristic = characteristics.find((char: any) => char.uuid.toLowerCase() === '19b10021-e8f2-537e-4f6c-d104768a1214');
    if (!featuresCharacteristic) return 0;
    const value = await featuresCharacteristic.read();
    const base64Value = value.value || '';
    if (!base64Value) return 0;
    const bytes = Uint8Array.from(base64.decode(base64Value), (char) => char.charCodeAt(0));
    if (bytes.length < 4) return 0;
    const next = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
    setFeatures(next);
    return next;
  }, [connectedDevice]);

  const getStorageStatus = useCallback(async () => {
    if (!connectedDevice) return null;
    const services = await connectedDevice.services();
    const storageService = services.find((service: any) => service.uuid.toLowerCase() === STORAGE_SERVICE_UUID);
    if (!storageService) return null;
    const characteristics = await storageService.characteristics();
    const readCharacteristic = characteristics.find((char: any) => char.uuid.toLowerCase() === STORAGE_READ_CHARACTERISTIC_UUID);
    if (!readCharacteristic) return null;
    const storageValue = await readCharacteristic.read();
    const base64Value = storageValue.value || '';
    if (!base64Value) return null;
    const bytes = Uint8Array.from(base64.decode(base64Value), (char) => char.charCodeAt(0));
    if (bytes.length < 8) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const totalUsedBytes = view.getUint32(0, true);
    const fileCount = view.getUint32(4, true);
    if (fileCount > 1000) return null;
    return { totalUsedBytes, fileCount };
  }, [connectedDevice]);

  const listStorageFiles = useCallback(async (timeoutMs: number = 5000) => {
    if (!connectedDevice) throw new Error('Device not connected');
    const services = await connectedDevice.services();
    const storageService = services.find((service: any) => service.uuid.toLowerCase() === STORAGE_SERVICE_UUID);
    if (!storageService) throw new Error('Storage service not found');
    const characteristics = await storageService.characteristics();
    const writeCharacteristic = characteristics.find((char: any) => char.uuid.toLowerCase() === STORAGE_WRITE_CHARACTERISTIC_UUID);
    if (!writeCharacteristic) throw new Error('Storage write characteristic not found');

    return await new Promise<{ index: number; timestamp: number; sizeBytes: number }[]>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        subscription.remove();
        reject(new Error('Timed out waiting for storage file list'));
      }, timeoutMs);

      const subscription = writeCharacteristic.monitor((error: any, characteristic: any) => {
        if (settled) return;
        if (error) {
          settled = true;
          clearTimeout(timer);
          subscription.remove();
          reject(error);
          return;
        }
        if (!characteristic?.value) return;
        const bytes = Uint8Array.from(base64.decode(characteristic.value), (char) => char.charCodeAt(0));
        if (bytes.length < 1) return;
        const count = bytes[0] ?? 0;
        const expectedLength = 1 + count * 8;
        if (bytes.length < expectedLength) return;
        const files: { index: number; timestamp: number; sizeBytes: number }[] = [];
        let offset = 1;
        for (let index = 0; index < count; index += 1) {
          const timestamp = (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0;
          const sizeBytes = (((bytes[offset + 4] ?? 0) << 24) | ((bytes[offset + 5] ?? 0) << 16) | ((bytes[offset + 6] ?? 0) << 8) | (bytes[offset + 7] ?? 0)) >>> 0;
          files.push({ index, timestamp, sizeBytes });
          offset += 8;
        }
        settled = true;
        clearTimeout(timer);
        subscription.remove();
        resolve(files);
      });

      const cmd = base64.encodeFromByteArray(Uint8Array.from([STORAGE_CMD_LIST_FILES]) as unknown as number[]);
      writeCharacteristic.writeWithResponse(cmd).catch((writeError: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        subscription.remove();
        reject(writeError);
      });
    });
  }, [connectedDevice]);

  const downloadStorageFile = useCallback(async (fileIndex: number, expectedSizeBytes: number, timeoutMs: number = 10000) => {
    if (!connectedDevice) throw new Error('Device not connected');
    const services = await connectedDevice.services();
    const storageService = services.find((service: any) => service.uuid.toLowerCase() === STORAGE_SERVICE_UUID);
    if (!storageService) throw new Error('Storage service not found');
    const characteristics = await storageService.characteristics();
    const writeCharacteristic = characteristics.find((char: any) => char.uuid.toLowerCase() === STORAGE_WRITE_CHARACTERISTIC_UUID);
    if (!writeCharacteristic) throw new Error('Storage write characteristic not found');

    return await new Promise<{ fileIndex: number; rawBytesReceived: number; frameCount: number; frames: number[][]; complete: boolean }>((resolve, reject) => {
      let settled = false;
      let rawBytesReceived = 0;
      const frames: number[][] = [];

      const finish = (complete: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        subscription.remove();
        resolve({ fileIndex, rawBytesReceived, frameCount: frames.length, frames, complete });
      };

      const timer = setTimeout(() => {
        if (rawBytesReceived > 0 || frames.length > 0) {
          finish(rawBytesReceived >= expectedSizeBytes);
          return;
        }
        if (settled) return;
        settled = true;
        subscription.remove();
        reject(new Error('Timed out waiting for storage file data'));
      }, timeoutMs);

      const subscription = writeCharacteristic.monitor((error: any, characteristic: any) => {
        if (settled) return;
        if (error) {
          settled = true;
          clearTimeout(timer);
          subscription.remove();
          reject(error);
          return;
        }
        if (!characteristic?.value) return;
        const bytes = Uint8Array.from(base64.decode(characteristic.value), (char) => char.charCodeAt(0));
        if (bytes.length === 0) return;
        if (bytes.length === 1) {
          const status = bytes[0] ?? 0;
          if (status === 4 || status === 0) {
            finish(rawBytesReceived >= expectedSizeBytes || status === 4);
            return;
          }
          finish(rawBytesReceived >= expectedSizeBytes);
          return;
        }
        if (bytes.length > 4) {
          const audioData = bytes.slice(4);
          rawBytesReceived += audioData.length;
          let packageOffset = 0;
          while (packageOffset < audioData.length - 1) {
            const frameSize = audioData[packageOffset] ?? 0;
            if (frameSize === 0) {
              packageOffset += 1;
              continue;
            }
            if (packageOffset + 1 + frameSize > audioData.length) {
              break;
            }
            frames.push(Array.from(audioData.slice(packageOffset + 1, packageOffset + 1 + frameSize)));
            packageOffset += frameSize + 1;
          }
        }
        if (expectedSizeBytes > 0 && rawBytesReceived >= expectedSizeBytes) {
          finish(true);
        }
      });

      const command = Uint8Array.from([STORAGE_CMD_READ_FILE, fileIndex & 0xff, 0, 0, 0, 0]);
      const cmd = base64.encodeFromByteArray(command as unknown as number[]);
      writeCharacteristic.writeWithResponse(cmd).catch((writeError: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        subscription.remove();
        reject(writeError);
      });
    });
  }, [connectedDevice]);

  useEffect(() => () => {
    stopScan();
    scanSubRef.current?.remove();
    managerRef.current.destroy();
  }, [stopScan]);

  return useMemo(() => ({
    devices,
    connectedDevice,
    battery,
    buttonEvents,
    isScanning,
    hasPermissions,
    features,
    requestPermissions,
    startScan,
    stopScan,
    connect,
    syncTime,
    readBattery,
    monitorBattery,
    monitorButton,
    getFeatures,
    getStorageStatus,
    listStorageFiles,
    downloadStorageFile,
  }), [devices, connectedDevice, battery, buttonEvents, isScanning, hasPermissions, features, requestPermissions, startScan, stopScan, connect, syncTime, readBattery, monitorBattery, monitorButton, getFeatures, getStorageStatus, listStorageFiles, downloadStorageFile]);
}

function uint8ArrayFrom(values: number[]) {
  return Uint8Array.from(values);
}
