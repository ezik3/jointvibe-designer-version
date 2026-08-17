import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  Camera, 
  Upload, 
  CheckCircle, 
  ArrowRight,
  Lock,
  ImageIcon,
  MapPin,
  Navigation
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { advanceOnboardingStep } from '@/utils/onboarding';
import CameraCapture from '@/components/Camera/CameraCapture';
import UserOnboardingShell from '@/components/User/UserOnboardingShell';
import { getCountryByCode, getCountryByName, isCountryEnabled } from '@/config/countries';
import { useTranslation } from 'react-i18next';
import './user-onboarding-flow.css';

function getErrorCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'number' ? code : undefined;
}

export default function UserProfileSetup() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [bgMobile, setBgMobile] = useState<string | null>(null);
  const [bgDesktop, setBgDesktop] = useState<string | null>(null);
  const [isUploadingBgMobile, setIsUploadingBgMobile] = useState(false);
  const [isUploadingBgDesktop, setIsUploadingBgDesktop] = useState(false);
  const bgMobileInputRef = useRef<HTMLInputElement>(null);
  const bgDesktopInputRef = useRef<HTMLInputElement>(null);
  
  // Location state populated by geolocation only.
  const [locationDetected, setLocationDetected] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [detectedCountry, setDetectedCountry] = useState('');
  const [detectedCountryCode, setDetectedCountryCode] = useState('');
  const [detectedState, setDetectedState] = useState('');
  const [detectedCity, setDetectedCity] = useState('');
  const [detectedSuburb, setDetectedSuburb] = useState('');
  const [detectedLat, setDetectedLat] = useState<number | null>(null);
  const [detectedLng, setDetectedLng] = useState<number | null>(null);

  // Get name from ID verification (stored in localStorage)
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  useEffect(() => {
    const storedName = localStorage.getItem('jv_verified_name');
    const storedDob = localStorage.getItem('jv_verified_dob');
    if (storedName) setFullName(storedName);
    if (storedDob) setDateOfBirth(storedDob);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      
      setIsUploading(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result as string);
        setIsUploading(false);
        toast.success('Profile photo uploaded!');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = (imageData: string) => {
    setProfileImage(imageData);
    setShowCamera(false);
    toast.success('Photo captured!');
  };

  const handleDetectLocation = async () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setDetectingLocation(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
      );

      const { latitude, longitude } = position.coords;
      setDetectedLat(latitude);
      setDetectedLng(longitude);

      // Call geocode edge function with coordinates
      const { data, error } = await supabase.functions.invoke('geocode-address', {
        body: { address: `${latitude},${longitude}` },
      });

      if (error || !data?.success) {
        toast.error('Could not determine your location. Please try again.');
        setDetectingLocation(false);
        return;
      }

      // Populate location fields
      setDetectedCountry(data.country || '');
      setDetectedState(data.state || '');
      setDetectedCity(data.city || '');
      setDetectedSuburb(data.suburb || '');

      // Resolve country code
      let resolvedCode = '';
      if (data.countryCode) {
        resolvedCode = data.countryCode;
      } else if (data.country) {
        const countryConfig = getCountryByName(data.country);
        resolvedCode = countryConfig?.code || '';
      }

      // Check if detected country is enabled on the platform
      if (resolvedCode && !isCountryEnabled(resolvedCode)) {
        const countryName = getCountryByCode(resolvedCode)?.name || data.country || resolvedCode;
        toast.error(`${countryName} is not yet available on the platform. We're working on expanding to more regions soon!`);
        setDetectingLocation(false);
        return;
      }

      setDetectedCountryCode(resolvedCode);
      setLocationDetected(true);
      toast.success('Location detected successfully!');
    } catch (err: unknown) {
      const errorCode = getErrorCode(err);
      if (errorCode === 1) {
        toast.error('Location access denied. Please enable location services to continue.');
      } else if (errorCode === 2) {
        toast.error('Location unavailable. Please try again.');
      } else if (errorCode === 3) {
        toast.error('Location request timed out. Please try again.');
      } else {
        toast.error('Failed to detect location. Please try again.');
      }
    } finally {
      setDetectingLocation(false);
    }
  };

  const handleComplete = async () => {
    if (!profileImage) {
      toast.error('Please add a profile photo');
      return;
    }
    
    if (!locationDetected) {
      toast.error('Please use "Use My Current Location" to verify your location');
      return;
    }

    setIsComplete(true);
    localStorage.setItem('jv_profile_picture', profileImage);
    localStorage.setItem('jv_profile_setup', 'complete');
    
    // Store country code + currency
    const countryConfig = getCountryByCode(detectedCountryCode);
    const defaultCurrency = countryConfig?.currency || 'USD';
    localStorage.setItem('jv_user_country', detectedCountryCode);
    localStorage.setItem('jv_user_country_code', detectedCountryCode);
    localStorage.setItem('jv_user_currency', defaultCurrency);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const locationParts = [detectedSuburb, detectedCity, detectedState, detectedCountry].filter(Boolean);
        const locationStr = locationParts.join(', ');
        
        const { data: existingProfile } = await supabase
          .from('customer_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        const profilePayload: Database['public']['Tables']['customer_profiles']['Update'] = {
          display_name: fullName || ('user' + user.id.slice(-8)),
          avatar_url: profileImage,
          selected_background: bgMobile || bgDesktop || null,
          background_mobile: bgMobile || null,
          background_desktop: bgDesktop || null,
          location: locationStr,
          country_code: detectedCountryCode,
          currency: defaultCurrency,
          suburb: detectedSuburb || null,
          city: detectedCity || null,
          state: detectedState || null,
          latitude: detectedLat,
          longitude: detectedLng,
          default_discovery_level: detectedSuburb ? 'suburb' : detectedCity ? 'city' : 'state',
          updated_at: new Date().toISOString()
        };

        if (existingProfile) {
          await supabase
            .from('customer_profiles')
            .update(profilePayload)
            .eq('user_id', user.id);
        } else {
          await supabase
            .from('customer_profiles')
            .insert({
              ...profilePayload,
              user_id: user.id,
            });
        }
      }
    } catch (error) {
      console.error('Error saving profile:', error);
    }

    // Advance onboarding step
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        await advanceOnboardingStep(currentUser.id, 'vibe_selection');
      }
    } catch (e) {
      console.error('Error advancing onboarding step:', e);
    }

    // Use proximity matching to find nearest city product
    if (detectedLat != null && detectedLng != null) {
      try {
        const { data: matchData } = await supabase.functions.invoke(
          'find-nearest-city-product',
          { body: { lat: detectedLat, lng: detectedLng, passType: 'user' } }
        );
        if (matchData?.match) {
          localStorage.setItem('jv_user_city_slug', matchData.match.slug);
          localStorage.setItem('jv_founders_distance_tier', matchData.match.distanceTier);
          localStorage.setItem('jv_founders_nearest_city', matchData.match.city);
        }
      } catch (e) {
        console.error('[ProfileSetup] Proximity match failed:', e);
      }
    }

    setTimeout(() => {
      const citySlug = localStorage.getItem('jv_user_city_slug');
      const alreadyShown = localStorage.getItem('jv_founders_shown_user');
      if (citySlug && alreadyShown !== 'dismissed') {
        navigate('/app/founders/offer');
      } else {
        navigate('/user/vibe-selection');
      }
    }, 2000);
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>, variant: 'mobile' | 'desktop') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    if (isVideo) {
      const duration = await new Promise<number>((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration); };
        video.onerror = () => { URL.revokeObjectURL(video.src); resolve(0); };
        video.src = URL.createObjectURL(file);
      });
      if (duration > 30) { toast.error('Video must be 30 seconds or less'); return; }
    }

    const setLoading = variant === 'mobile' ? setIsUploadingBgMobile : setIsUploadingBgDesktop;
    const setUrl = variant === 'mobile' ? setBgMobile : setBgDesktop;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Not authenticated'); return; }

      const ext = file.name.split('.').pop();
      const path = `backgrounds/${user.id}-${variant}.${ext}`;
      const { error } = await supabase.storage.from('backgrounds').upload(path, file, { upsert: true });
      if (error) { toast.error('Failed to upload background'); return; }

      const { data: urlData } = supabase.storage.from('backgrounds').getPublicUrl(path);
      const url = urlData.publicUrl + '?t=' + Date.now();
      setUrl(url);
      toast.success(`${variant === 'mobile' ? 'Mobile' : 'Desktop'} background uploaded!`);
    } catch {
      toast.error('Failed to upload background');
    } finally {
      setLoading(false);
    }
  };

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handleCameraCapture}
        onClose={() => setShowCamera(false)}
        title="Profile Photo"
        instruction="Smile! Take a photo for your profile"
        facingMode="user"
        overlay="face"
      />
    );
  }

  return (
    <UserOnboardingShell step={5} backTo="/user/facial-recognition" wide>
      <section className="venue-onboarding-card venue-onboarding-card--form user-profile-card">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon">
            {isComplete ? <CheckCircle aria-hidden="true" /> : <User aria-hidden="true" />}
          </div>
          <h1>{isComplete ? 'Profile Created!' : 'Complete Your Profile'}</h1>
          <p>{isComplete ? 'Redirecting to your feed...' : 'Add a profile photo and verify your location'}</p>
        </div>

        {isComplete ? (
          <div className="user-profile-card__complete" role="status">
            <span className="venue-onboarding-spinner" aria-hidden="true" />
            <p>Saving your profile and preparing your next step...</p>
          </div>
        ) : (
          <div className="venue-onboarding-form">
            <div className="user-profile-card__photo-section">
              <button
                className="user-profile-card__photo"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={profileImage ? 'Change profile photo' : 'Upload profile photo'}
              >
                {profileImage ? (
                  <img src={profileImage} alt="Profile photo preview" />
                ) : (
                  <><ImageIcon aria-hidden="true" /><span>Add photo</span></>
                )}
                {isUploading && <span className="user-profile-card__photo-loading"><span className="venue-onboarding-spinner" aria-hidden="true" /></span>}
              </button>

              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} hidden />

              <div className="user-profile-card__photo-actions">
                <button className="venue-onboarding-button venue-onboarding-button--secondary" type="button" onClick={() => fileInputRef.current?.click()}>
                  <Upload aria-hidden="true" />
                  <span>Upload photo</span>
                </button>
                <button className="venue-onboarding-button venue-onboarding-button--secondary" type="button" onClick={() => setShowCamera(true)}>
                  <Camera aria-hidden="true" />
                  <span>Take photo</span>
                </button>
              </div>
            </div>

            <div className="venue-onboarding-field">
              <label htmlFor="profile-full-name">Full name</label>
              <div className="venue-onboarding-input">
                <input id="profile-full-name" value={fullName} readOnly />
                <Lock aria-hidden="true" />
              </div>
              <small>Name is verified from your ID and cannot be changed.</small>
            </div>

            <div className="venue-onboarding-field">
              <label htmlFor="profile-date-of-birth">Date of birth</label>
              <div className="venue-onboarding-input">
                <input id="profile-date-of-birth" value={dateOfBirth} readOnly />
                <Lock aria-hidden="true" />
              </div>
            </div>

            <div className="user-profile-card__divider" />

            <div className="user-profile-card__location-status">
              <div className="user-profile-card__location-heading"><MapPin aria-hidden="true" /><span>Your location</span></div>

              {!locationDetected ? (
                <>
                  <button
                    className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
                    type="button"
                    onClick={() => void handleDetectLocation()}
                    disabled={detectingLocation}
                  >
                    {detectingLocation ? <span className="venue-onboarding-spinner" aria-hidden="true" /> : <Navigation aria-hidden="true" />}
                    <span>{detectingLocation ? 'Detecting your location...' : 'Use my current location'}</span>
                  </button>
                  <small>Location verification is required to complete your profile.</small>
                </>
              ) : (
                <>
                  <div className="user-profile-card__location-result">
                    <div><small>Status</small><span>Location verified</span></div>
                    {detectedCountry && <div><small>Country</small><span>{detectedCountry}</span></div>}
                    {detectedState && <div><small>State</small><span>{detectedState}</span></div>}
                    {detectedCity && <div><small>City</small><span>{detectedCity}</span></div>}
                    {detectedSuburb && <div><small>Suburb / town</small><span>{detectedSuburb}</span></div>}
                    {!detectedSuburb && !detectedCity && detectedState && <div><small>Coverage</small><span>You'll appear under your state.</span></div>}
                  </div>
                  <button className="user-onboarding-text-button" type="button" onClick={() => void handleDetectLocation()} disabled={detectingLocation}>
                    {detectingLocation ? 'Detecting...' : 'Re-detect location'}
                  </button>
                </>
              )}
            </div>

            <div className="user-profile-card__divider" />

            <div>
              <div className="user-profile-card__section-heading"><ImageIcon aria-hidden="true" /><span>Profile background</span></div>
              <p className="venue-onboarding-note">Optional image or video, up to 30 seconds. A single upload is used for both views.</p>

              <input ref={bgMobileInputRef} type="file" accept="image/*,video/*" hidden onChange={(event) => void handleBgUpload(event, 'mobile')} />
              <input ref={bgDesktopInputRef} type="file" accept="image/*,video/*" hidden onChange={(event) => void handleBgUpload(event, 'desktop')} />

              <div className="user-profile-card__backgrounds">
                <div className="user-profile-card__background-option">
                  <span>Mobile</span>
                  <small>1080 x 600 px</small>
                  <button
                    className="user-profile-card__background-preview"
                    type="button"
                    onClick={() => bgMobileInputRef.current?.click()}
                    disabled={isUploadingBgMobile}
                    aria-label="Upload mobile profile background"
                  >
                    {isUploadingBgMobile ? (
                      <span className="venue-onboarding-spinner" aria-hidden="true" />
                    ) : bgMobile ? (
                      <>
                        {bgMobile.match(/\.(mp4|webm|mov)/) ? <video src={bgMobile} autoPlay loop muted playsInline /> : <img src={bgMobile} alt="Mobile background preview" />}
                        <span className="user-profile-card__background-overlay"><Camera aria-hidden="true" /></span>
                      </>
                    ) : (
                      <><Upload aria-hidden="true" /><span>{t('common:actions.upload')}</span></>
                    )}
                  </button>
                </div>

                <div className="user-profile-card__background-option">
                  <span>Desktop</span>
                  <small>1920 x 480 px</small>
                  <button
                    className="user-profile-card__background-preview"
                    type="button"
                    onClick={() => bgDesktopInputRef.current?.click()}
                    disabled={isUploadingBgDesktop}
                    aria-label="Upload desktop profile background"
                  >
                    {isUploadingBgDesktop ? (
                      <span className="venue-onboarding-spinner" aria-hidden="true" />
                    ) : bgDesktop ? (
                      <>
                        {bgDesktop.match(/\.(mp4|webm|mov)/) ? <video src={bgDesktop} autoPlay loop muted playsInline /> : <img src={bgDesktop} alt="Desktop background preview" />}
                        <span className="user-profile-card__background-overlay"><Camera aria-hidden="true" /></span>
                      </>
                    ) : (
                      <><Upload aria-hidden="true" /><span>{t('common:actions.upload')}</span></>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="user-onboarding-flow-actions">
              <button
                className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
                type="button"
                onClick={() => {
                  if (!profileImage) {
                    toast.error('Profile photo required', {
                      description: 'Please upload or take a profile photo before continuing.',
                    });
                    return;
                  }
                  if (!locationDetected) {
                    toast.error('Location required', {
                      description: 'Please detect your location using the button above before continuing.',
                    });
                    return;
                  }
                  void handleComplete();
                }}
              >
                <span>Complete profile</span>
                <ArrowRight aria-hidden="true" />
              </button>
            </div>

            {import.meta.env.DEV && (
              <div className="venue-onboarding-actions">
                <button
                  type="button"
                  onClick={async () => {
                    const { data: { user: currentUser } } = await supabase.auth.getUser();
                    if (currentUser) {
                      await advanceOnboardingStep(currentUser.id, 'vibe_selection');
                      navigate('/user/vibe-selection');
                    }
                  }}
                >
                  Skip to vibe selection (Dev Mode)
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </UserOnboardingShell>
  );
}
