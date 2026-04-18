declare module 'react-native-base64' {
  const base64: {
    encode(input: string): string;
    decode(input: string): string;
    encodeFromByteArray(input: number[] | Uint8Array): string;
  };
  export default base64;
}
