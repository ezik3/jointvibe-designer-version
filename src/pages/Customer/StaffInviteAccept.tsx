import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Check, ScanFace, Loader2, ArrowLeft, Building2, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface InvitationData {
  id: string;
  venue_id: string;
  role: string;
  permissions: Record<string, boolean>;
  pin_code: string;
  status: string;
  employee_user_id: string;
  invited_by: string;
  venue_name?: string;
}

const roleLabels: Record<string, string> = {
  kitchen: "Kitchen Staff",
  waiter: "Waiter/Server",
  bartender: "Bartender",
  host: "Host",
  manager: "Sub-Manager",
};

export default function StaffInviteAccept() {
  const { t } = useTranslation('common');
  const { invitationId } = useParams<{ invitationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinInput, setPinInput] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showFaceIdPrompt, setShowFaceIdPrompt] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pinFailed, setPinFailed] = useState(false);
  const [resendingPin, setResendingPin] = useState(false);
  const [faceAlreadyVerified, setFaceAlreadyVerified] = useState<boolean | null>(null);
  const [hasIdDocument, setHasIdDocument] = useState<boolean | null>(null);

  // Fetch invitation
  useEffect(() => {
    const fetchInvitation = async () => {
      if (!user || !invitationId) return;

      let data: any = null;
      let error: any = null;

      if (invitationId && invitationId !== "latest") {
        const result = await (supabase as any)
          .from("employee_invitations")
          .select("*")
          .eq("id", invitationId)
          .eq("employee_user_id", user.id)
          .eq("status", "pending")
          .single();
        data = result.data;
        error = result.error;
      }
      
      if (!data) {
        const result = await (supabase as any)
          .from("employee_invitations")
          .select("*")
          .eq("employee_user_id", user.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        data = result.data;
        error = result.error;
      }

      if (error || !data) {
        console.error("Invitation not found:", error);
        setLoading(false);
        return;
      }

      const { data: venueData } = await (supabase as any)
        .from("venues")
        .select("name")
        .eq("id", data.venue_id)
        .single();

      setInvitation({
        id: data.id,
        venue_id: data.venue_id,
        role: data.role,
        permissions: (data.permissions as Record<string, boolean>) || {},
        pin_code: data.pin_code || "",
        status: data.status || "pending",
        employee_user_id: data.employee_user_id || "",
        invited_by: data.invited_by || "",
        venue_name: venueData?.name || "Unknown Venue",
      });
      setLoading(false);
    };

    fetchInvitation();
  }, [user, invitationId]);

  const handleVerifyPin = () => {
    if (!invitation) return;
    setVerifying(true);

    if (pinInput === invitation.pin_code) {
      setPinVerified(true);
      setPinFailed(false);
      toast.success("PIN verified!");
    } else {
      setPinFailed(true);
      toast.error("Incorrect PIN. Please try again.");
    }
    setVerifying(false);
  };

  const handleResendPin = async () => {
    if (!invitation || !user) return;
    setResendingPin(true);

    try {
      const newPin = Math.floor(100000 + Math.random() * 900000).toString();

      const { error: updateError } = await supabase
        .from("employee_invitations")
        .update({ pin_code: newPin })
        .eq("id", invitation.id);

      if (updateError) {
        console.error("Error updating PIN:", updateError);
        toast.error("Failed to request new PIN. Try again.");
        setResendingPin(false);
        return;
      }

      const { data: profileData } = await supabase
        .from("customer_profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();

      const employeeName = profileData?.display_name || "Employee";

      const { error: notifError } = await supabase
        .from("customer_notifications")
        .insert({
          user_id: invitation.invited_by,
          type: "pin_resend_request",
          title: "New PIN Requested",
          message: `${employeeName} has requested a new PIN. New code: ${newPin}`,
          reference_id: invitation.id,
          reference_type: "employee_invitation",
        });

      if (notifError) {
        console.error("Error sending PIN notification:", notifError);
      }

      setInvitation({ ...invitation, pin_code: newPin });
      setPinInput("");
      setPinFailed(false);
      toast.success("New PIN requested. Ask your manager for the updated code.");
    } catch (err) {
      console.error("Resend PIN error:", err);
      toast.error("Something went wrong. Try again.");
    } finally {
      setResendingPin(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!invitation || !user) return;
    setAccepting(true);

    try {
      // Check existing link
      const { data: existingLink } = await supabase
        .from("employee_venue_links")
        .select("id")
        .eq("user_id", user.id)
        .eq("venue_id", invitation.venue_id)
        .maybeSingle();

      // IMPORTANT: Insert link FIRST (RLS policy requires invitation status = 'pending')
      // Then update invitation status to 'accepted' AFTER the link is created
      const linkResult = existingLink
        ? await supabase
            .from("employee_venue_links")
            .update({
              role: invitation.role,
              permissions: invitation.permissions,
              is_active: true,
              terminated_date: null,
            })
            .eq("id", existingLink.id)
        : await supabase.from("employee_venue_links").insert({
            user_id: user.id,
            venue_id: invitation.venue_id,
            role: invitation.role,
            permissions: invitation.permissions,
            is_active: true,
            hired_date: new Date().toISOString().split("T")[0],
          });

      if (linkResult.error) {
        // Unique constraint = already linked, continue
        if (linkResult.error.code !== '23505') {
          console.error("Link error:", linkResult.error);
          toast.error("Failed to accept invitation");
          setAccepting(false);
          return;
        }
      }

      // Now that link is created, update invitation status and check face verification in parallel
      const [invResult, faceResult] = await Promise.all([
        supabase
          .from("employee_invitations")
          .update({ status: "accepted", accepted_at: new Date().toISOString(), pin_code: null })
          .eq("id", invitation.id),
        supabase
          .from("user_verification")
          .select("face_status, document_front_url, document_status")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (invResult.error) {
        console.error("Invitation update error (non-blocking):", invResult.error);
      }

      // Store venue info for Employee Login page
      localStorage.setItem("work_mode_venue", invitation.venue_name || "");
      localStorage.setItem("jv_current_venue_id", invitation.venue_id);

      const isFaceVerified = faceResult.data?.face_status === "verified";
      const hasId = !!faceResult.data?.document_front_url;
      setFaceAlreadyVerified(isFaceVerified);
      setHasIdDocument(hasId);
      setAccepted(true);
      setShowFaceIdPrompt(true);
    } catch (err) {
      console.error("Accept error:", err);
      toast.error("Something went wrong");
    } finally {
      setAccepting(false);
    }
  };

  const handleGoToWorkMode = () => {
    toast.success("You're all set! You can now access Work Mode.");
    navigate("/venue/pos/login");
  };

  const handleEnableFaceId = () => {
    // Navigate to real facial recognition flow with return path
    navigate("/user/facial-recognition?returnTo=/venue/pos/login");
  };

  const handleStartIdVerification = () => {
    // Chain: ID verification -> facial recognition -> work mode
    navigate("/user/id-verification?returnTo=" + encodeURIComponent("/user/facial-recognition?returnTo=/venue/pos/login"));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center px-4">
        <Card className="bg-zinc-800/60 border-zinc-700 max-w-md w-full">
          <CardContent className="p-8 text-center">
            <ShieldCheck className="h-16 w-16 mx-auto text-zinc-500 mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Invitation Not Found</h2>
            <p className="text-zinc-400 text-sm mb-6">This invitation may have expired or already been accepted.</p>
            <Button onClick={() => navigate("/app/notifications")} className="bg-primary">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Alerts
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show Face ID prompt after acceptance
  if (showFaceIdPrompt) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center px-4">
        <Card className="bg-zinc-800/60 border-zinc-700 max-w-md w-full">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="h-10 w-10 text-green-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">You're In!</h2>
              <p className="text-zinc-400 text-sm">You've been added to <span className="text-primary font-semibold">{invitation.venue_name}</span> as {roleLabels[invitation.role] || invitation.role}.</p>
            </div>

            {faceAlreadyVerified ? (
              /* Scenario A: Face already verified - go straight to work mode */
              <>
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Check className="h-5 w-5 text-emerald-400" />
                    <p className="font-medium text-emerald-400">Facial Recognition Already Set Up</p>
                  </div>
                  <p className="text-xs text-zinc-400">Your identity is verified. You're ready to access Work Mode.</p>
                </div>
                <Button
                  onClick={handleGoToWorkMode}
                  className="w-full h-14 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-white font-bold text-lg"
                >
                  Continue to Work Mode
                </Button>
              </>
            ) : hasIdDocument ? (
              /* Scenario B: Has ID document but no face verification - go to facial recognition */
              <>
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                  <ScanFace className="h-10 w-10 mx-auto text-blue-400 mb-3" />
                  <p className="font-medium text-blue-400 mb-1">Set Up Facial Recognition</p>
                  <p className="text-xs text-zinc-400">Your ID is on file. Complete facial recognition to enable biometric login for Work Mode.</p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handleGoToWorkMode}
                    className="flex-1 bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-white hover:text-white"
                  >
                    Not Now
                  </Button>
                  <Button
                    onClick={handleEnableFaceId}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    <ScanFace className="mr-2 h-4 w-4" /> Set Up Face ID
                  </Button>
                </div>
              </>
            ) : (
              /* Scenario C: No ID and no face verification - start from ID verification */
              <>
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <ScanFace className="h-10 w-10 mx-auto text-amber-400 mb-3" />
                  <p className="font-medium text-amber-400 mb-1">Identity Verification Required</p>
                  <p className="text-xs text-zinc-400">You'll need to upload your ID and complete facial recognition to enable biometric login for Work Mode.</p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handleGoToWorkMode}
                    className="flex-1 bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-white hover:text-white"
                  >
                    Not Now
                  </Button>
                  <Button
                    onClick={handleStartIdVerification}
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                  >
                    <ScanFace className="mr-2 h-4 w-4" /> Verify Identity
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center px-4">
      <Card className="bg-zinc-800/60 border-zinc-700 max-w-md w-full">
        <CardContent className="p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white">{invitation.venue_name}</h2>
            <p className="text-zinc-400 text-sm mt-1">has invited you to join their team</p>
          </div>

          {/* Role & Permissions */}
          <div className="bg-zinc-800 rounded-lg p-4 space-y-2">
            <p className="text-sm text-zinc-400"><span className="text-white font-medium">Role:</span> {roleLabels[invitation.role] || invitation.role}</p>
            <p className="text-sm text-zinc-400">
              <span className="text-white font-medium">Access:</span>{" "}
              {Object.entries(invitation.permissions)
                .filter(([, v]) => v)
                .map(([k]) => k)
                .join(", ") || "None"}
            </p>
          </div>

          {/* PIN Verification */}
          {!pinVerified ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Lock className="h-4 w-4" />
                <span>Enter the PIN to confirm your identity</span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6-digit PIN"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                  className="bg-zinc-800 border-zinc-600 text-white text-center text-2xl tracking-[0.3em] font-mono"
                />
              </div>
              <Button
                onClick={handleVerifyPin}
                disabled={pinInput.length !== 6 || verifying}
                className="w-full bg-primary"
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify PIN"}
              </Button>
              {pinFailed && (
                <Button
                  variant="ghost"
                  onClick={handleResendPin}
                  disabled={resendingPin}
                  className="w-full text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 mt-1"
                >
                  {resendingPin ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Requesting...</>
                  ) : (
                    <><RefreshCw className="mr-2 h-4 w-4" /> Request New PIN</>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/20 to-green-500/20 border border-emerald-400/40 flex items-center gap-3 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                <div className="w-10 h-10 rounded-full bg-emerald-500/30 flex items-center justify-center flex-shrink-0">
                  <Check className="h-6 w-6 text-emerald-300" />
                </div>
                <div>
                  <span className="text-emerald-300 font-semibold text-base">PIN Verified</span>
                  <p className="text-emerald-400/70 text-xs mt-0.5">Identity confirmed — you can now accept</p>
                </div>
              </div>
              <Button
                onClick={handleAcceptInvite}
                disabled={accepting}
                className="w-full h-14 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-white font-bold text-lg shadow-[0_0_25px_rgba(16,185,129,0.3)] transition-all duration-200"
              >
                {accepting ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Accepting...</>
                ) : (
                  <><ShieldCheck className="mr-2 h-5 w-5" /> Accept Invitation</>
                )}
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            onClick={() => navigate("/app/notifications")}
            className="w-full text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Alerts
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
