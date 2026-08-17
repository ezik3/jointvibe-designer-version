import { useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, Camera, CreditCard, FileText, IdCard, X, Check, Loader2, AlertCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { advanceOnboardingStep } from '@/utils/onboarding';
import { useAuth } from "@/contexts/AuthContext";
import CameraCapture from "@/components/Camera/CameraCapture";
import UserOnboardingShell from "@/components/User/UserOnboardingShell";
import { useIdDocumentVerification } from "@/hooks/useIdDocumentVerification";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import "./user-onboarding-flow.css";

// Normalize a person's name into comparable lowercase tokens (strips accents, punctuation, suffixes).
function nameTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .map(t => t.replace(/^['-]+|['-]+$/g, ''))
    .filter(t => t.length >= 2 && !['jr', 'sr', 'ii', 'iii', 'iv', 'mr', 'mrs', 'ms', 'dr'].includes(t));
}

// Returns true when the two names share at least one token (handles first/last swaps & middle names).
function namesLooselyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return true; // Cannot compare, so do not block.
  return ta.some(t => tb.includes(t));
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

type DocumentType = 'drivers_license' | 'passport' | 'age_card';

interface VerificationStatus {
  status: 'idle' | 'uploading' | 'verifying' | 'complete';
  result?: {
    status: 'approved' | 'needs_review' | 'failed';
    extracted?: {
      full_name?: string;
      date_of_birth?: string;
    };
    computed?: {
      age?: number;
      is_18_plus: boolean;
      is_21_plus: boolean;
    };
    failure_reason?: string;
  };
}

