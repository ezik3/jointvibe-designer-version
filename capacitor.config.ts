import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.2832b44b03b148dc9403dce95f9cbd2b',
  appName: 'nocturne-pos',
  webDir: 'dist',
  server: {
    url: 'https://2832b44b-03b1-48dc-9403-dce95f9cbd2b.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    CapacitorNfc: {
      // iOS requires NFC entitlement in Xcode
    }
  }
};

export default config;
