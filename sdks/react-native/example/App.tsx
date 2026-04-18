import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BleManager, State, Subscription } from 'react-native-ble-plx';
import {
  BleAudioCodec,
  OmiConnection,
  OmiDevice,
  StorageFileInfo,
  StorageStatus,
} from '@omiai/omi-react-native';

const THEME = {
  bg: '#0f172a',
  panel: '#111827',
  panelAlt: '#1f2937',
  text: '#f8fafc',
  subtext: '#94a3b8',
  accent: '#38bdf8',
  success: '#22c55e',
  warn: '#f59e0b',
  danger: '#ef4444',
};

export default function App() {
  const omi = useRef(new OmiConnection()).current;
  const bleManagerRef = useRef<BleManager | null>(null);
  const stopScanRef = useRef<(() => void) | null>(null);
  const buttonSubRef = useRef<Subscription | null>(null);

  const [bluetoothState, setBluetoothState] = useState<State>(State.Unknown);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<OmiDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<OmiDevice | null>(null);
  const [codec, setCodec] = useState<BleAudioCodec | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [buttonEvents, setButtonEvents] = useState<number[][]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [storageFiles, setStorageFiles] = useState<StorageFileInfo[]>([]);
  const [featuresValue, setFeaturesValue] = useState<number>(0);
  const [ledDimRatio, setLedDimRatio] = useState<number | null>(null);
  const [micGain, setMicGain] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState('Ready to scan');
  const [apiBaseUrl, setApiBaseUrl] = useState('http://127.0.0.1:8080/');
  const [agentWsUrl, setAgentWsUrl] = useState('ws://127.0.0.1:8080/v1/agent/ws');

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [savedApiBaseUrl, savedAgentWsUrl] = await Promise.all([
          AsyncStorage.getItem('omi.selfHosted.apiBaseUrl'),
          AsyncStorage.getItem('omi.selfHosted.agentWsUrl'),
        ]);
        if (savedApiBaseUrl) setApiBaseUrl(savedApiBaseUrl);
        if (savedAgentWsUrl) setAgentWsUrl(savedAgentWsUrl);
      } catch (error) {
        setStatusMessage(`Failed to load self-host config: ${String(error)}`);
      }
    };

    loadConfig();
  }, []);

  useEffect(() => {
    const manager = new BleManager();
    bleManagerRef.current = manager;

    const sub = manager.onStateChange((state) => {
      setBluetoothState(state);
      if (state === State.PoweredOn) {
        requestBluetoothPermission();
      }
    }, true);

    return () => {
      sub.remove();
      buttonSubRef.current?.remove();
      stopScanRef.current?.();
      manager.destroy();
    };
  }, []);

  const requestBluetoothPermission = async () => {
    try {
      bleManagerRef.current?.startDeviceScan(null, null, (error) => {
        if (error) {
          setPermissionGranted(false);
          return;
        }
        setPermissionGranted(true);
        bleManagerRef.current?.stopDeviceScan();
      });
    } catch {
      setPermissionGranted(false);
    }
  };

  const resetDeviceState = () => {
    setCodec(null);
    setBatteryLevel(null);
    setButtonEvents([]);
    setStorageStatus(null);
    setStorageFiles([]);
    setFeaturesValue(0);
    setLedDimRatio(null);
    setMicGain(null);
  };

  const statusTone = useMemo(() => {
    if (!connectedDevice) return THEME.subtext;
    return THEME.success;
  }, [connectedDevice]);

  const scan = () => {
    if (bluetoothState !== State.PoweredOn) {
      Alert.alert('Bluetooth Off', 'Please enable Bluetooth first.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }

    if (!permissionGranted) {
      requestBluetoothPermission();
      setStatusMessage('Waiting for Bluetooth permission');
      return;
    }

    setDevices([]);
    setScanning(true);
    setStatusMessage('Scanning for Omi devices');
    stopScanRef.current?.();
    stopScanRef.current = omi.scanForDevices((device) => {
      setDevices((prev) => (prev.some((d) => d.id === device.id) ? prev : [...prev, device]));
    }, 15000);

    setTimeout(() => {
      stopScanRef.current?.();
      setScanning(false);
      setStatusMessage('Scan finished');
    }, 15000);
  };

  const connectToDevice = async (device: OmiDevice) => {
    try {
      if (connectedDevice) {
        await disconnect();
      }

      setStatusMessage(`Connecting to ${device.name || device.id}`);
      const ok = await omi.connect(device.id, (_id, state) => {
        if (state === 'disconnected') {
          setConnectedDevice(null);
          resetDeviceState();
          setStatusMessage('Disconnected');
        }
      });

      if (!ok) {
        setStatusMessage('Connection failed');
        return;
      }

      stopScanRef.current?.();
      setScanning(false);
      setConnectedDevice(device);
      setStatusMessage(`Connected to ${device.name || device.id}`);

      buttonSubRef.current?.remove();
      buttonSubRef.current = await omi.startButtonListener((bytes) => {
        setButtonEvents((prev) => [...prev.slice(-11), bytes]);
      });

      const [nextCodec, nextBattery, nextFeatures, nextLed, nextMic] = await Promise.all([
        omi.getAudioCodec(),
        omi.getBatteryLevel(),
        omi.getFeatures(),
        omi.getLedDimRatio(),
        omi.getMicGain(),
      ]);

      setCodec(nextCodec);
      setBatteryLevel(nextBattery >= 0 ? nextBattery : null);
      setFeaturesValue(nextFeatures);
      setLedDimRatio(nextLed);
      setMicGain(nextMic);
    } catch (error) {
      setStatusMessage(`Connection error: ${String(error)}`);
    }
  };

  const disconnect = async () => {
    buttonSubRef.current?.remove();
    buttonSubRef.current = null;
    await omi.disconnect();
    setConnectedDevice(null);
    resetDeviceState();
    setStatusMessage('Disconnected');
  };

  const refreshStorage = async () => {
    try {
      const status = await omi.getStorageStatus();
      setStorageStatus(status);
      if (status && status.fileCount > 0) {
        setStorageFiles(await omi.listStorageFiles());
      } else {
        setStorageFiles([]);
      }
    } catch (error) {
      Alert.alert('Storage Error', String(error));
    }
  };

  const deleteFirstStorageFile = async () => {
    const first = storageFiles[0];
    if (!first) return;
    const ok = await omi.deleteStorageFile(first.index);
    setStatusMessage(ok ? `Deleted storage file #${first.index}` : `Failed to delete file #${first.index}`);
    if (ok) {
      await refreshStorage();
    }
  };

  const playHaptic = async () => {
    const ok = await omi.playHaptic(1);
    setStatusMessage(ok ? 'Played haptic' : 'Haptic failed');
  };

  const saveSelfHostedConfig = async () => {
    try {
      await Promise.all([
        AsyncStorage.setItem('omi.selfHosted.apiBaseUrl', apiBaseUrl),
        AsyncStorage.setItem('omi.selfHosted.agentWsUrl', agentWsUrl),
      ]);
      setStatusMessage('Saved self-hosted endpoint config');
    } catch (error) {
      setStatusMessage(`Failed to save self-host config: ${String(error)}`);
    }
  };

  const resetSelfHostedConfig = async () => {
    const defaultApi = 'http://127.0.0.1:8080/';
    const defaultWs = 'ws://127.0.0.1:8080/v1/agent/ws';
    setApiBaseUrl(defaultApi);
    setAgentWsUrl(defaultWs);
    try {
      await Promise.all([
        AsyncStorage.setItem('omi.selfHosted.apiBaseUrl', defaultApi),
        AsyncStorage.setItem('omi.selfHosted.agentWsUrl', defaultWs),
      ]);
      setStatusMessage('Reset self-hosted endpoint config');
    } catch (error) {
      setStatusMessage(`Failed to reset self-host config: ${String(error)}`);
    }
  };

  const adjustLed = async (ratio: number) => {
    const ok = await omi.setLedDimRatio(ratio);
    if (ok) setLedDimRatio(ratio);
  };

  const adjustMic = async (gain: number) => {
    const ok = await omi.setMicGain(gain);
    if (ok) setMicGain(gain);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Omi Pendant</Text>
        <Text style={styles.subtitle}>A cleaner pendant-first app shell on top of the RN SDK.</Text>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Status</Text>
          <Text style={[styles.heroValue, { color: statusTone }]}>{statusMessage}</Text>
          <Text style={styles.heroMeta}>
            Bluetooth: {bluetoothState} • Permission: {permissionGranted ? 'granted' : 'pending'}
          </Text>
          <View style={styles.row}>
            <PrimaryButton title={scanning ? 'Scanning…' : 'Scan'} onPress={scan} />
            <SecondaryButton title="Disconnect" onPress={disconnect} disabled={!connectedDevice} />
          </View>
        </View>

        <Section title="Devices">
          {devices.length === 0 ? <Muted>No devices found yet.</Muted> : null}
          {devices.map((device) => (
            <Pressable key={device.id} style={styles.deviceCard} onPress={() => void connectToDevice(device)}>
              <Text style={styles.deviceName}>{device.name || 'Unnamed device'}</Text>
              <Text style={styles.deviceMeta}>{device.id}</Text>
              <Text style={styles.deviceMeta}>RSSI {device.rssi} dBm</Text>
            </Pressable>
          ))}
        </Section>

        <Section title="Overview">
          <KeyValue label="Connected" value={connectedDevice?.name || connectedDevice?.id || 'none'} />
          <KeyValue label="Codec" value={codec || 'unknown'} />
          <KeyValue label="Battery" value={batteryLevel != null ? `${batteryLevel}%` : 'unknown'} />
          <KeyValue label="Features" value={String(featuresValue)} />
        </Section>

        <Section title="Controls">
          <View style={styles.rowWrap}>
            <PrimaryButton title="Sync Time" onPress={() => omi.syncTime()} disabled={!connectedDevice} />
            <PrimaryButton title="Refresh Storage" onPress={refreshStorage} disabled={!connectedDevice} />
            <PrimaryButton title="Haptic" onPress={playHaptic} disabled={!connectedDevice} />
            <SecondaryButton title="Delete First File" onPress={deleteFirstStorageFile} disabled={!storageFiles.length} />
          </View>
        </Section>

        <Section title="Settings">
          <KeyValue label="LED Dim" value={ledDimRatio != null ? `${ledDimRatio}` : 'n/a'} />
          <View style={styles.rowWrap}>
            <SecondaryButton title="LED 0" onPress={() => adjustLed(0)} disabled={!connectedDevice} />
            <SecondaryButton title="LED 50" onPress={() => adjustLed(50)} disabled={!connectedDevice} />
            <SecondaryButton title="LED 100" onPress={() => adjustLed(100)} disabled={!connectedDevice} />
          </View>
          <View style={styles.spacer} />
          <KeyValue label="Mic Gain" value={micGain != null ? `${micGain}` : 'n/a'} />
          <View style={styles.rowWrap}>
            <SecondaryButton title="Mic 0" onPress={() => adjustMic(0)} disabled={!connectedDevice} />
            <SecondaryButton title="Mic 50" onPress={() => adjustMic(50)} disabled={!connectedDevice} />
            <SecondaryButton title="Mic 100" onPress={() => adjustMic(100)} disabled={!connectedDevice} />
          </View>
        </Section>

        <Section title="Storage">
          <KeyValue label="Used" value={storageStatus ? `${storageStatus.totalUsedBytes} bytes` : 'n/a'} />
          <KeyValue label="Files" value={storageStatus ? `${storageStatus.fileCount}` : '0'} />
          {storageFiles.length === 0 ? <Muted>No storage files loaded.</Muted> : null}
          {storageFiles.map((file) => (
            <View key={`${file.index}-${file.timestamp}`} style={styles.inlineItem}>
              <Text style={styles.inlinePrimary}>#{file.index}</Text>
              <Text style={styles.inlineSecondary}>ts {file.timestamp} • {file.sizeBytes} bytes</Text>
            </View>
          ))}
        </Section>

        <Section title="Recent Button Events">
          {buttonEvents.length === 0 ? <Muted>No button events yet.</Muted> : null}
          {buttonEvents.map((event, index) => (
            <Text key={index} style={styles.codeLine}>{JSON.stringify(event)}</Text>
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.keyValueRow}>
      <Text style={styles.keyLabel}>{label}</Text>
      <Text style={styles.keyValue}>{value}</Text>
    </View>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

function PrimaryButton({ title, onPress, disabled }: { title: string; onPress: () => void | Promise<void>; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={() => void onPress()} style={[styles.button, styles.primaryButton, disabled && styles.buttonDisabled]}>
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

function SecondaryButton({ title, onPress, disabled }: { title: string; onPress: () => void | Promise<void>; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={() => void onPress()} style={[styles.button, styles.secondaryButton, disabled && styles.buttonDisabled]}>
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    color: THEME.text,
    fontSize: 30,
    fontWeight: '700',
  },
  subtitle: {
    color: THEME.subtext,
    fontSize: 15,
  },
  heroCard: {
    backgroundColor: THEME.panel,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  heroLabel: {
    color: THEME.subtext,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  heroMeta: {
    color: THEME.subtext,
    fontSize: 13,
  },
  section: {
    backgroundColor: THEME.panel,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
  },
  primaryButton: {
    backgroundColor: '#0ea5e9',
  },
  secondaryButton: {
    backgroundColor: THEME.panelAlt,
    borderWidth: 1,
    borderColor: '#334155',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: THEME.text,
    fontWeight: '600',
  },
  deviceCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: THEME.panelAlt,
    gap: 4,
  },
  deviceName: {
    color: THEME.text,
    fontWeight: '600',
  },
  deviceMeta: {
    color: THEME.subtext,
    fontSize: 12,
  },
  keyValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  keyLabel: {
    color: THEME.subtext,
  },
  keyValue: {
    color: THEME.text,
    fontWeight: '600',
  },
  muted: {
    color: THEME.subtext,
  },
  inlineItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  inlinePrimary: {
    color: THEME.text,
    fontWeight: '600',
  },
  inlineSecondary: {
    color: THEME.subtext,
    fontSize: 12,
  },
  codeLine: {
    color: '#cbd5e1',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
  },
  spacer: {
    height: 4,
  },
});
