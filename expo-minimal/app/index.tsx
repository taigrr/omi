import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import base64 from 'react-native-base64';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStoredAppState, DEFAULT_AGENT_WS_URL, DEFAULT_API_BASE_URL, normalizeBaseUrl, type RecordingItem } from '@/hooks/useAppState';
import { useOmiBle } from '@/hooks/useOmiBle';
import { useOmiQueries } from '@/hooks/useOmiQueries';

const THEME = {
  bg: '#0f172a',
  panel: '#111827',
  panelAlt: '#1f2937',
  text: '#f8fafc',
  subtext: '#94a3b8',
  accent: '#38bdf8',
  ok: '#22c55e',
  warn: '#f59e0b',
};

const RECORDINGS_DIR = new FileSystem.Directory(FileSystem.Paths.document, 'omi-recordings');

export default function HomeScreen() {
  const ble = useOmiBle();
  const { batteryQuery, featuresQuery, storageStatusQuery, connectMutation, refreshDeviceState } = useOmiQueries(ble);
  const {
    configQuery,
    recordingsQuery,
    saveConfigMutation,
    resetConfigMutation,
    persistRecordingsMutation,
    backendHealthMutation,
    uploadPickedFileMutation,
  } = useStoredAppState();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [status, setStatus] = useState('idle');
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [agentWsUrl, setAgentWsUrl] = useState(DEFAULT_AGENT_WS_URL);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [recordingsVisible, setRecordingsVisible] = useState(false);
  const [currentPlaybackId, setCurrentPlaybackId] = useState<string | null>(null);
  const [storageSummary, setStorageSummary] = useState('unknown');
  const [featureSummary, setFeatureSummary] = useState('unknown');

  useEffect(() => {
    RECORDINGS_DIR.create({ idempotent: true, intermediates: true });
    void ble.requestPermissions();

    return () => {
      void unloadSound();
    };
  }, [ble]);

  useEffect(() => {
    if (configQuery.data) {
      setApiBaseUrl(configQuery.data.apiBaseUrl);
      setAgentWsUrl(configQuery.data.agentWsUrl);
    }
  }, [configQuery.data]);

  useEffect(() => {
    if (recordingsQuery.data) {
      setRecordings(recordingsQuery.data);
    }
  }, [recordingsQuery.data]);

  const saveConfig = useCallback(async () => {
    try {
      await saveConfigMutation.mutateAsync({ apiBaseUrl, agentWsUrl });
      setStatus('saved backend config');
    } catch (error) {
      setStatus(`failed to save config: ${String(error)}`);
    }
  }, [agentWsUrl, apiBaseUrl, saveConfigMutation]);

  const resetConfig = useCallback(async () => {
    setApiBaseUrl(DEFAULT_API_BASE_URL);
    setAgentWsUrl(DEFAULT_AGENT_WS_URL);
    try {
      await resetConfigMutation.mutateAsync();
      setStatus('reset backend config');
    } catch (error) {
      setStatus(`failed to reset config: ${String(error)}`);
    }
  }, [resetConfigMutation]);

  const checkBackend = useCallback(async () => {
    try {
      const result = await backendHealthMutation.mutateAsync({ apiBaseUrl });
      setStatus(result.ok ? `backend ok: ${result.body}` : `backend failed: ${result.status}`);
    } catch (error) {
      setStatus(`backend failed: ${String(error)}`);
    }
  }, [apiBaseUrl, backendHealthMutation]);

  const uploadFileToSelfhost = useCallback(async () => {
    try {
      const result = await uploadPickedFileMutation.mutateAsync({ apiBaseUrl });
      if (result.cancelled) {
        setStatus('upload cancelled');
        return;
      }
      if (!result.ok) {
        setStatus(`upload failed: ${result.text}`);
        return;
      }
      setStatus('uploaded file to selfhost backend');
    } catch (error) {
      setStatus(`upload error: ${String(error)}`);
    }
  }, [apiBaseUrl, uploadPickedFileMutation]);

  const unloadSound = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setCurrentPlaybackId(null);
  }, []);

  const playRecording = useCallback(async (recording: RecordingItem) => {
    try {
      if (currentPlaybackId === recording.id) {
        await unloadSound();
        setStatus('stopped playback');
        return;
      }

      await unloadSound();
      const { sound } = await Audio.Sound.createAsync({ uri: recording.localUri }, { shouldPlay: true });
      soundRef.current = sound;
      setCurrentPlaybackId(recording.id);
      sound.setOnPlaybackStatusUpdate((playbackStatus) => {
        if (!playbackStatus.isLoaded) return;
        if (playbackStatus.didJustFinish) {
          void unloadSound();
        }
      });
      setStatus(`playing recording ${recording.fileIndex}`);
    } catch (error) {
      setStatus(`playback failed: ${String(error)}`);
    }
  }, [currentPlaybackId, unloadSound]);

  const uploadRecording = useCallback(async (recording: RecordingItem) => {
    try {
      const form = new FormData();
      form.append('files', {
        uri: recording.localUri,
        name: `recording-${recording.fileIndex}.wav`,
        type: 'audio/wav',
      } as never);

      const response = await fetch(`${normalizeBaseUrl(apiBaseUrl)}v1/sync-local-files`, {
        method: 'POST',
        body: form,
      });
      const text = await response.text();
      if (!response.ok) {
        setStatus(`recording upload failed: ${text}`);
        return;
      }

      const next = recordings.map((item) => item.id === recording.id ? { ...item, uploadedAt: Date.now() } : item);
      await persistRecordingsMutation.mutateAsync(next);
      setStatus(`uploaded recording ${recording.fileIndex}`);
    } catch (error) {
      setStatus(`recording upload error: ${String(error)}`);
    }
  }, [apiBaseUrl, recordings, persistRecordingsMutation]);

  const syncRecordingsDown = useCallback(async () => {
    try {
      if (!ble.connectedDevice) {
        setStatus('connect to pendant first');
        return;
      }

      const features = await ble.getFeatures();
      const offlineStorageEnabled = (features & (1 << 6)) !== 0;
      setFeatureSummary(offlineStorageEnabled ? `0x${features.toString(16)} (offline storage enabled)` : `0x${features.toString(16)} (offline storage not enabled)`);

      const storageStatus = await ble.getStorageStatus();
      if (!storageStatus || storageStatus.fileCount === 0) {
        setStorageSummary('0 files on pendant');
        setStatus(offlineStorageEnabled ? 'no recordings on pendant' : 'offline storage not enabled on pendant firmware');
        return;
      }

      setStorageSummary(`${storageStatus.fileCount} files, ${storageStatus.totalUsedBytes} bytes`);
      const remoteFiles = await ble.listStorageFiles();
      const existingIds = new Set(recordings.map((item) => item.id));
      const nextRecordings = [...recordings];

      for (const file of remoteFiles) {
        const id = `${file.index}-${file.timestamp}-${file.sizeBytes}`;
        if (existingIds.has(id)) {
          continue;
        }

        const downloaded = await ble.downloadStorageFile(file.index, file.sizeBytes);
        const wavBytes = buildWavFile(downloaded.frames.flat(), 8000, 1, 8);
        const localFile = new FileSystem.File(RECORDINGS_DIR, `${id}.wav`);
        localFile.create({ overwrite: true });
        localFile.write(bytesToBase64(wavBytes), { encoding: 'base64' });
        const localUri = localFile.uri;

        nextRecordings.unshift({
          id,
          fileIndex: file.index,
          timestamp: file.timestamp,
          sizeBytes: file.sizeBytes,
          localUri,
          uploadedAt: null,
        });
        existingIds.add(id);
      }

      await persistRecordingsMutation.mutateAsync(nextRecordings.sort((a, b) => b.timestamp - a.timestamp));
      setStatus(`synced ${remoteFiles.length} recording(s) from pendant`);
    } catch (error) {
      setStatus(`recording sync failed: ${String(error)}`);
    }
  }, [ble, persistRecordingsMutation, recordings]);

  const uploadPendingRecordings = useCallback(async () => {
    const pending = recordings.filter((item) => !item.uploadedAt);
    if (pending.length === 0) {
      setStatus('no pending recordings to upload');
      return;
    }

    for (const recording of pending) {
      // eslint-disable-next-line no-await-in-loop
      await uploadRecording(recording);
    }
  }, [recordings, uploadRecording]);

  const permissionLabel = useMemo(() => (ble.hasPermissions ? 'granted' : 'missing'), [ble.hasPermissions]);

  useEffect(() => {
    if (batteryQuery.data != null) {
      // battery is also mirrored in BLE hook state through monitor/read
    }
    if (featuresQuery.data != null) {
      const offlineStorageEnabled = (featuresQuery.data & (1 << 6)) !== 0;
      setFeatureSummary(offlineStorageEnabled ? `0x${featuresQuery.data.toString(16)} (offline storage enabled)` : `0x${featuresQuery.data.toString(16)} (offline storage not enabled)`);
    }
    if (storageStatusQuery.data) {
      setStorageSummary(`${storageStatusQuery.data.fileCount} files, ${storageStatusQuery.data.totalUsedBytes} bytes`);
    }
  }, [batteryQuery.data, featuresQuery.data, storageStatusQuery.data]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Omi Minimal</Text>
        <Text style={styles.subtitle}>Pendant-first Expo app with BLE, storage sync, and self-host config.</Text>

        <Section title="Status">
          <KeyValue label="App" value={status} />
          <KeyValue label="BLE permissions" value={permissionLabel} />
          <KeyValue label="Connected" value={ble.connectedDevice?.name ?? ble.connectedDevice?.localName ?? 'none'} />
          <KeyValue label="Battery" value={ble.battery != null ? `${ble.battery}%` : 'unknown'} />
          <KeyValue label="Features" value={featureSummary} />
          <KeyValue label="Pendant storage" value={storageSummary} />
          <View style={styles.rowWrap}>
            <PrimaryButton title={ble.hasPermissions ? (ble.isScanning ? 'Scanning…' : 'Scan') : 'Grant BLE'} onPress={async () => {
              if (ble.hasPermissions) {
                await ble.startScan();
                return;
              }
              await ble.requestPermissions();
            }} />
            <SecondaryButton title="Stop" onPress={() => ble.stopScan()} />
            <SecondaryButton title="Open system settings" onPress={() => Linking.openSettings()} />
            <PrimaryButton title="Sync Time" onPress={async () => {
              await ble.syncTime();
              setStatus('time synced');
            }} />
          </View>
        </Section>

        <Section title="Devices">
          {ble.devices.length === 0 ? <Muted>No matching BLE devices yet.</Muted> : null}
          {ble.devices.map((device) => (
            <Pressable
              key={device.id}
              onPress={async () => {
                const connected = await connectMutation.mutateAsync(device.id);
                await refreshDeviceState();
                setStatus(`connected to ${connected.name ?? connected.localName ?? connected.id}`);
              }}
              style={styles.deviceCard}>
              <Text style={styles.deviceName}>{device.name || device.localName || 'Unnamed device'}</Text>
              <Text style={styles.deviceMeta}>{device.id}</Text>
            </Pressable>
          ))}
        </Section>

        <Section title="Recordings">
          <KeyValue label="In app" value={`${recordings.length}`} />
          <KeyValue label="Pending upload" value={`${recordings.filter((item) => !item.uploadedAt).length}`} />
          <View style={styles.rowWrap}>
            <PrimaryButton title="Sync recordings" onPress={syncRecordingsDown} />
            <PrimaryButton title="Upload pending" onPress={uploadPendingRecordings} />
            <SecondaryButton title={recordingsVisible ? 'Hide recordings' : 'Show recordings'} onPress={() => setRecordingsVisible((prev) => !prev)} />
          </View>
          {recordingsVisible ? (
            <View style={styles.recordingsPanel}>
              {recordings.length === 0 ? <Muted>No recordings downloaded yet.</Muted> : null}
              {recordings.map((recording) => (
                <View key={recording.id} style={styles.recordingCard}>
                  <View style={styles.recordingMeta}>
                    <Text style={styles.deviceName}>Recording #{recording.fileIndex}</Text>
                    <Text style={styles.deviceMeta}>{new Date(recording.timestamp * 1000).toLocaleString()}</Text>
                    <Text style={styles.deviceMeta}>{recording.sizeBytes} bytes, {recording.uploadedAt ? 'uploaded' : 'pending upload'}</Text>
                  </View>
                  <View style={styles.rowWrap}>
                    <SecondaryButton title={currentPlaybackId === recording.id ? 'Stop' : 'Play'} onPress={() => playRecording(recording)} />
                    <PrimaryButton title="Upload" onPress={() => uploadRecording(recording)} />
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </Section>

        <Section title="Backend settings">
          <TextInput
            style={styles.input}
            value={apiBaseUrl}
            onChangeText={setApiBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={DEFAULT_API_BASE_URL}
            placeholderTextColor={THEME.subtext}
          />
          <TextInput
            style={styles.input}
            value={agentWsUrl}
            onChangeText={setAgentWsUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={DEFAULT_AGENT_WS_URL}
            placeholderTextColor={THEME.subtext}
          />
          <KeyValue label="Backend health" value={backendHealthMutation.data ? (backendHealthMutation.data.ok ? 'healthy' : `error ${backendHealthMutation.data.status}`) : 'unknown'} />
          <KeyValue label="Last upload" value={uploadPickedFileMutation.data ? (uploadPickedFileMutation.data.cancelled ? 'cancelled' : uploadPickedFileMutation.data.text || 'uploaded') : 'none'} />
          <View style={styles.rowWrap}>
            <SecondaryButton title="Use localhost" onPress={() => {
              setApiBaseUrl(DEFAULT_API_BASE_URL);
              setAgentWsUrl(DEFAULT_AGENT_WS_URL);
            }} />
            <SecondaryButton title="Use LAN sample" onPress={() => {
              setApiBaseUrl('http://192.168.1.10:8080/');
              setAgentWsUrl('ws://192.168.1.10:8080/v1/agent/ws');
            }} />
            <PrimaryButton title="Save endpoints" onPress={saveConfig} />
            <SecondaryButton title="Reset" onPress={resetConfig} />
            <PrimaryButton title="Check backend" onPress={checkBackend} />
            <PrimaryButton title="Upload file" onPress={uploadFileToSelfhost} />
          </View>
        </Section>

        <Section title="Recent button events">
          {ble.buttonEvents.length === 0 ? <Muted>No button events yet.</Muted> : null}
          {ble.buttonEvents.map((event, idx) => (
            <Text key={idx} style={styles.codeLine}>{JSON.stringify(event)}</Text>
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

function buildWavFile(samples: number[], sampleRate: number, channels: number, bitDepth: number) {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new Uint8Array(44 + dataSize);
  const view = new DataView(buffer.buffer);

  writeAscii(buffer, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(buffer, 8, 'WAVE');
  writeAscii(buffer, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(buffer, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i += 1) {
    buffer[44 + i] = samples[i] ?? 0;
  }

  return buffer;
}

function writeAscii(target: Uint8Array, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) {
    target[offset + i] = text.charCodeAt(i);
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return base64.encode(binary);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  title: {
    color: THEME.text,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: THEME.subtext,
    fontSize: 14,
  },
  section: {
    backgroundColor: THEME.panel,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '600',
  },
  keyValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  keyLabel: {
    color: THEME.subtext,
    flex: 1,
  },
  keyValue: {
    color: THEME.text,
    flex: 1,
    textAlign: 'right',
  },
  muted: {
    color: THEME.subtext,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  primaryButton: {
    backgroundColor: THEME.accent,
  },
  secondaryButton: {
    backgroundColor: THEME.panelAlt,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: THEME.text,
    fontWeight: '600',
  },
  deviceCard: {
    backgroundColor: THEME.panelAlt,
    borderRadius: 12,
    padding: 12,
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
  input: {
    backgroundColor: THEME.panelAlt,
    color: THEME.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  codeLine: {
    color: THEME.text,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  recordingsPanel: {
    gap: 10,
    maxHeight: 360,
  },
  recordingCard: {
    backgroundColor: THEME.panelAlt,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  recordingMeta: {
    gap: 4,
  },
});
