export function useNFCScanner() {
  return {
    isSupported: false,
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
    isScanning: false,
    startScanning: () => {},
    stopScanning: () => {},
    lastResult: null as string | null,
    error: 'Web NFC API is not supported on iOS. Use NFC Tools app to write tags.',
  };
}
