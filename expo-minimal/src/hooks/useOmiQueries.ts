import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useOmiBle } from '@/hooks/useOmiBle';

export function useOmiQueries(ble: ReturnType<typeof useOmiBle>) {
  const queryClient = useQueryClient();

  const batteryQuery = useQuery({
    queryKey: ['omi', 'battery', ble.connectedDevice?.id],
    queryFn: async () => ble.readBattery(),
    enabled: Boolean(ble.connectedDevice),
  });

  const featuresQuery = useQuery({
    queryKey: ['omi', 'features', ble.connectedDevice?.id],
    queryFn: async () => ble.getFeatures(),
    enabled: Boolean(ble.connectedDevice),
  });

  const storageStatusQuery = useQuery({
    queryKey: ['omi', 'storage-status', ble.connectedDevice?.id],
    queryFn: async () => ble.getStorageStatus(),
    enabled: Boolean(ble.connectedDevice),
  });

  const connectMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const device = ble.devices.find((item) => item.id === deviceId);
      if (!device) throw new Error('Device not found');
      const connected = await ble.connect(device);
      await ble.monitorBattery(connected);
      await ble.monitorButton(connected);
      return connected;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['omi', 'battery'] }),
        queryClient.invalidateQueries({ queryKey: ['omi', 'features'] }),
        queryClient.invalidateQueries({ queryKey: ['omi', 'storage-status'] }),
      ]);
    },
  });

  const refreshDeviceState = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['omi', 'battery'] }),
      queryClient.invalidateQueries({ queryKey: ['omi', 'features'] }),
      queryClient.invalidateQueries({ queryKey: ['omi', 'storage-status'] }),
    ]);
  }, [queryClient]);

  return {
    batteryQuery,
    featuresQuery,
    storageStatusQuery,
    connectMutation,
    refreshDeviceState,
  };
}
