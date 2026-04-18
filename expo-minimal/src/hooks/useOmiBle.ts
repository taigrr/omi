import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export function useOmiBle() {
  const managerRef = useRef(new BleManager());
  const scanSubRef = useRef<Subscription | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [buttonEvents, setButtonEvents] = useState<number[][]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const startScan = useCallback(() => {
    setDevices([]);
    setIsScanning(true);
    const seen = new Map<string, Device>();
    managerRef.current.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setIsScanning(false);
        return;
      }
      if (!device?.id) return;
      const name = `${device.name ?? ''} ${device.localName ?? ''}`.toLowerCase();
      if (!name.includes('omi') && !name.includes('friend') && !name.includes('pendant')) return;
      seen.set(device.id, device);
      setDevices(Array.from(seen.values()));
    });
  }, []);

  const stopScan = useCallback(() => {
    managerRef.current.stopDeviceScan();
    setIsScanning(false);
  }, []);

  const connect = useCallback(async (device: Device) => {
    stopScan();
    const connected = await managerRef.current.connectToDevice(device.id, { autoConnect: false });
    await connected.discoverAllServicesAndCharacteristics();
    setConnectedDevice(connected);
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

  const monitorBattery = useCallback(async () => {
    if (!connectedDevice) return;
    return connectedDevice.monitorCharacteristicForService(
      BATTERY_SERVICE_UUID,
      BATTERY_LEVEL_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        const bytes = base64.decode(characteristic.value);
        if (bytes.length > 0) setBattery(bytes.charCodeAt(0));
      },
    );
  }, [connectedDevice]);

  const monitorButton = useCallback(async () => {
    if (!connectedDevice) return;
    return connectedDevice.monitorCharacteristicForService(
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
    startScan,
    stopScan,
    connect,
    syncTime,
    monitorBattery,
    monitorButton,
  }), [devices, connectedDevice, battery, buttonEvents, isScanning, startScan, stopScan, connect, syncTime, monitorBattery, monitorButton]);
}

function uint8ArrayFrom(values: number[]) {
  return Uint8Array.from(values);
}
