import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, AlertCircle, Play, Database, Server, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useIdDocumentVerification } from '@/hooks/useIdDocumentVerification';
import { useBusinessDocVerification } from '@/hooks/useBusinessDocVerification';
import { useFaceMatchVerification } from '@/hooks/useFaceMatchVerification';
import { useTranslation } from 'react-i18next';

interface TableRow {
  id: string;
  created_at: string;
  status?: string;
  [key: string]: any;
}

interface DiagnosticResult {
  function_name: string;
  status: 'idle' | 'running' | 'success' | 'error';
  response?: any;
  error?: string;
  duration_ms?: number;
  timestamp?: string;
}

export default function VerificationDiagnostics() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Database state
  const [verificationDocs, setVerificationDocs] = useState<TableRow[]>([]);
  const [venueVerificationDocs, setVenueVerificationDocs] = useState<TableRow[]>([]);
  const [userVerification, setUserVerification] = useState<TableRow | null>(null);
  const [venueData, setVenueData] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Diagnostic results
  const [diagnostics, setDiagnostics] = useState<Record<string, DiagnosticResult>>({
    'verify-id-document': { function_name: 'verify-id-document', status: 'idle' },
    'verify-identity': { function_name: 'verify-identity', status: 'idle' },
    'verify-business-docs': { function_name: 'verify-business-docs', status: 'idle' },
  });

  // Hooks
  const { verifyIdDocument, isVerifying: isIdVerifying, lastError: idError } = useIdDocumentVerification();
  const { verifyBusinessDocument, isVerifying: isBusinessVerifying, lastError: businessError } = useBusinessDocVerification();
  const { verifyFaceMatch, isVerifying: isFaceVerifying, lastError: faceError } = useFaceMatchVerification();

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load verification_documents for current user
      const { data: verDocs } = await supabase
        .from('verification_documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      setVerificationDocs(verDocs || []);

      // Load user_verification
      const { data: userVer } = await supabase
        .from('user_verification')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      setUserVerification(userVer);

      // Try to get venue ID from localStorage
      const venueDataStr = localStorage.getItem('jv_venue_data');
      if (venueDataStr) {
        const venue = JSON.parse(venueDataStr);
        if (venue.id) {
          setVenueData({ id: venue.id, name: venue.name || 'Unknown' });
          
          // Load venue_verification_documents
          const { data: venueDocs } = await supabase
            .from('venue_verification_documents')
            .select('*')
            .eq('venue_id', venue.id)
            .order('created_at', { ascending: false })
            .limit(5);
          setVenueVerificationDocs(venueDocs || []);
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const testIdOcr = async () => {
    if (!user || !userVerification?.document_front_url) {
      toast.error('No ID document found. Please upload an ID first.');
      return;
    }

    setDiagnostics(prev => ({
      ...prev,
      'verify-id-document': { function_name: 'verify-id-document', status: 'running' }
    }));

    const startTime = Date.now();
    try {
      const result = await verifyIdDocument(
        user.id,
        userVerification.document_front_url,
        userVerification.document_type || 'drivers_license',
        userVerification.document_back_url
      );

      setDiagnostics(prev => ({
        ...prev,
        'verify-id-document': {
          function_name: 'verify-id-document',
          status: result ? 'success' : 'error',
          response: result,
          error: idError?.error_body,
          duration_ms: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }));

      await loadData();
    } catch (err: any) {
      setDiagnostics(prev => ({
        ...prev,
        'verify-id-document': {
          function_name: 'verify-id-document',
          status: 'error',
          error: err.message,
          duration_ms: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }));
    }
  };

  const testFaceMatch = async () => {
    if (!user || !userVerification?.document_front_url || !userVerification?.selfie_url) {
      toast.error('Missing ID document or selfie. Please complete both uploads first.');
      return;
    }

    setDiagnostics(prev => ({
      ...prev,
      'verify-identity': { function_name: 'verify-identity', status: 'running' }
    }));

    const startTime = Date.now();
    try {
      const result = await verifyFaceMatch(
        user.id,
        userVerification.document_front_url,
        userVerification.selfie_url,
        userVerification.document_type || 'drivers_license',
        userVerification.extracted_name,
        userVerification.extracted_dob,
        userVerification.document_back_url
      );

      setDiagnostics(prev => ({
        ...prev,
        'verify-identity': {
          function_name: 'verify-identity',
          status: result ? 'success' : 'error',
          response: result,
          error: faceError?.error_body,
          duration_ms: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }));

      await loadData();
    } catch (err: any) {
      setDiagnostics(prev => ({
        ...prev,
        'verify-identity': {
          function_name: 'verify-identity',
          status: 'error',
          error: err.message,
          duration_ms: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }));
    }
  };

  const testBusinessDoc = async () => {
    if (!venueData?.id) {
      toast.error('No venue found. Please register a venue first.');
      return;
    }

    // Find a document URL to test with
    const testDoc = venueVerificationDocs[0];
    if (!testDoc?.storage_url) {
      toast.error('No business document found. Please upload a utility bill first.');
      return;
    }

    setDiagnostics(prev => ({
      ...prev,
      'verify-business-docs': { function_name: 'verify-business-docs', status: 'running' }
    }));

    const startTime = Date.now();
    try {
      const result = await verifyBusinessDocument(
        venueData.id,
        testDoc.storage_url,
        testDoc.document_type || 'utility_bill'
      );

      setDiagnostics(prev => ({
        ...prev,
        'verify-business-docs': {
          function_name: 'verify-business-docs',
          status: result ? 'success' : 'error',
          response: result,
          error: businessError?.error_body,
          duration_ms: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }));

      await loadData();
    } catch (err: any) {
      setDiagnostics(prev => ({
        ...prev,
        'verify-business-docs': {
          function_name: 'verify-business-docs',
          status: 'error',
          error: err.message,
          duration_ms: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'running': return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      default: return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Verification Diagnostics</h1>
            <p className="text-muted-foreground text-sm">
              Test AWS verification edge functions and view database state
            </p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Current User Info */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Current User</h2>
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>User ID:</strong> {user?.id || 'Not logged in'}</p>
            <p><strong>Email:</strong> {user?.email || 'N/A'}</p>
            {venueData && (
              <p><strong>Venue ID:</strong> {venueData.id} ({venueData.name})</p>
            )}
          </div>
        </Card>

        {/* Test Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Test ID OCR</h3>
              {getStatusIcon(diagnostics['verify-id-document'].status)}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Calls verify-id-document edge function
            </p>
            <Button 
              className="w-full" 
              onClick={testIdOcr}
              disabled={isIdVerifying || !userVerification?.document_front_url}
            >
              <Play className="h-4 w-4 mr-2" />
              {isIdVerifying ? 'Running...' : 'Run Test'}
            </Button>
            {diagnostics['verify-id-document'].duration_ms && (
              <p className="text-xs text-center text-muted-foreground mt-2">
                {diagnostics['verify-id-document'].duration_ms}ms
              </p>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Test Face Match</h3>
              {getStatusIcon(diagnostics['verify-identity'].status)}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Calls verify-identity edge function
            </p>
            <Button 
              className="w-full" 
              onClick={testFaceMatch}
              disabled={isFaceVerifying || !userVerification?.document_front_url || !userVerification?.selfie_url}
            >
              <Play className="h-4 w-4 mr-2" />
              {isFaceVerifying ? 'Running...' : 'Run Test'}
            </Button>
            {diagnostics['verify-identity'].duration_ms && (
              <p className="text-xs text-center text-muted-foreground mt-2">
                {diagnostics['verify-identity'].duration_ms}ms
              </p>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Test Business Doc</h3>
              {getStatusIcon(diagnostics['verify-business-docs'].status)}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Calls verify-business-docs edge function
            </p>
            <Button 
              className="w-full" 
              onClick={testBusinessDoc}
              disabled={isBusinessVerifying || !venueData?.id}
            >
              <Play className="h-4 w-4 mr-2" />
              {isBusinessVerifying ? 'Running...' : 'Run Test'}
            </Button>
            {diagnostics['verify-business-docs'].duration_ms && (
              <p className="text-xs text-center text-muted-foreground mt-2">
                {diagnostics['verify-business-docs'].duration_ms}ms
              </p>
            )}
          </Card>
        </div>

        {/* Diagnostic Results */}
        {Object.values(diagnostics).some(d => d.status !== 'idle') && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Server className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Edge Function Results</h2>
            </div>
            <div className="space-y-4">
              {Object.values(diagnostics).filter(d => d.status !== 'idle').map(diag => (
                <div key={diag.function_name} className={`p-3 rounded-lg border ${
                  diag.status === 'success' ? 'border-green-500 bg-green-500/10' :
                  diag.status === 'error' ? 'border-red-500 bg-red-500/10' :
                  'border-blue-500 bg-blue-500/10'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm">{diag.function_name}</span>
                    <span className="text-xs text-muted-foreground">{diag.timestamp}</span>
                  </div>
                  {diag.error && (
                    <pre className="text-xs text-red-400 overflow-auto max-h-32 p-2 bg-background rounded">
                      {diag.error}
                    </pre>
                  )}
                  {diag.response && (
                    <pre className="text-xs overflow-auto max-h-48 p-2 bg-background rounded mt-2">
                      {JSON.stringify(diag.response, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Database State */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* user_verification */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Database className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">user_verification</h2>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("common:app.loading")}</p>
            ) : userVerification ? (
              <div className="text-xs space-y-1 overflow-auto max-h-64">
                <p><strong>Status:</strong> {userVerification.overall_status}</p>
                <p><strong>Document Status:</strong> {userVerification.document_status}</p>
                <p><strong>Face Status:</strong> {userVerification.face_status}</p>
                <p><strong>Face Match Confidence:</strong> {userVerification.face_match_confidence || 'null'}</p>
                <p><strong>Liveness Score:</strong> {userVerification.liveness_score || 'null'}</p>
                <p><strong>Extracted Name:</strong> {userVerification.extracted_name || 'null'}</p>
                <p><strong>Extracted DOB:</strong> {userVerification.extracted_dob || 'null'}</p>
                <p><strong>is_18_plus:</strong> {String(userVerification.is_18_plus)}</p>
                <p><strong>is_21_plus:</strong> {String(userVerification.is_21_plus)}</p>
                <p><strong>Document Front URL:</strong> {userVerification.document_front_url ? '✅ Set' : '❌ Missing'}</p>
                <p><strong>Selfie URL:</strong> {userVerification.selfie_url ? '✅ Set' : '❌ Missing'}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No record found</p>
            )}
          </Card>

          {/* verification_documents */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Database className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">verification_documents ({verificationDocs.length})</h2>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("common:app.loading")}</p>
            ) : verificationDocs.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-auto">
                {verificationDocs.map(doc => (
                  <div key={doc.id} className="text-xs p-2 bg-muted rounded">
                    <p><strong>Status:</strong> {doc.status}</p>
                    <p><strong>Type:</strong> {doc.document_type}</p>
                    <p><strong>Confidence:</strong> {doc.overall_confidence}</p>
                    <p><strong>Created:</strong> {new Date(doc.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-yellow-500">⚠️ No documents found (edge function not triggered?)</p>
            )}
          </Card>

          {/* venue_verification_documents */}
          <Card className="p-4 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Database className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">venue_verification_documents ({venueVerificationDocs.length})</h2>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("common:app.loading")}</p>
            ) : venueVerificationDocs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-auto">
                {venueVerificationDocs.map(doc => (
                  <div key={doc.id} className="text-xs p-2 bg-muted rounded">
                    <p><strong>Status:</strong> {doc.status}</p>
                    <p><strong>Type:</strong> {doc.document_type}</p>
                    <p><strong>Business Name:</strong> {doc.extracted_business_name || 'N/A'}</p>
                    <p><strong>Address Match:</strong> {doc.address_match_score || 'N/A'}</p>
                    <p><strong>Created:</strong> {new Date(doc.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            ) : venueData?.id ? (
              <p className="text-sm text-yellow-500">⚠️ No documents found for venue {venueData.id}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No venue associated with this user</p>
            )}
          </Card>
        </div>

        {/* Console Hint */}
        <Card className="p-4 border-blue-500 bg-blue-500/10">
          <h3 className="font-semibold text-blue-500 mb-2">💡 Debug Tip</h3>
          <p className="text-sm text-muted-foreground">
            Open the browser console (F12) to see detailed logs from the verification hooks. 
            Look for logs prefixed with <code className="bg-muted px-1 rounded">[useIdDocumentVerification]</code>, 
            <code className="bg-muted px-1 rounded">[useFaceMatchVerification]</code>, and 
            <code className="bg-muted px-1 rounded">[useBusinessDocVerification]</code>.
          </p>
        </Card>
      </div>
    </div>
  );
}
