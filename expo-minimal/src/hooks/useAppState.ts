import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type RecordingItem = {
  id: string;
  fileIndex: number;
  timestamp: number;
  sizeBytes: number;
  localUri: string;
  uploadedAt: number | null;
};

export const STORAGE_KEYS = {
  apiBaseUrl: 'omi.selfHosted.apiBaseUrl',
  agentWsUrl: 'omi.selfHosted.agentWsUrl',
  recordings: 'omi.recordings.items',
};

export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8080/';
export const DEFAULT_AGENT_WS_URL = 'ws://127.0.0.1:8080/v1/agent/ws';

export function normalizeBaseUrl(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

export function useStoredAppState() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['omi', 'config'],
    queryFn: async () => {
      const [savedApiBaseUrl, savedAgentWsUrl] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.apiBaseUrl),
        AsyncStorage.getItem(STORAGE_KEYS.agentWsUrl),
      ]);
      return {
        apiBaseUrl: savedApiBaseUrl ?? DEFAULT_API_BASE_URL,
        agentWsUrl: savedAgentWsUrl ?? DEFAULT_AGENT_WS_URL,
      };
    },
    staleTime: Infinity,
  });

  const recordingsQuery = useQuery({
    queryKey: ['omi', 'recordings'],
    queryFn: async () => {
      const savedRecordings = await AsyncStorage.getItem(STORAGE_KEYS.recordings);
      return savedRecordings ? (JSON.parse(savedRecordings) as RecordingItem[]) : [];
    },
    staleTime: Infinity,
  });

  const saveConfigMutation = useMutation({
    mutationFn: async ({ apiBaseUrl, agentWsUrl }: { apiBaseUrl: string; agentWsUrl: string }) => {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.apiBaseUrl, apiBaseUrl),
        AsyncStorage.setItem(STORAGE_KEYS.agentWsUrl, agentWsUrl),
      ]);
      return { apiBaseUrl, agentWsUrl };
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(['omi', 'config'], data);
    },
  });

  const resetConfigMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.apiBaseUrl, DEFAULT_API_BASE_URL),
        AsyncStorage.setItem(STORAGE_KEYS.agentWsUrl, DEFAULT_AGENT_WS_URL),
      ]);
      return { apiBaseUrl: DEFAULT_API_BASE_URL, agentWsUrl: DEFAULT_AGENT_WS_URL };
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(['omi', 'config'], data);
    },
  });

  const persistRecordingsMutation = useMutation({
    mutationFn: async (next: RecordingItem[]) => {
      await AsyncStorage.setItem(STORAGE_KEYS.recordings, JSON.stringify(next));
      return next;
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(['omi', 'recordings'], data);
    },
  });

  const backendHealthMutation = useMutation({
    mutationFn: async ({ apiBaseUrl }: { apiBaseUrl: string }) => {
      const response = await fetch(`${normalizeBaseUrl(apiBaseUrl)}v1/health`);
      const body = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    },
  });

  const uploadPickedFileMutation = useMutation({
    mutationFn: async ({ apiBaseUrl }: { apiBaseUrl: string }) => {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return { cancelled: true } as const;

      const asset = picked.assets[0];
      const form = new FormData();
      form.append('files', {
        uri: asset.uri,
        name: asset.name || 'upload.bin',
        type: asset.mimeType || 'application/octet-stream',
      } as never);

      const response = await fetch(`${normalizeBaseUrl(apiBaseUrl)}v1/sync-local-files`, {
        method: 'POST',
        body: form,
      });
      const text = await response.text();
      return {
        cancelled: false,
        ok: response.ok,
        status: response.status,
        text,
      } as const;
    },
  });

  return {
    configQuery,
    recordingsQuery,
    saveConfigMutation,
    resetConfigMutation,
    persistRecordingsMutation,
    backendHealthMutation,
    uploadPickedFileMutation,
  };
}