const IDVerification = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const { user } = useAuth();
  const [documentType, setDocumentType] = useState<DocumentType | null>(null);
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState<'front' | 'back' | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>({ status: 'idle' });
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  // Name-mismatch confirmation state (shown when ID name doesn't share any token with profile name)
  const [nameMismatch, setNameMismatch] = useState<{
    profileName: string;
    idName: string;
    nextPage: string;
  } | null>(null);
  const [applyingNameUpdate, setApplyingNameUpdate] = useState(false);

  const { verifyIdDocument, isVerifying } = useIdDocumentVerification();

  const documentTypes = [
    { id: 'drivers_license' as DocumentType, label: "Driver's License", icon: IdCard, requiresBack: true },
    { id: 'passport' as DocumentType, label: "Passport", icon: FileText, requiresBack: false },
    { id: 'age_card' as DocumentType, label: "18+ Card", icon: CreditCard, requiresBack: true },
  ];

  const selectedDocType = documentTypes.find(d => d.id === documentType);

  const handleFileUpload = (side: 'front' | 'back') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (side === 'front') {
          setFrontImage(reader.result as string);
        } else {
          setBackImage(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = (imageData: string) => {
    if (showCamera === 'front') {
      setFrontImage(imageData);
    } else if (showCamera === 'back') {
      setBackImage(imageData);
    }
    setShowCamera(null);
  };

  // Upload image to Supabase Storage
  const uploadImage = async (imageData: string, path: string): Promise<string> => {
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    const { data, error } = await supabase.storage
      .from('venue-assets')
      .upload(path, binaryData, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) throw error;
    
    const { data: publicUrl } = supabase.storage
      .from('venue-assets')
      .getPublicUrl(data.path);
    
    return publicUrl.publicUrl;
  };

  const handleSubmit = async () => {
    console.log('[IDVerification] Submit clicked');
    console.log('[IDVerification] User ID:', user?.id);
    console.log('[IDVerification] Document Type:', documentType);
    console.log('[IDVerification] Front Image:', frontImage ? 'Present' : 'Missing');
    console.log('[IDVerification] Back Image:', backImage ? 'Present' : 'Missing');

    if (!user || !documentType || !frontImage) {
      toast.error("Please complete all required fields");
      return;
    }

    if (selectedDocType?.requiresBack && !backImage) {
      toast.error("Please upload the back of your document");
      return;
    }

    setVerificationStatus({ status: 'uploading' });

    try {
      // Upload images to Supabase Storage
      const timestamp = Date.now();
      const frontPath = `id-documents/${user.id}/front_${timestamp}.jpg`;
      console.log('[IDVerification] Uploading front image to:', frontPath);
      const frontUrl = await uploadImage(frontImage, frontPath);
      console.log('[IDVerification] Front image uploaded:', frontUrl);
      
      let backUrl: string | undefined;
      if (backImage) {
        const backPath = `id-documents/${user.id}/back_${timestamp}.jpg`;
        console.log('[IDVerification] Uploading back image to:', backPath);
        backUrl = await uploadImage(backImage, backPath);
        console.log('[IDVerification] Back image uploaded:', backUrl);
      }

      // Check if verification record exists
      console.log('[IDVerification] Checking for existing user_verification record...');
      const { data: existing } = await supabase
        .from('user_verification')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        console.log('[IDVerification] Updating existing record:', existing.id);
        await supabase
          .from('user_verification')
          .update({
            document_type: documentType,
            document_front_url: frontUrl,
            document_back_url: backUrl,
            document_status: 'pending',
            overall_status: 'pending',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
      } else {
        console.log('[IDVerification] Creating new user_verification record');
        await supabase
          .from('user_verification')
          .insert([{
            user_id: user.id,
            document_type: documentType,
            document_front_url: frontUrl,
            document_back_url: backUrl,
            document_status: 'pending',
            overall_status: 'pending'
          }]);
      }

      // Now run OCR verification via edge function
      setVerificationStatus({ status: 'verifying' });
      console.log('[IDVerification] Calling verify-id-document edge function...');
      
      const result = await verifyIdDocument(
        user.id,
        frontUrl,
        documentType,
        backUrl
      );

      console.log('[IDVerification] Edge function result:', result);

      if (result) {
        setVerificationStatus({
          status: 'complete',
          result: {
            status: result.status,
            extracted: result.extracted,
            computed: result.computed,
            failure_reason: result.failure_reason
          }
        });

        // If approved or needs_review, check name match before proceeding
        if (result.status === 'approved' || result.status === 'needs_review') {
          const nextPage = returnTo || "/user/facial-recognition";
          console.log('[IDVerification] Verification passed, navigating to:', nextPage);
          if (user) await advanceOnboardingStep(user.id, 'face_pending');

          // Compare extracted ID name with the profile display_name. If they don't share a
          // single token, prompt the user to confirm and then sync the profile name.
          // to match the ID (legal name on ID is the source of truth for verification).
          const extractedName = result.extracted?.full_name?.trim();
          if (extractedName) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('user_id', user.id)
              .maybeSingle();
            const profileName = (profile?.full_name ?? '').trim();
            if (profileName && !namesLooselyMatch(profileName, extractedName)) {
              // Surface mismatch dialog; navigation deferred until user confirms.
              setNameMismatch({ profileName, idName: extractedName, nextPage });
              return;
            }
          }

          setTimeout(() => {
            navigate(nextPage);
          }, 2000);
        }
      } else {
        console.log('[IDVerification] No result returned from edge function');
        setVerificationStatus({ status: 'idle' });
      }
    } catch (error: unknown) {
      console.error("[IDVerification] Error:", error);
      toast.error(getErrorMessage(error, "Failed to upload document"));
      setVerificationStatus({ status: 'idle' });
    }
  };

  const handleNoID = async () => {
    try {
      if (user) {
        const { data: existing } = await supabase
          .from('user_verification')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (existing) {
          await supabase
            .from('user_verification')
            .update({
              document_status: 'unverified',
              is_age_verified: false,
              is_18_plus: false,
              is_21_plus: false,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);
        } else {
          await supabase
            .from('user_verification')
            .insert([{
              user_id: user.id,
              document_status: 'unverified',
              overall_status: 'pending',
              is_age_verified: false,
              is_18_plus: false,
              is_21_plus: false
            }]);
        }
        await advanceOnboardingStep(user.id, 'face_pending');
      }
      toast.info("You can still use facial recognition for wallet security, but won't access 18+ venues.");
      navigate(returnTo || "/user/facial-recognition");
    } catch (error) {
      console.error("Error:", error);
      navigate(returnTo || "/user/facial-recognition");
    }
  };

  const handleSkip = async () => {
    toast.info("You can verify later. Note: Some venues may require verification.");
    if (user) await advanceOnboardingStep(user.id, 'profile_setup');
    navigate(returnTo || "/user/profile-setup");
  };

  const isProcessing = verificationStatus.status === 'uploading' || verificationStatus.status === 'verifying' || isVerifying;

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handleCameraCapture}
        onClose={() => setShowCamera(null)}
        overlay="document"
        title={`Capture ${showCamera === 'front' ? 'Front' : 'Back'} of ID`}
      />
    );
  }

  // Show verification result
  if (verificationStatus.status === 'complete' && verificationStatus.result) {
    const { status, extracted, computed, failure_reason } = verificationStatus.result;
    const isSuccess = status === 'approved';
    const needsReview = status === 'needs_review';

    return (
      <UserOnboardingShell step={3} backTo="/user/verify-phone">
        <section className="venue-onboarding-card user-verification-result-card">
          <div>
            {isSuccess ? (
              <div className="user-verification-result-card__badge">
                <Check aria-hidden="true" />
              </div>
            ) : needsReview ? (
              <div className="user-verification-result-card__badge is-warning">
                <AlertCircle aria-hidden="true" />
              </div>
            ) : (
              <div className="user-verification-result-card__badge is-error">
                <X aria-hidden="true" />
              </div>
            )}
            
            <h2>
              {isSuccess ? 'ID Verified Successfully!' : needsReview ? 'Submitted for Review' : 'Verification Failed'}
            </h2>
            
            <div className="user-verification-result-card__details">
              {extracted?.full_name && <span>Name: {extracted.full_name}</span>}
              {computed?.age && <span>Age: {computed.age}</span>}
              {computed && (
                <div className="user-verification-result-card__age-pills">
                {computed.is_18_plus && (
                  <span>18+</span>
                )}
                {computed.is_21_plus && (
                  <span>21+</span>
                )}
              </div>
              )}
            </div>

            {failure_reason && <p className="user-verification-result-card__failure">{failure_reason}</p>}
          
          {!isSuccess && (
            <button
              className="venue-onboarding-button venue-onboarding-button--secondary venue-onboarding-button--full"
              type="button"
              onClick={() => {
                setVerificationStatus({ status: 'idle' });
                setFrontImage(null);
                setBackImage(null);
              }}
            >
              Try Again
            </button>
          )}
          
          {(isSuccess || needsReview) && !nameMismatch && (
            <p className="venue-onboarding-waiting">
              Proceeding to facial verification...
            </p>
          )}
          {(isSuccess || needsReview) && nameMismatch && (
            <p className="user-verification-result-card__failure">
              Action needed - please confirm your name below.
            </p>
          )}
          </div>

        {/* Name mismatch confirmation */}
        <Dialog open={!!nameMismatch} onOpenChange={(open) => { if (!open) setNameMismatch(null); }}>
          <DialogContent className="user-verification-name-dialog">
            <DialogHeader className="user-verification-name-dialog__header">
              <DialogTitle className="user-verification-name-dialog__title">
                <AlertTriangle />
                Name on ID doesn't match your profile
              </DialogTitle>
              <DialogDescription className="user-verification-name-dialog__description">
                <span className="block">
                  Your profile name and the name on the ID we just verified are different.
                  Because verification uses the legal name on the ID as the source of truth, continuing
                  will update your profile name to match the ID.
                </span>
                <span className="user-verification-name-dialog__names">
                  <span><span>Profile name:</span> <strong>{nameMismatch?.profileName}</strong></span>
                  <span><span>Name on ID:</span> <strong>{nameMismatch?.idName}</strong></span>
                </span>
                <span className="block text-xs">
                  If this isn't your ID, cancel and re-upload the correct document.
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="user-verification-name-dialog__footer">
              <Button
                variant="outline"
                className="user-verification-name-dialog__button user-verification-name-dialog__button--secondary"
                disabled={applyingNameUpdate}
                onClick={() => {
                  setNameMismatch(null);
                  setVerificationStatus({ status: 'idle' });
                  setFrontImage(null);
                  setBackImage(null);
                  toast.info('Verification cancelled. Please re-upload the correct ID.');
                }}
              >
                Cancel & re-upload
              </Button>
              <Button
                className="user-verification-name-dialog__button user-verification-name-dialog__button--primary"
                disabled={applyingNameUpdate}
                onClick={async () => {
                  if (!user || !nameMismatch) return;
                  setApplyingNameUpdate(true);
                  try {
                    const { error: upErr } = await supabase
                      .from('profiles')
                      .update({ full_name: nameMismatch.idName })
                      .eq('user_id', user.id);
                    if (upErr) throw upErr;
                    toast.success(`Profile name updated to "${nameMismatch.idName}"`);
                    const next = nameMismatch.nextPage;
                    setNameMismatch(null);
                    setTimeout(() => navigate(next), 600);
                  } catch (err: unknown) {
                    console.error('[IDVerification] Failed to update profile name:', err);
                    toast.error(getErrorMessage(err, 'Could not update profile name'));
                  } finally {
                    setApplyingNameUpdate(false);
                  }
                }}
              >
                {applyingNameUpdate ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </span>
                ) : (
                  "Update profile & continue"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </section>
      </UserOnboardingShell>
    );
  }

  return (
    <UserOnboardingShell step={3} backTo="/user/verify-phone" wide>
      <section className="venue-onboarding-card user-verification-card">
          <div className="venue-onboarding-card__heading user-verification-card__heading">
            <h1 className="text-2xl font-bold">Verify Your Identity</h1>
            <p className="text-muted-foreground text-sm">
              Upload a valid ID to access age-restricted venues and secure transactions
            </p>
          </div>

          {/* Document Type Selection */}
          {!documentType ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Select Document Type</h2>
              <div className="grid gap-3">
                {documentTypes.map((doc) => (
                  <Card
                    key={doc.id}
                    className="p-4 cursor-pointer hover:border-primary transition-colors"
                    onClick={() => setDocumentType(doc.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-full bg-primary/10">
                        <doc.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{doc.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.requiresBack ? "Front & back required" : "Front only"}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selected Document Type Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedDocType && <selectedDocType.icon className="h-5 w-5 text-primary" />}
                  <span className="font-medium">{selectedDocType?.label}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => {
                  setDocumentType(null);
                  setFrontImage(null);
                  setBackImage(null);
                }}>
                  Change
                </Button>
              </div>

              {/* Front Image Upload */}
              <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Front of Document</h3>
                  {frontImage && <Check className="h-5 w-5 text-green-500" />}
                </div>
                
                {frontImage ? (
                  <div className="relative">
                    <img src={frontImage} alt="Front of ID" className="w-full rounded-lg" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 rounded-full"
                      onClick={() => setFrontImage(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => frontInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowCamera('front')}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Camera
                    </Button>
                    <input
                      ref={frontInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload('front')}
                    />
                  </div>
                )}
              </Card>

              {/* Back Image Upload (if required) */}
              {selectedDocType?.requiresBack && (
                <Card className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Back of Document</h3>
                    {backImage && <Check className="h-5 w-5 text-green-500" />}
                  </div>
                  
                  {backImage ? (
                    <div className="relative">
                      <img src={backImage} alt="Back of ID" className="w-full rounded-lg" />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 rounded-full"
                        onClick={() => setBackImage(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => backInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setShowCamera('back')}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Camera
                      </Button>
                      <input
                        ref={backInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileUpload('back')}
                      />
                    </div>
                  )}
                </Card>
              )}

              {/* Submit Button */}
              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmit}
                disabled={isProcessing || !frontImage || (selectedDocType?.requiresBack && !backImage)}
              >
                {verificationStatus.status === 'uploading' ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading document...
                  </span>
                ) : verificationStatus.status === 'verifying' || isVerifying ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing document...
                  </span>
                ) : (
                  "Verify & Continue"
                )}
              </Button>
            </div>
          )}

          {/* No ID and Skip Options */}
          <div className="text-center space-y-3">
            <Button 
              variant="outline" 
              onClick={handleNoID} 
              className="w-full text-muted-foreground border-dashed"
            >
              I don't have an ID
            </Button>
            <p className="text-xs text-muted-foreground">
              You can still use facial recognition for wallet security, but won't access age-restricted venues
            </p>
            <Button variant="link" onClick={handleSkip} className="text-muted-foreground text-xs">
              Skip verification entirely
            </Button>
          </div>
      </section>
    </UserOnboardingShell>
  );
};

export default IDVerification;
