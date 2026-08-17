import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScanFace, CheckCircle, Loader2, SkipForward } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import CameraCapture from '@/components/Camera/CameraCapture';
import { useTranslation } from 'react-i18next';

interface FaceIdEnrollmentProps {
  venueId: string;
  required?: boolean;
  onComplete: () => void;
  onSkip?: () => void;
}

export default function FaceIdEnrollment({ venueId, required = false, onComplete, onSkip }: FaceIdEnrollmentProps) {
  const { t } = useTranslation('venue');
  const [showCamera, setShowCamera] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  const handleCapture = async (imageData: string) => {
    setShowCamera(false);
    setIsProcessing(true);

    try {
      const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
      const { data, error } = await supabase.functions.invoke('verify-employee-face', {
        body: { action: 'enroll', face_image_base64: base64, venue_id: venueId },
      });

      if (error) throw error;
      if (data?.success) {
        setEnrolled(true);
        toast.success('Face ID enrolled successfully!');
        setTimeout(() => onComplete(), 1500);
      } else {
        toast.error(data?.error || 'Failed to enroll face. Please try again.');
      }
    } catch (err: any) {
      toast.error('Enrollment failed. Please try again.');
      console.error('Face enrollment error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handleCapture}
        onClose={() => setShowCamera(false)}
        title="Face ID Enrollment"
        instruction="Look straight at the camera with good lighting"
        facingMode="user"
        overlay="face"
      />
    );
  }

  if (enrolled) {
    return (
      <div className="text-center py-12">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Face ID Set Up!</h2>
        <p className="text-muted-foreground">You can now use Face ID to clock in.</p>
      </div>
    );
  }

  return (
    <div className="text-center py-8 space-y-6">
      <div className="w-24 h-24 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center">
        <ScanFace className="w-12 h-12 text-blue-500" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground mb-2">Set Up Face ID</h2>
        <p className="text-muted-foreground text-sm">
          {required
            ? 'This venue requires Face ID for clock-in. Take a clear photo of your face.'
            : 'Optionally set up Face ID for faster clock-in. You can always use your PIN instead.'}
        </p>
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs mx-auto"
        onClick={() => setShowCamera(true)}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>
        ) : (
          <><ScanFace className="w-5 h-5 mr-2" /> Take Enrollment Photo</>
        )}
      </Button>

      {!required && onSkip && (
        <Button variant="ghost" className="text-muted-foreground" onClick={onSkip}>
          <SkipForward className="w-4 h-4 mr-1" /> Skip for now
        </Button>
      )}
    </div>
  );
}
