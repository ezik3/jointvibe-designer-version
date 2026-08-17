import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { 
  VenueModulesRecord, 
  VenuePreset, 
  venuePresets, 
  orbConfigs,
  alwaysVisibleVenueNav,
  alwaysVisiblePOSNav,
  moduleNavMapping,
  getDefaultModulesForPreset
} from '@/config/venueModules';

interface VenueModulesContextType {
  modules: VenueModulesRecord | null;
  loading: boolean;
  error: string | null;
  venueId: string | null;
  preset: VenuePreset;
  isModuleEnabled: (moduleName: string) => boolean;
  getEnabledVenueNavItems: () => string[];
  getEnabledPOSNavItems: () => string[];
  getEnabledOrbs: () => string[];
  enableModule: (moduleName: string) => Promise<void>;
  disableModule: (moduleName: string) => Promise<void>;
  changePreset: (preset: VenuePreset) => Promise<void>;
  updateOrbConfig: (config: Record<string, unknown>) => Promise<void>;
  refetch: () => Promise<void>;
}

const VenueModulesContext = createContext<VenueModulesContextType | undefined>(undefined);

export function VenueModulesProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('venue');
  const { user } = useAuth();
  const [modules, setModules] = useState<VenueModulesRecord | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModules = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // First get the venue for this user
      const { data: venue, error: venueError } = await supabase
        .from('venues')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle();

      if (venueError) throw venueError;
      
      if (!venue) {
        setLoading(false);
        return;
      }

      setVenueId(venue.id);

      // Then get the modules for this venue
      const { data: modulesData, error: modulesError } = await supabase
        .from('venue_modules')
        .select('*')
        .eq('venue_id', venue.id)
        .maybeSingle();

      if (modulesError) throw modulesError;

      if (modulesData) {
        setModules(modulesData as VenueModulesRecord);
      } else {
        // IMPORTANT:
        // Do NOT auto-create a full_suite record here.
        // During onboarding, the venue_modules row is created with the selected preset.
        // Auto-creating full_suite can race the onboarding insert and lead to wrong modules.
        setModules(null);
      }
    } catch (err) {
      console.error('Error fetching venue modules:', err);
      setError(err instanceof Error ? err.message : 'Failed to load venue modules');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const isModuleEnabled = useCallback((moduleName: string): boolean => {
    if (!modules) return true; // Default to enabled if not loaded
    
    // Special handling for analytics
    if (moduleName === 'analytics') {
      return true; // Always show analytics, level determines features
    }
    
    // Type-safe module check
    const moduleKey = moduleName as keyof typeof modules;
    return modules[moduleKey] === true;
  }, [modules]);

  const getEnabledVenueNavItems = useCallback((): string[] => {
    if (!modules) return venuePresets.full_suite.navItems;

    const enabledItems = new Set<string>(alwaysVisibleVenueNav);
    
    // Add items based on enabled modules
    Object.entries(moduleNavMapping).forEach(([module, config]) => {
      if (config.venueNav && isModuleEnabled(module)) {
        enabledItems.add(config.venueNav);
      }
    });

    // Return in a sensible order
    const orderedItems = ['Home', 'Menu', 'Orders', 'Reservations', 'Deliveries', 'Wallet', 'Assign', 'Notifications', 'Messages', 'Account', 'Settings'];
    return orderedItems.filter(item => enabledItems.has(item));
  }, [modules, isModuleEnabled]);

  const getEnabledPOSNavItems = useCallback((): string[] => {
    if (!modules) return venuePresets.full_suite.posNavItems;

    const enabledItems = new Set<string>(alwaysVisiblePOSNav);
    
    // Add items based on enabled modules
    Object.entries(moduleNavMapping).forEach(([module, config]) => {
      if (config.posNav && isModuleEnabled(module)) {
        enabledItems.add(config.posNav);
      }
    });

    // Return in a sensible order
    const orderedItems = ['Dashboard', 'New Order', 'Orders', 'Kitchen', 'Menu', 'Tables', 'Floorplan', 'Inventory', 'Analytics', 'Staff', 'Settings'];
    return orderedItems.filter(item => enabledItems.has(item));
  }, [modules, isModuleEnabled]);

  const getEnabledOrbs = useCallback((): string[] => {
    if (!modules) return venuePresets.full_suite.homeOrbs;

    // Use custom orb config if available
    if (modules.home_orb_config && Object.keys(modules.home_orb_config).length > 0) {
      const config = modules.home_orb_config as { orbs?: string[] };
      if (config.orbs) {
        return config.orbs.filter(orbKey => {
          const orb = orbConfigs[orbKey];
          return !orb?.module || isModuleEnabled(orb.module);
        });
      }
    }

    // Default orbs based on preset
    const presetConfig = venuePresets[modules.preset as VenuePreset] || venuePresets.full_suite;
    return presetConfig.homeOrbs.filter(orbKey => {
      const orb = orbConfigs[orbKey];
      return !orb?.module || isModuleEnabled(orb.module);
    });
  }, [modules, isModuleEnabled]);

  const updateModule = async (updates: Record<string, unknown>) => {
    if (!venueId || !modules) return;

    const { error: updateError } = await supabase
      .from('venue_modules')
      .update(updates)
      .eq('venue_id', venueId);

    if (updateError) throw updateError;

    setModules(prev => prev ? { ...prev, ...updates } as VenueModulesRecord : null);
  };

  const enableModule = async (moduleName: string) => {
    await updateModule({ [moduleName]: true } as Partial<VenueModulesRecord>);
  };

  const disableModule = async (moduleName: string) => {
    await updateModule({ [moduleName]: false } as Partial<VenueModulesRecord>);
  };

  const changePreset = async (newPreset: VenuePreset) => {
    const presetModules = getDefaultModulesForPreset(newPreset);
    await updateModule({ 
      preset: newPreset, 
      ...presetModules,
      home_orb_config: {} // Reset to default orbs for new preset
    });
  };

  const updateOrbConfig = async (config: Record<string, unknown>) => {
    await updateModule({ home_orb_config: config });
  };

  const value: VenueModulesContextType = {
    modules,
    loading,
    error,
    venueId,
    preset: (modules?.preset as VenuePreset) || 'full_suite',
    isModuleEnabled,
    getEnabledVenueNavItems,
    getEnabledPOSNavItems,
    getEnabledOrbs,
    enableModule,
    disableModule,
    changePreset,
    updateOrbConfig,
    refetch: fetchModules,
  };

  return (
    <VenueModulesContext.Provider value={value}>
      {children}
    </VenueModulesContext.Provider>
  );
}

export function useVenueModules() {
  const context = useContext(VenueModulesContext);
  if (context === undefined) {
    throw new Error('useVenueModules must be used within a VenueModulesProvider');
  }
  return context;
}

// Standalone hook for simpler use cases (doesn't throw if outside provider)
export function useVenueModulesOptional() {
  return useContext(VenueModulesContext);
}
