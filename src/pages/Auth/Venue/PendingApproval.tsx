import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, XCircle, RefreshCw, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannelTopic } from '@/lib/realtime';
import { toast } from 'sonner';
import VenueOnboardingShell from '@/components/Venue/VenueOnboardingShell';
import './venue-profile-status.css';

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface ApprovalUpdate {
  approval_status?: ApprovalStatus;
  rejection_reason?: string | null;
}

export default function VenuePendingApproval() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ApprovalStatus>('pending');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [venueName, setVenueName] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const storedVenueName = localStorage.getItem('jv_venue_name');
    if (storedVenueName) setVenueName(storedVenueName);
    
    let isCurrent = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    
    const initializeAndSubscribe = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!isCurrent || !user) {
        console.log('[PendingApproval] No user session, redirecting to auth');
        navigate('/auth');
        return;
      }
      
      console.log('[PendingApproval] User authenticated:', user.id, user.email);
      setUserEmail(user.email || null);
      
      // Initial status check
      await checkApprovalStatus();
      if (!isCurrent) return;
      
      // Subscribe to realtime updates for this venue owner
      channel = supabase
        .channel(createRealtimeChannelTopic(`venue-approval-status-${user.id}`))
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'venues',
            filter: `owner_user_id=eq.${user.id}`,
          },
          (payload) => {
            if (!isCurrent) return;
            console.log('[PendingApproval] Realtime update received:', payload);
            const update = payload.new as ApprovalUpdate;
            const newStatus = update.approval_status ?? 'pending';
            const newRejectionReason = update.rejection_reason ?? null;
            
            setStatus(newStatus);
            setRejectionReason(newRejectionReason);
            
            if (newStatus === 'approved') {
              toast.success('Your venue has been approved!');
              navigate('/venue/home');
            } else if (newStatus === 'rejected') {
              toast.error('Your venue registration was declined');
            }
          }
        )
        .subscribe((status) => {
          console.log('[PendingApproval] Realtime subscription status:', status);
        });
    };
    
    void initializeAndSubscribe();
    
    return () => {
      isCurrent = false;
      if (channel) {
        console.log('[PendingApproval] Cleaning up realtime subscription');
        void supabase.removeChannel(channel);
      }
    };
  }, [navigate]);

  const checkApprovalStatus = async () => {
    setIsChecking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[PendingApproval] No user in checkApprovalStatus');
        navigate('/auth');
        return;
      }

      console.log('[PendingApproval] Checking status for user:', user.id);

      const { data: venue, error } = await supabase
        .from('venues')
        .select('approval_status, rejection_reason, name')
        .eq('owner_user_id', user.id)
        .maybeSingle();

      console.log('[PendingApproval] Venue query result:', { venue, error, userId: user.id });

      if (error) {
        console.error('[PendingApproval] Error checking approval status:', error);
        toast.error('Failed to check approval status');
        return;
      }

      if (!venue) {
        console.log('[PendingApproval] No venue found for user');
        toast.error('No venue found for your account');
        return;
      }

      // Update venue name if we got it from DB
      if (venue.name) setVenueName(venue.name);
      
      setStatus(venue.approval_status as ApprovalStatus);
      setRejectionReason(venue.rejection_reason);

      if (venue.approval_status === 'approved') {
        console.log('[PendingApproval] Venue is approved, redirecting immediately');
        toast.success('Your venue is approved!');
        navigate('/venue/home');
      }
    } catch (error) {
      console.error('[PendingApproval] Error:', error);
      toast.error('An error occurred while checking status');
    } finally {
      setIsChecking(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    navigate('/auth');
  };

  return (
    <VenueOnboardingShell step={8} backTo="/venue/profile-setup">
      <section className="venue-onboarding-card venue-onboarding-status-card venue-pending-approval">
        <div className="venue-onboarding-card__heading">
          <div className={`venue-onboarding-card__icon venue-pending-approval__icon venue-pending-approval__icon--${status}`}>
            {status === 'pending' && <Clock aria-hidden="true" />}
            {status === 'approved' && <CheckCircle aria-hidden="true" />}
            {status === 'rejected' && <XCircle aria-hidden="true" />}
          </div>
          <h1>
            {status === 'pending' && 'Registration under review'}
            {status === 'approved' && 'Venue approved'}
            {status === 'rejected' && 'Registration declined'}
          </h1>
          <p>
            {status === 'pending' && <>Thank you for registering <strong>{venueName || 'your venue'}</strong>. Our team is reviewing your application.</>}
            {status === 'approved' && 'Your venue has been approved. Redirecting to your workspace...'}
            {status === 'rejected' && 'Unfortunately, your venue registration was not approved.'}
          </p>
        </div>

        {status === 'pending' && (
          <>
            <p className="venue-onboarding-status-copy">This usually takes 1-2 business days. We will email you once your venue is approved.</p>
            <ol className="venue-pending-approval__steps">
              <li className="is-current"><span>1</span><div><strong>Document review</strong><small>We are verifying your business documents.</small></div></li>
              <li><span>2</span><div><strong>Business verification</strong><small>Confirming license and location details.</small></div></li>
              <li><span>3</span><div><strong>Approval</strong><small>Final review and activation.</small></div></li>
            </ol>
            <button className="venue-onboarding-button venue-onboarding-button--secondary venue-onboarding-button--full" type="button" onClick={() => void checkApprovalStatus()} disabled={isChecking}>
              <RefreshCw className={isChecking ? 'venue-pending-approval__refresh is-spinning' : 'venue-pending-approval__refresh'} aria-hidden="true" />
              <span>{isChecking ? 'Checking status...' : 'Check status'}</span>
            </button>
            {userEmail && <p className="venue-pending-approval__account">Logged in as {userEmail}</p>}
          </>
        )}

        {status === 'approved' && (
          <div className="venue-pending-approval__waiting" role="status">
            <span className="venue-onboarding-spinner" aria-hidden="true" />
            <span>Opening your venue workspace...</span>
          </div>
        )}

        {status === 'rejected' && rejectionReason && (
          <div className="venue-pending-approval__reason">
            <strong>Reason</strong>
            <p>{rejectionReason}</p>
          </div>
        )}

        <div className="venue-onboarding-actions">
          <button type="button" onClick={() => void handleLogout()}><LogOut aria-hidden="true" />Sign out and return later</button>
        </div>
      </section>
    </VenueOnboardingShell>
  );
}
