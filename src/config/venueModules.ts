// Venue Module Configuration
// Defines presets and module mappings for adaptive venue UI

export type VenuePreset = 'quick_sell' | 'counter_service' | 'full_suite';
export type AnalyticsLevel = 'basic' | 'full';

export interface VenueModules {
  orders: boolean;
  pos: boolean;
  menu: boolean;
  payments: boolean;
  kitchen: boolean;
  deliveries: boolean;
  reservations: boolean;
  tables: boolean;
  floorplan: boolean;
  inventory: boolean;
  analytics_level: AnalyticsLevel;
  staff: boolean;
  wallet: boolean;
  ai_assistant: boolean;
  messaging: boolean;
  push_deals: boolean;
}

export interface VenueModulesRecord extends VenueModules {
  id: string;
  venue_id: string;
  preset: VenuePreset;
  home_orb_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PresetConfig {
  name: string;
  description: string;
  icon: string;
  color: string;
  modules: VenueModules;
  navItems: string[];
  posNavItems: string[];
  homeOrbs: string[];
}

// Preset configurations
export const venuePresets: Record<VenuePreset, PresetConfig> = {
  quick_sell: {
    name: 'Quick Sell',
    description: 'Street Stall / Food Truck / Solo Vendor',
    icon: 'Zap',
    color: 'green',
    modules: {
      orders: true,
      pos: true,
      menu: true,
      payments: true,
      wallet: true,
      analytics_level: 'basic',
      push_deals: true,
      messaging: true,
      ai_assistant: true,
      kitchen: false,
      deliveries: false,
      reservations: false,
      tables: false,
      floorplan: false,
      inventory: false,
      staff: false,
    },
    navItems: ['Home', 'Menu', 'Orders', 'Wallet', 'Notifications', 'Settings'],
    posNavItems: ['Dashboard', 'New Order', 'Orders', 'Menu', 'Analytics', 'Settings'],
    homeOrbs: ['pos', 'orders', 'wallet', 'push_deals', 'messages', 'ai_assistant'],
  },
  counter_service: {
    name: 'Counter Service',
    description: 'Cafe / Takeaway / Bakery',
    icon: 'Coffee',
    color: 'blue',
    modules: {
      orders: true,
      pos: true,
      menu: true,
      payments: true,
      kitchen: true,
      wallet: true,
      analytics_level: 'basic',
      push_deals: true,
      messaging: true,
      ai_assistant: true,
      staff: true,
      deliveries: false,
      reservations: false,
      tables: false,
      floorplan: false,
      inventory: false,
    },
    navItems: ['Home', 'Menu', 'Orders', 'Wallet', 'Assign', 'Notifications', 'Settings'],
    posNavItems: ['Dashboard', 'New Order', 'Orders', 'Kitchen', 'Menu', 'Staff', 'Analytics', 'Settings'],
    homeOrbs: ['pos', 'orders', 'kitchen', 'wallet', 'push_deals', 'messages'],
  },
  full_suite: {
    name: 'Full Suite',
    description: 'Restaurant / Bar / Venue',
    icon: 'Building2',
    color: 'purple',
    modules: {
      orders: true,
      pos: true,
      menu: true,
      payments: true,
      kitchen: true,
      deliveries: true,
      reservations: true,
      tables: true,
      floorplan: true,
      inventory: true,
      analytics_level: 'full',
      staff: true,
      wallet: true,
      ai_assistant: true,
      messaging: true,
      push_deals: true,
    },
    navItems: ['Home', 'Menu', 'Orders', 'Reservations', 'Deliveries', 'Wallet', 'Assign', 'Notifications', 'Messages', 'Account', 'Settings'],
    posNavItems: ['Dashboard', 'New Order', 'Orders', 'Kitchen', 'Menu', 'Tables', 'Floorplan', 'Inventory', 'Analytics', 'Staff', 'Settings'],
    homeOrbs: ['orders', 'deliveries', 'kitchen', 'tables', 'messages', 'ai_assistant', 'wallet', 'push_deals'],
  },
};

// Module to nav item mapping
export const moduleNavMapping: Record<string, { venueNav?: string; posNav?: string; icon: string }> = {
  orders: { venueNav: 'Orders', posNav: 'Orders', icon: 'ShoppingCart' },
  menu: { venueNav: 'Menu', posNav: 'Menu', icon: 'Menu' },
  kitchen: { posNav: 'Kitchen', icon: 'ChefHat' },
  deliveries: { venueNav: 'Deliveries', icon: 'Truck' },
  reservations: { venueNav: 'Reservations', icon: 'CalendarDays' },
  tables: { posNav: 'Tables', icon: 'Table2' },
  floorplan: { posNav: 'Floorplan', icon: 'LayoutDashboard' },
  inventory: { posNav: 'Inventory', icon: 'Package' },
  staff: { venueNav: 'Assign', posNav: 'Staff', icon: 'Users' },
  wallet: { venueNav: 'Wallet', icon: 'CreditCard' },
  messaging: { venueNav: 'Messages', icon: 'MessageSquare' },
};

// Always visible nav items (regardless of modules)
export const alwaysVisibleVenueNav = ['Home', 'Notifications', 'Account', 'Settings'];
export const alwaysVisiblePOSNav = ['Dashboard', 'New Order', 'Analytics', 'Settings'];

// Orb configurations
export const orbConfigs: Record<string, { label: string; icon: string; route: string; module?: string }> = {
  pos: { label: 'Open POS', icon: 'Monitor', route: '/venue/pos/new-order' },
  orders: { label: 'Live Orders', icon: 'ShoppingCart', route: '/venue/orders', module: 'orders' },
  kitchen: { label: 'Kitchen', icon: 'ChefHat', route: '/venue/pos/kitchen', module: 'kitchen' },
  deliveries: { label: 'Deliveries', icon: 'Truck', route: '/venue/deliveries', module: 'deliveries' },
  tables: { label: 'Tables', icon: 'Table2', route: '/venue/pos/tables', module: 'tables' },
  wallet: { label: 'Wallet', icon: 'Wallet', route: '/venue/wallet', module: 'wallet' },
  messages: { label: 'Messages', icon: 'MessageSquare', route: '/venue/messages', module: 'messaging' },
  ai_assistant: { label: 'AI Assistant', icon: 'Bot', route: '/venue/home', module: 'ai_assistant' },
  push_deals: { label: 'Push Deal', icon: 'Megaphone', route: '/venue/wallet', module: 'push_deals' },
  reservations: { label: 'Reservations', icon: 'CalendarDays', route: '/venue/reservations', module: 'reservations' },
};

// Helper to get default modules for a preset
export function getDefaultModulesForPreset(preset: VenuePreset): VenueModules {
  return { ...venuePresets[preset].modules };
}

// Helper to suggest preset based on user answers
export function suggestPreset(hasDelivery: boolean, hasReservations: boolean): VenuePreset {
  if (hasReservations) {
    return 'full_suite';
  }
  if (hasDelivery) {
    return 'counter_service';
  }
  return 'quick_sell';
}
