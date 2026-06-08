import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  bambuEmail: string;
  bambuUserId: string;
  bambuAccessToken: string;
  bambuRefreshToken: string;
  bambuTokenExpiry: string;
  proxyUrl: string;

  setBambuCredentials: (creds: {
    email: string;
    userId: string;
    accessToken: string;
    refreshToken: string;
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
      bambuRefreshToken: '',
      bambuTokenExpiry: '',
      proxyUrl: '',

      setBambuCredentials: ({ email, userId, accessToken, refreshToken, tokenExpiry }) =>
        set({ bambuEmail: email, bambuUserId: userId, bambuAccessToken: accessToken, bambuRefreshToken: refreshToken, bambuTokenExpiry: tokenExpiry }),

      clearBambuCredentials: () =>
        set({ bambuEmail: '', bambuUserId: '', bambuAccessToken: '', bambuRefreshToken: '', bambuTokenExpiry: '' }),

      setProxyUrl: (url) => set({ proxyUrl: url }),
    }),
    { name: 'tactile-settings' }
  )
);
