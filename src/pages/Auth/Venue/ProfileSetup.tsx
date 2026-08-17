import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Upload, 
  CheckCircle, 
  ArrowRight,
  Lock,
  ImageIcon,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { VenuePreset, getDefaultModulesForPreset } from '@/config/venueModules';
import VenueOnboardingShell from '@/components/Venue/VenueOnboardingShell';
import './venue-profile-status.css';

type VenueWritePayload = Database['public']['Tables']['venues']['Insert'] & {
  minimum_entry_age: number | null;
  entry_control_policy: string | null;
  security_operation_mode: string | null;
};

interface OperatingHour {
  day: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

function formatOperatingHours(value: unknown) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';

  const firstOpenDay = value.find((entry): entry is OperatingHour => (
    typeof entry === 'object'
    && entry !== null
    && typeof (entry as OperatingHour).openTime === 'string'
    && typeof (entry as OperatingHour).closeTime === 'string'
    && !(entry as OperatingHour).isClosed
  ));

  return firstOpenDay ? `${firstOpenDay.openTime} - ${firstOpenDay.closeTime}` : '';
}

function parseTime(value: string) {
  const twentyFourHour = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1]);
    const minute = Number(twentyFourHour[2]);
    if (hour <= 23 && minute <= 59) return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }

  const twelveHour = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!twelveHour) return null;

  let hour = Number(twelveHour[1]);
  const minute = Number(twelveHour[2] || '0');
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (twelveHour[3].toLowerCase() === 'pm' && hour !== 12) hour += 12;
  if (twelveHour[3].toLowerCase() === 'am' && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function normalizeOperatingHours(value: unknown, summary: string) {
  const storedSummary = formatOperatingHours(value).trim();
  if (Array.isArray(value) && (!summary.trim() || summary.trim() === storedSummary)) {
    const rows = value.flatMap((entry) => {
      const hour = entry as Partial<OperatingHour>;
      if (!Number.isInteger(hour.day) || !hour.openTime || !hour.closeTime || hour.day! < 0 || hour.day! > 6) return [];

      return [{
        day_of_week: hour.day!,
        open_time: hour.openTime,
        close_time: hour.closeTime,
        is_closed: Boolean(hour.isClosed),
      }];
    });

    if (rows.length) return rows;
  }

  const [openValue, closeValue] = summary.split(/\s*[-\u2013]\s*/, 2);
  const openTime = openValue ? parseTime(openValue) : null;
  const closeTime = closeValue ? parseTime(closeValue) : null;
  if (!openTime || !closeTime) return [];

  return Array.from({ length: 7 }, (_, day_of_week) => ({
    day_of_week,
    open_time: openTime,
    close_time: closeTime,
    is_closed: false,
  }));
}

async function compressImageToDataUrl(file: File, maxSizePx = 768): Promise<string> {
  const fileToDataUrl = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(f);
    });

  const src = await fileToDataUrl(file);

  // Try to downscale/compress to reduce payload size (base64 can be huge)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Failed to load image'));
    i.src = src;
  });

  const ratio = Math.min(1, maxSizePx / Math.max(img.width || 1, img.height || 1));
  const targetW = Math.max(1, Math.round((img.width || 1) * ratio));
  const targetH = Math.max(1, Math.round((img.height || 1) * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return src;

  ctx.drawImage(img, 0, 0, targetW, targetH);

  // JPEG keeps payload small; good enough for logos in this flow.
  return canvas.toDataURL('image/jpeg', 0.85);
}

export default function VenueProfileSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReferencePresentation = searchParams.get('source') === 'reference';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  // Get data from previous steps
  const [venueName, setVenueName] = useState('');
  const [publicAddress, setPublicAddress] = useState('');
  const [operatingHours, setOperatingHours] = useState('');

  useEffect(() => {
    const storedVenueName = localStorage.getItem('jv_venue_name');
    if (storedVenueName) setVenueName(storedVenueName);

    const venueDataStr = localStorage.getItem('jv_venue_data');
    if (!venueDataStr) return;

    try {
      const venueData = JSON.parse(venueDataStr);
      setPublicAddress(venueData.publicAddress || venueData.venueAddress || venueData.address || venueData.detectedAddress || '');
      setOperatingHours(venueData.operatingHoursText || formatOperatingHours(venueData.operatingHours));
    } catch (error) {
      console.warn('[VenueProfileSetup] Failed to read venue data:', error);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Logo must be less than 10MB');
        return;
      }
      
      setIsUploading(true);
      compressImageToDataUrl(file)
        .then((dataUrl) => {
          setLogo(dataUrl);
          toast.success('Venue logo uploaded!');
        })
        .catch((err) => {
          console.error('Logo processing failed:', err);
          toast.error('Failed to process logo. Please try a smaller image.');
        })
        .finally(() => {
          setIsUploading(false);
        });
    }
  };

  const handleComplete = async () => {
    const address = publicAddress.trim();
    if (!address) {
      toast.error('Please add your public address');
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Authentication error. Please log in again.');
        setIsSubmitting(false);
        navigate('/auth');
        return;
      }
       
       // Verify auth session
       const { data: { session } } = await supabase.auth.getSession();
       if (!session) {
         console.error('No active session found');
         toast.error('Session expired. Please log in again.');
         setIsSubmitting(false);
         navigate('/venue/signup');
         return;
       }
       
       console.log('Authenticated user:', user.id);
       console.log('Session active:', !!session);

      // Get venue data from localStorage
      const venueDataStr = localStorage.getItem('jv_venue_data');
      const venueData = venueDataStr ? JSON.parse(venueDataStr) : {};
      const updatedVenueData = {
        ...venueData,
        venueAddress: address,
        publicAddress: address,
        operatingHoursText: operatingHours.trim(),
      };
      localStorage.setItem('jv_venue_data', JSON.stringify(updatedVenueData));

      const { data: existingVenue } = await supabase
        .from('venues')
        .select('id, image_url')
        .eq('owner_user_id', user.id)
        .maybeSingle();
      
      // Geocode the address to get latitude/longitude
      let latitude: number | null = null;
      let longitude: number | null = null;
      
      if (address) {
        try {
          const { data: geoData, error: geoError } = await supabase.functions.invoke('geocode-address', {
            body: { address }
          });
          
          if (!geoError && geoData?.latitude && geoData?.longitude) {
            latitude = geoData.latitude;
            longitude = geoData.longitude;
            console.log('Geocoded venue address:', { latitude, longitude });
          } else {
            console.warn('Could not geocode address:', address);
          }
        } catch (err) {
          console.error('Geocoding failed:', err);
        }
      }

      const venuePayload: VenueWritePayload = {
        name: venueName || venueData.venueName || 'Unnamed Venue',
        owner_user_id: user.id,
        address,
        city: venueData.city || null,
        venue_type: venueData.venueType || null,
        business_license: venueData.businessLicense || null,
        business_email: venueData.businessEmail || null,
        image_url: logo || existingVenue?.image_url || null,
        approval_status: 'approved',
        registration_step: 'complete',
        verified_at: new Date().toISOString(),
        description: venueData.description || null,
        latitude,
        longitude,
        // NOTE: `venue_setup_type` is constrained in the DB to:
        // ['permanent', 'mobile', 'temporary', 'home_based'].
        // The UI's `setupMode` is 'basic' | 'full' and should NOT be stored here.
        // Default to 'permanent' (or infer mobile for food trucks).
        venue_setup_type:
          venueData.venueType === 'food_truck'
            ? 'mobile'
            : 'permanent',
        staff_size: venueData.staffSize || null,
        country: venueData.country || null,
        minimum_entry_age: typeof venueData.minimumEntryAge === 'number' ? venueData.minimumEntryAge : null,
        entry_control_policy: venueData.entryControlPolicy || null,
        security_operation_mode: venueData.securityOperationMode || null,
      };

      console.log('Venue payload being submitted:', {
        ...venuePayload,
        image_url: venuePayload.image_url ? `[base64 image, ${venuePayload.image_url.length} chars]` : null
      });

      let venueResult: { id: string } | null = null;
      let venueError: { message: string } | null = null;

      if (existingVenue) {
        // Update the existing row with full data + mark complete
        const { data, error } = await supabase
          .from('venues')
          // Entry-policy columns are present in the migration but missing from stale generated types.
          .update(venuePayload as Database['public']['Tables']['venues']['Update'])
          .eq('owner_user_id', user.id)
          .select('id')
          .single();
        venueResult = data;
        venueError = error as { message: string } | null;
      } else {
        // No row yet (fresh registration) — insert
        const { data, error } = await supabase
          .from('venues')
          .insert(venuePayload as Database['public']['Tables']['venues']['Insert'])
          .select('id')
          .single();
        venueResult = data;
        venueError = error as { message: string } | null;
      }

      const error = venueError;
      if (error) {
        console.error('Error saving venue:', error);
        if (!error.message.includes('duplicate')) {
          toast.error('Failed to submit venue registration');
          setIsComplete(false);
          setIsSubmitting(false);
          return;
        }
      }

      // Ensure venue_modules is created with the FULL preset flags.
      // Use UPSERT to avoid race conditions (e.g. if the modules context initializes first).
      let venueIdForModules = venueResult?.id ?? existingVenue?.id ?? null;
      if (!venueIdForModules) {
        // Fallback: query latest venue for this owner (handles duplicate/refresh edge-cases)
        const { data: fallbackVenue, error: fallbackError } = await supabase
          .from('venues')
          .select('id')
          .eq('owner_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!fallbackError && fallbackVenue?.id) {
          venueIdForModules = fallbackVenue.id;
        }
      }

      if (venueIdForModules) {
        const preset = (venueData.venuePreset as VenuePreset) || 'full_suite';
        const presetModules = getDefaultModulesForPreset(preset);

        const { error: modulesError } = await supabase
          .from('venue_modules')
          .upsert(
            {
              venue_id: venueIdForModules,
              preset,
              ...presetModules,
              analytics_level: preset === 'full_suite' ? 'full' : 'basic',
              home_orb_config: {},
            },
            { onConflict: 'venue_id' }
          );

        if (modulesError) {
          console.error('Error upserting venue modules:', modulesError);
          // Non-fatal - the owner can still adjust modules later via Settings.
        }

        const operatingHourRows = normalizeOperatingHours(venueData.operatingHours, operatingHours.trim());
        if (operatingHourRows.length) {
          const { error: operatingHoursError } = await supabase
            .from('venue_operating_hours')
            .upsert(
              operatingHourRows.map((row) => ({ ...row, venue_id: venueIdForModules! })),
              { onConflict: 'venue_id,day_of_week' },
            );

          if (operatingHoursError) {
            console.warn('Error saving venue operating hours:', operatingHoursError);
          }
        }
      }

      // Show success and redirect
      toast.success('Venue registered successfully! Welcome to Joint Vibe.');
      setIsComplete(true);
      if (logo) {
        localStorage.setItem('jv_venue_logo', logo);
      } else {
        localStorage.removeItem('jv_venue_logo');
      }
      localStorage.setItem('jv_venue_profile_setup', 'complete');
      localStorage.setItem('jv_current_venue_name', venuePayload.name);
      if (venueIdForModules) localStorage.setItem('jv_current_venue_id', venueIdForModules);

    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to submit venue registration');
      setIsComplete(false);
      setIsSubmitting(false);
      return;
    }

    // Navigate — check for Founders Pass interstitial first
    setTimeout(() => {
      navigate(isReferencePresentation ? '/venue/complete?source=reference' : '/venue/complete');
    }, 1500);
  };

  // DEV MODE: create a minimal approved venue row so the guard passes, then go home
  const handleSkipDevMode = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('No session. Please sign in again.');
        navigate('/auth');
        return;
      }

      // Check if a venue row already exists for this user
      const { data: existing } = await supabase
        .from('venues')
        .select('id, name')
        .eq('owner_user_id', user.id)
        .maybeSingle();

      if (existing) {
        // Venue already exists — mark complete and proceed
        await supabase
          .from('venues')
          .update({ registration_step: 'complete', approval_status: 'approved' })
          .eq('owner_user_id', user.id);
        localStorage.setItem('jv_current_venue_id', existing.id);
        localStorage.setItem('jv_current_venue_name', existing.name);
        navigate('/venue/home');
        return;
      }

      // No venue yet — create a minimal one so the guard passes
      const storedName = localStorage.getItem('jv_venue_name') || 'My Venue';
      const venueDataStr = localStorage.getItem('jv_venue_data');
      const venueData = venueDataStr ? JSON.parse(venueDataStr) : {};

      const { data: created, error } = await supabase
        .from('venues')
        .insert({
          name: storedName,
          owner_user_id: user.id,
          approval_status: 'approved',
          venue_setup_type: 'permanent',
          registration_step: 'complete',
          description: 'Dev mode skip registration',
        })
        .select('id')
        .single();

      if (error) {
        console.error('[DevSkip] Failed to create venue:', error);
        toast.error('Could not create dev venue. Try completing the form.');
        return;
      }

      // Bootstrap venue_modules so the dashboard loads
      const preset: VenuePreset = (venueData.venuePreset as VenuePreset) || 'full_suite';
      await supabase.from('venue_modules').upsert(
        {
          venue_id: created.id,
          preset,
          ...getDefaultModulesForPreset(preset),
          analytics_level: 'full',
          home_orb_config: {},
        },
        { onConflict: 'venue_id' }
      );

      localStorage.setItem('jv_current_venue_id', created.id);
      localStorage.setItem('jv_current_venue_name', storedName);
      localStorage.setItem('jv_venue_profile_setup', 'complete');
      navigate('/venue/home');
    } catch (err) {
      console.error('[DevSkip] Error:', err);
      toast.error('Dev skip failed. Please complete the form.');
    }
  };

  return (
    <VenueOnboardingShell step={7} backTo={isReferencePresentation ? "/venue/facial-recognition?source=reference" : "/venue/facial-recognition"} wide>
      <section className="venue-onboarding-card venue-onboarding-card--form venue-profile-setup">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon">
            {isComplete ? <CheckCircle aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
          </div>
          <h1>{isComplete ? "Venue profile created" : "Complete your venue profile"}</h1>
          <p>{isComplete ? "Setting up your venue workspace now." : "Add the details guests will see before they visit."}</p>
        </div>

        {!isComplete ? (
          <form
            className="venue-onboarding-form venue-profile-setup__form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleComplete();
            }}
          >
            <div className="venue-profile-setup__logo-section">
              <button
                className="venue-profile-setup__logo-preview"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                aria-label={logo ? "Change venue logo" : "Upload venue logo"}
              >
                {logo ? <img src={logo} alt="Venue logo preview" /> : <><ImageIcon aria-hidden="true" /><span>Add logo</span></>}
                {isUploading && <span className="venue-profile-setup__logo-loading"><span className="venue-onboarding-spinner" aria-hidden="true" /></span>}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} hidden />
              <button className="venue-onboarding-button venue-onboarding-button--secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                <Upload aria-hidden="true" />
                <span>{logo ? "Change logo" : "Upload logo"}</span>
              </button>
              <p className="venue-profile-setup__upload-note"><Info aria-hidden="true" />Optional. Square PNG or JPG, up to 10MB.</p>
            </div>

            {!isReferencePresentation && (
              <div className="venue-onboarding-field">
                <label htmlFor="venue-profile-name">Venue name</label>
                <div className="venue-onboarding-input venue-profile-setup__readonly-input">
                  <input id="venue-profile-name" value={venueName} readOnly />
                  <Lock aria-hidden="true" />
                </div>
              </div>
            )}

            <div className="venue-onboarding-field">
              <label htmlFor="venue-profile-address">Public address</label>
              <textarea
                className="venue-profile-setup__textarea"
                id="venue-profile-address"
                rows={3}
                value={publicAddress}
                onChange={(event) => setPublicAddress(event.target.value)}
                placeholder="123 Main Street, Austin, TX 78701"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="venue-onboarding-field">
              <label htmlFor="venue-profile-hours">Operating hours</label>
              <div className="venue-onboarding-input">
                <input
                  id="venue-profile-hours"
                  value={operatingHours}
                  onChange={(event) => setOperatingHours(event.target.value)}
                  placeholder="6:00 PM - 2:00 AM"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <button className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <span className="venue-onboarding-spinner" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              <span>{isSubmitting ? "Creating venue..." : "Complete profile"}</span>
            </button>

            {!isReferencePresentation && (
              <div className="venue-onboarding-actions">
                <button type="button" onClick={() => void handleSkipDevMode()} disabled={isSubmitting || isUploading}>Skip for now (Dev Mode)</button>
              </div>
            )}
          </form>
        ) : (
          <div className="venue-profile-setup__completion" role="status">
            <span className="venue-onboarding-spinner" aria-hidden="true" />
            <span>Preparing your dashboard...</span>
          </div>
        )}
      </section>
    </VenueOnboardingShell>
  );
}
