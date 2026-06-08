import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  bambuEmail: string;
  bambuUserId: string;
  bambuAccessToken: string;
  bambuTokenExpiry: string;
  proxyUrl: string;

  setBambuCredentials: (creds: {
    email: string;
    userId: string;
    accessToken: string;
    tokenExpiry: string;
  }) => void;
  clearBambuCredentials: () => void;
  setProxyUrl: (url: string) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      bambuEmail: '',
      bambuUserId: '',
      bambuAccessToken: '',
      bambuTokenExpiry: '',
      proxyUrl: '',

      setBambuCredentials: ({ email, userId, accessToken, tokenExpiry }) =>
        set({ bambuEmail: email, bambuUserId: userId, bambuAccessToken: accessToken, bambuTokenExpiry: tokenExpiry }),

      clearBambuCredentials: () =>
        set({ bambuEmail: '', bambuUserId: '', bambuAccessToken: '', bambuTokenExpiry: '' }),

      setProxyUrl: (url) => set({ proxyUrl: url }),
    }),
    { name: 'tactile-settings' }
  )
);
