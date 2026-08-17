import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Store, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Shield,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

interface JoinVenueFlowProps {
  onJoinComplete: (venueId: string, venueName: string) => void;
}

interface VenueSearchResult {
  id: string;
  name: string;
  address: string;
  city: string;
}

interface JoinRequest {
  id: string;
  venue_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  venue?: VenueSearchResult;
}

export const JoinVenueFlow = ({ onJoinComplete }: JoinVenueFlowProps) => {
  const { t } = useTranslation('pos');
  const { user } = useAuth();
  const [step, setStep] = useState<'search' | 'pending' | 'approved'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [venues, setVenues] = useState<VenueSearchResult[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<VenueSearchResult | null>(null);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Check for existing approved links or pending requests
  useEffect(() => {
    if (user?.id) {
      checkExistingLinks();
    }
  }, [user?.id]);

  const checkExistingLinks = async () => {
    if (!user?.id) return;

    // Check for approved employee links
    const { data: links } = await supabase
      .from('employee_venue_links')
      .select('venue_id, is_active, venues(id, name)')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (links && links.length > 0) {
      const venue = (links[0].venues as any);
      if (venue) {
        setStep('approved');
        onJoinComplete(venue.id, venue.name);
        return;
      }
    }

    // Check for pending invitations
    const { data: invites } = await supabase
      .from('employee_invitations')
      .select('*, venues(id, name, address, city)')
      .eq('employee_email', user.email)
      .eq('status', 'pending');

    if (invites && invites.length > 0) {
      const mappedRequests: JoinRequest[] = invites.map(inv => ({
        id: inv.id,
        venue_id: inv.venue_id,
        status: 'pending',
        created_at: inv.created_at || '',
        venue: inv.venues as any
      }));
      setPendingRequests(mappedRequests);
      setStep('pending');
    }
  };

  const searchVenues = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, address, city')
        .ilike('name', `%${searchQuery}%`)
        .limit(10);

      if (error) throw error;
      setVenues(data || []);
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Failed",
        description: "Could not search venues",
        variant: "destructive"
      });
    } finally {
      setSearching(false);
    }
  };

  const requestToJoin = async (venue: VenueSearchResult) => {
    if (!user?.id || !user?.email) return;

    setSubmitting(true);
    setSelectedVenue(venue);

    try {
      // Create a self-invite (will need venue owner approval)
      const { error } = await supabase
        .from('employee_invitations')
        .insert({
          venue_id: venue.id,
          employee_email: user.email,
          invited_by: user.id, // Self-invited
          role: 'staff',
          status: 'pending',
          permissions: {
            accept_payments: true,
            create_orders: true,
            manage_tables: true,
            view_reports: false,
            manage_staff: false,
            manage_menu: false,
            process_refunds: false
          }
        });

      if (error) throw error;

      toast({
        title: "Request Sent!",
        description: `Your request to join ${venue.name} has been sent to the venue owner.`
      });

      setPendingRequests([...pendingRequests, {
        id: 'new',
        venue_id: venue.id,
        status: 'pending',
        created_at: new Date().toISOString(),
        venue
      }]);
      setStep('pending');
    } catch (error) {
      console.error('Join request error:', error);
      toast({
        title: "Request Failed",
        description: "Could not send join request",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Store className="w-8 h-8 text-primary" />
          </div>
          <CardTitle>Join a Venue Team</CardTitle>
          <CardDescription>
            Search for your workplace to start accepting payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            {/* Search Step */}
            {step === 'search' && (
              <motion.div
                key="search"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex gap-2">
                  <Input
                    placeholder="Search venue name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchVenues()}
                  />
                  <Button onClick={searchVenues} disabled={searching}>
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                  </Button>
                </div>

                {/* Search Results */}
                {venues.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {venues.map((venue) => (
                      <motion.div
                        key={venue.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => requestToJoin(venue)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{venue.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {venue.address}, {venue.city}
                            </p>
                          </div>
                          {submitting && selectedVenue?.id === venue.id ? (
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                          ) : (
                            <Send className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {venues.length === 0 && searchQuery && !searching && (
                  <p className="text-center text-muted-foreground py-4">
                    No venues found. Try a different search.
                  </p>
                )}
              </motion.div>
            )}

            {/* Pending Approval Step */}
            {step === 'pending' && (
              <motion.div
                key="pending"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center py-4">
                  <Clock className="w-12 h-12 mx-auto mb-3 text-amber-500" />
                  <h3 className="font-semibold text-lg mb-2">Awaiting Approval</h3>
                  <p className="text-muted-foreground text-sm">
                    The venue owner needs to approve your request
                  </p>
                </div>

                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="p-4 rounded-lg border bg-amber-500/5 border-amber-500/20"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{request.venue?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Requested {new Date(request.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
                        Pending
                      </Badge>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  onClick={() => setStep('search')}
                  className="w-full"
                >
                  Search Another Venue
                </Button>
              </motion.div>
            )}

            {/* Approved Step */}
            {step === 'approved' && (
              <motion.div
                key="approved"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6"
              >
                <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
                <h3 className="font-semibold text-lg mb-2">You're All Set!</h3>
                <p className="text-muted-foreground">
                  You can now accept payments for your venue
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
};
