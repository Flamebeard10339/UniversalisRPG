import type { CapacitorConfig } from '@capacitor/cli';

const isDev = process.env.NODE_ENV !== 'production';

const config: CapacitorConfig = {
  appId: 'org.universalis.rpg',
  appName: 'UniversalisRPG',
  webDir: 'dist',
  ...(isDev && {
    server: {
      url: 'http://10.0.2.2:5173',
      cleartext: true,
    },
  }),
};

export default config;
