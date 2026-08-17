import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import i18n from '@/lib/i18n';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cacheUserCoords } from '@/lib/userCountry';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName?: string, options?: { emailRedirectTo?: string }) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  hasRole: (role: 'admin' | 'manager' | 'staff' | 'kitchen') => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth');
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // CRITICAL: On sign-out, clear the shared language cache so the next
        // user logging into this browser doesn't inherit the previous user's
        // language preference. Each account must have its own language state.
        if (event === 'SIGNED_OUT') {
          try {
            localStorage.removeItem('jv_language');
          } catch {}
        }

        // Sync profile location to localStorage for Founders Pass gating
        if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          setTimeout(async () => {
            try {
              // CRITICAL: On sign-in, force-load this user's language from the
              // database (the only per-user source of truth). This guarantees
              // that switching accounts in the same browser, or returning to
              // an account after using another, always restores the correct
              // per-user language and never bleeds across accounts.
              if (event === 'SIGNED_IN') {
                try {
                  const { data: langProfile } = await supabase
                    .from('profiles')
                    .select('language')
                    .eq('user_id', session.user.id)
                    .maybeSingle();
                  const dbLang = langProfile?.language as string | undefined;
                  if (dbLang && dbLang !== i18n.language) {
                    await i18n.changeLanguage(dbLang);
                    try { localStorage.setItem('jv_language', dbLang); } catch {}
                  } else if (dbLang) {
                    try { localStorage.setItem('jv_language', dbLang); } catch {}
                  }
                } catch (langErr) {
                  console.error('[Auth] Failed to apply per-user language on sign-in:', langErr);
                }
              }

              const { data: profile } = await supabase
                .from('customer_profiles')
                .select('location, latitude, longitude, country_code, currency, founders_pass_dismissed')
                .eq('user_id', session.user.id)
                .maybeSingle();

              if (profile?.founders_pass_dismissed) {
                localStorage.setItem('jv_founders_shown_user', 'dismissed');
              }

              if (profile?.country_code) {
                localStorage.setItem('jv_user_country_code', profile.country_code);
                localStorage.setItem('jv_signup_country', profile.country_code);
              }
              if (profile?.currency) {
                localStorage.setItem('jv_display_currency', profile.currency);
                localStorage.setItem('jv_user_currency', profile.currency);
              }

              if (profile?.location) {
                const parts = profile.location.split(', ');
                if (parts.length >= 2) {
                  const country = parts.slice(1).join(', ').trim();
                  localStorage.setItem('jv_user_country', country);
                }
              }

              // Cache profile coords for client-side proximity biasing (geocoding, etc.)
              if (profile?.latitude != null && profile?.longitude != null) {
                cacheUserCoords({ lat: profile.latitude, lng: profile.longitude });
              }

              // Use proximity matching via edge function
              if (profile?.latitude != null && profile?.longitude != null) {
                try {
                  const { data: matchData, error: fnError } = await supabase.functions.invoke(
                    'find-nearest-city-product',
                    { body: { lat: profile.latitude, lng: profile.longitude, passType: 'user' } }
                  );
                  if (!fnError && matchData?.match) {
                    localStorage.setItem('jv_user_city_slug', matchData.match.slug);
                    localStorage.setItem('jv_founders_distance_tier', matchData.match.distanceTier);
                    localStorage.setItem('jv_founders_nearest_city', matchData.match.city);
                  }
                } catch (e2) {
                  console.error('[Auth] Proximity match failed:', e2);
                }
              }
            } catch (e) {
              console.error('[Auth] Failed to sync profile location:', e);
            }
          }, 0);
        }
      }
    );

    // Check for existing session and apply language
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Language sync handled by useUserLanguage + LanguageInitializer (single source of truth)
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    console.log('[Auth] Attempting sign in for:', email);
    const { error, data } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.error('[Auth] Sign in error:', error.message, error.status, error);
      toast.error(`Sign in failed: ${error.message}`);
    } else {
      console.log('[Auth] Sign in success, user:', data.user?.id);
      toast.success('Signed in successfully!');
    }
    
    return { error };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName?: string,
    options?: { emailRedirectTo?: string },
  ) => {
    const redirectUrl = options?.emailRedirectTo ?? `${window.location.origin}/user/verify-email`;
    
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        }
      }
    });

    if (error) {
      toast.error(error.message);
      return { error };
    }

    const isRepeatedSignup = Array.isArray(data.user?.identities) && data.user.identities.length === 0;
    if (isRepeatedSignup) {
      const repeatedSignupError = { message: 'This email already has an account. Sign in instead of signing up again.' };
      toast.error(repeatedSignupError.message);
      return { error: repeatedSignupError };
    }

    // Create profile (skip for venue and advertiser signups - they have their own flows)
    const userType = localStorage.getItem('jv_user_type');
    const skipProfile = userType === 'venue' || userType === 'advertiser';
    
    if (data.user && !skipProfile) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: data.user.id,
          full_name: fullName,
          onboarding_step: 'email_pending',
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
      }

      // Assign default staff role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: data.user.id,
          role: 'staff',
        });

      if (roleError) {
        console.error('Error assigning role:', roleError);
      }
    }

    toast.success('Account created successfully!');
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Signed out successfully');
    }
  };

  const hasRole = async (role: 'admin' | 'manager' | 'staff' | 'kitchen'): Promise<boolean> => {
    if (!user) return false;
    
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', role)
      .single();
    
    return !!data;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
