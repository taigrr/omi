import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useOmiBle } from '@/hooks/useOmiBle';

export default function HomeScreen() {
  const ble = useOmiBle();
  const [status, setStatus] = useState('idle');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={{ color: 'white', fontSize: 28, fontWeight: '700' }}>Omi Minimal</Text>
        <Text style={{ color: '#94a3b8' }}>Pendant-first Expo prototype.</Text>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button title={ble.isScanning ? 'Scanning…' : 'Scan'} onPress={() => ble.startScan()} />
          <Button title="Stop" onPress={() => ble.stopScan()} />
          <Button title="Sync Time" onPress={async () => { await ble.syncTime(); setStatus('time synced'); }} />
        </View>

        <View style={{ padding: 16, backgroundColor: '#111827', borderRadius: 16, gap: 8 }}>
          <Text style={{ color: 'white', fontSize: 18, fontWeight: '600' }}>Connection</Text>
          <Text style={{ color: '#cbd5e1' }}>Status: {status}</Text>
          <Text style={{ color: '#cbd5e1' }}>Connected: {ble.connectedDevice?.name ?? ble.connectedDevice?.localName ?? 'none'}</Text>
          <Text style={{ color: '#cbd5e1' }}>Battery: {ble.battery ?? 'unknown'}</Text>
        </View>

        <View style={{ padding: 16, backgroundColor: '#111827', borderRadius: 16, gap: 8 }}>
          <Text style={{ color: 'white', fontSize: 18, fontWeight: '600' }}>Discovered devices</Text>
          {ble.devices.map((device) => (
            <Pressable
              key={device.id}
              onPress={async () => {
                const connected = await ble.connect(device);
                await ble.monitorBattery();
                await ble.monitorButton();
                setStatus(`connected to ${connected.name ?? connected.localName ?? connected.id}`);
              }}
              style={{ padding: 12, backgroundColor: '#1f2937', borderRadius: 12 }}>
              <Text style={{ color: 'white' }}>{device.name || device.localName || 'Unnamed device'}</Text>
              <Text style={{ color: '#94a3b8', fontSize: 12 }}>{device.id}</Text>
            </Pressable>
          ))}
          {ble.devices.length === 0 ? <Text style={{ color: '#94a3b8' }}>No matching BLE devices yet.</Text> : null}
        </View>

        <View style={{ padding: 16, backgroundColor: '#111827', borderRadius: 16, gap: 8 }}>
          <Text style={{ color: 'white', fontSize: 18, fontWeight: '600' }}>Recent button events</Text>
          {ble.buttonEvents.length === 0 ? <Text style={{ color: '#94a3b8' }}>No button events yet.</Text> : null}
          {ble.buttonEvents.map((event, idx) => (
            <Text key={idx} style={{ color: '#cbd5e1', fontFamily: 'Courier' }}>{JSON.stringify(event)}</Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Button({ title, onPress }: { title: string; onPress: () => void | Promise<void> }) {
  return (
    <Pressable onPress={() => void onPress()} style={{ backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 }}>
      <Text style={{ color: 'white', fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}
