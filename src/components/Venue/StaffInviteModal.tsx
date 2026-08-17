import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, User, ShieldCheck, Check, ArrowLeft, ArrowRight, AtSign, Send, Clock, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from 'react-i18next';
import "./staff-invite-modal.css";

interface StaffInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FoundUser {
  id: string;
  displayName: string;
  username: string;
  avatar: string;
  bio?: string;
}

const roleOptions = [
  { value: "kitchen", label: "Kitchen Staff", description: "Access to kitchen displays and order management" },
  { value: "waiter", label: "Waiter/Server", description: "POS, orders, table management" },
  { value: "bartender", label: "Bartender", description: "POS, bar orders" },
  { value: "host", label: "Host", description: "Table management, reservations" },
  { value: "manager", label: "Sub-Manager", description: "Extended access, staff management" },
];

const permissionOptions = [
  { key: "pos", label: "Take Orders", description: "Create and modify orders" },
  { key: "kitchen", label: "Kitchen Display", description: "View kitchen orders" },
  { key: "tables", label: "Table Management", description: "Manage table status" },
  { key: "orders", label: "View Orders", description: "See all orders" },
  { key: "menu", label: "Menu Management", description: "Edit menu items" },
  { key: "inventory", label: "Inventory", description: "Manage stock levels" },
  { key: "analytics", label: "Analytics", description: "View reports" },
  { key: "staff", label: "Staff Management", description: "Manage employees" },
  { key: "floorplan", label: "Edit Floorplan", description: "Modify venue floor layout" },
  { key: "go_live", label: "Go Live", description: "Broadcast live video streams" },
];

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function StaffInviteModal({ isOpen, onClose }: StaffInviteModalProps) {
  const { t } = useTranslation('venue');
  const [step, setStep] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FoundUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<FoundUser | null>(null);
  const [selectedRole, setSelectedRole] = useState("waiter");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    pos: true, kitchen: false, tables: true, orders: true,
    menu: false, inventory: false, analytics: false, staff: false, floorplan: false, go_live: false
  });
  const [generatedPin, setGeneratedPin] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  // Step 4: Roster state
  const [rosterShifts, setRosterShifts] = useState<Record<string, { enabled: boolean; start: string; end: string }>>(() => {
    const initial: Record<string, { enabled: boolean; start: string; end: string }> = {};
    DAYS_OF_WEEK.forEach(day => {
      initial[day] = { enabled: false, start: "09:00", end: "17:00" };
    });
    return initial;
  });
  const [savingRoster, setSavingRoster] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeSearch = useCallback(async (query: string) => {
    const cleaned = query.replace(/^@+/, "").trim();
    if (!cleaned) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    
    const { data, error } = await supabase
      .from("customer_profiles")
      .select("id, user_id, display_name, bio, avatar_url")
      .ilike("display_name", `%${cleaned}%`)
      .limit(10);
    
    if (error) {
      console.error("Search error:", error);
      toast.error("Failed to search users");
      setSearchResults([]);
    } else if (data && data.length > 0) {
      setSearchResults(data.map(p => ({
        id: p.user_id,
        displayName: p.display_name || "Unknown",
        username: `@${(p.display_name || "user").toLowerCase().replace(/\s+/g, "_")}`,
        avatar: p.avatar_url || "",
        bio: p.bio || ""
      })));
    } else {
      setSearchResults([]);
    }
    setSearching(false);
  }, []);

  // Debounced auto-search as user types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      executeSearch(searchQuery);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, executeSearch]);

  const handleSearch = () => {
    executeSearch(searchQuery);
  };

  const handleRoleChange = (role: string) => {
    setSelectedRole(role);
    const rolePermissions: Record<string, Record<string, boolean>> = {
      kitchen: { pos: false, kitchen: true, tables: false, orders: true, menu: false, inventory: false, analytics: false, staff: false, floorplan: false, go_live: false },
      waiter: { pos: true, kitchen: false, tables: true, orders: true, menu: false, inventory: false, analytics: false, staff: false, floorplan: false, go_live: false },
      bartender: { pos: true, kitchen: false, tables: false, orders: true, menu: false, inventory: false, analytics: false, staff: false, floorplan: false, go_live: false },
      host: { pos: false, kitchen: false, tables: true, orders: false, menu: false, inventory: false, analytics: false, staff: false, floorplan: false, go_live: false },
      manager: { pos: true, kitchen: true, tables: true, orders: true, menu: true, inventory: true, analytics: true, staff: true, floorplan: true, go_live: true },
    };
    setPermissions(rolePermissions[role] || permissions);
  };

  const generatePin = () => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedPin(pin);
    setStep(3);
  };

  // Send invite: save to DB + send notification to employee
  const handleSendInvite = async () => {
    if (!selectedUser) return;
    setSendingInvite(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in");
        setSendingInvite(false);
        return;
      }

      // Get venue info for the notification
      const { data: venueData } = await (supabase as any)
        .from("venues")
        .select("id, name")
        .eq("owner_user_id", user.id)
        .single();
      
      if (!venueData?.id) {
        toast.error("Could not find your venue");
        setSendingInvite(false);
        return;
      }
      const venueName = venueData.name || "A venue";

      // Check for existing pending invitation for this employee at this venue
      const { data: existingInvite } = await (supabase as any)
        .from("employee_invitations")
        .select("id")
        .eq("employee_user_id", selectedUser.id)
        .eq("venue_id", venueData.id)
        .eq("status", "pending")
        .maybeSingle();

      if (existingInvite) {
        toast.error(`${selectedUser.displayName} already has a pending invitation for this venue`);
        setSendingInvite(false);
        return;
      }

      // Also check if already an active employee
      const { data: existingLink } = await (supabase as any)
        .from("employee_venue_links")
        .select("id")
        .eq("user_id", selectedUser.id)
        .eq("venue_id", venueData.id)
        .eq("is_active", true)
        .maybeSingle();

      if (existingLink) {
        toast.error(`${selectedUser.displayName} is already an active employee at this venue`);
        setSendingInvite(false);
        return;
      }

      // Save invitation to employee_invitations
      const { error: inviteError } = await supabase.from("employee_invitations").insert({
        venue_id: venueData.id,
        employee_email: selectedUser.displayName,
        employee_user_id: selectedUser.id,
        pin_code: generatedPin,
        invited_by: user.id,
        role: selectedRole,
        permissions: permissions,
        status: "pending"
      } as any);

      if (inviteError) {
        console.error("Error saving invitation:", inviteError);
        toast.error("Failed to send invitation");
        setSendingInvite(false);
        return;
      }

      // Send notification to the employee
      const roleName = roleOptions.find(r => r.value === selectedRole)?.label || selectedRole;
      const { error: notifError } = await supabase.from("customer_notifications").insert({
        user_id: selectedUser.id,
        type: "staff_invite",
        title: `${venueName} wants you on their team!`,
        message: `You've been invited to join as ${roleName}. Tap to view and accept.`,
        reference_id: selectedUser.id, // we'll use this to look up the invitation
        reference_type: "staff_invite",
        read: false
      });

      if (notifError) {
        console.error("Error sending notification:", notifError);
        // Invitation was saved, just notification failed
        toast.warning("Invitation saved but notification couldn't be sent");
      } else {
        toast.success(`Invitation sent to ${selectedUser.displayName}!`);
      }

      // Move to Step 4: Roster
      setStep(4);
    } catch (err) {
      console.error("Invite error:", err);
      toast.error("Something went wrong");
    } finally {
      setSendingInvite(false);
    }
  };

  // Save roster shifts
  const handleSaveRoster = async () => {
    if (!selectedUser) return;
    setSavingRoster(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSavingRoster(false);
        return;
      }

      const enabledDays = Object.entries(rosterShifts).filter(([, v]) => v.enabled);
      if (enabledDays.length === 0) {
        toast.error("Please enable at least one day");
        setSavingRoster(false);
        return;
      }

      // Get venue info for notification
      const { data: venueData } = await (supabase as any)
        .from("venues")
        .select("id, name")
        .eq("owner_user_id", user.id)
        .single();
      const venueName = venueData?.name || "Your venue";
      const venueId = venueData?.id;

      if (!venueId) {
        toast.error("Could not find your venue");
        setSavingRoster(false);
        return;
      }

      // Insert roster entries
      const rosterEntries = enabledDays.map(([day, shift]) => ({
        venue_id: venueId,
        employee_id: selectedUser.id,
        day_of_week: day.toLowerCase(),
        start_time: shift.start,
        end_time: shift.end,
        is_recurring: true
      }));

      const { error: rosterError } = await supabase.from("employee_roster").insert(rosterEntries);

      if (rosterError) {
        console.error("Error saving roster:", rosterError);
        toast.error("Failed to save roster");
        setSavingRoster(false);
        return;
      }

      // Send shift notification to employee
      const shiftSummary = enabledDays.map(([day, shift]) => `${day}: ${shift.start}-${shift.end}`).join(", ");
      await supabase.from("customer_notifications").insert({
        user_id: selectedUser.id,
        type: "shift_update",
        title: "New shifts assigned",
        message: `${venueName} has rostered you: ${shiftSummary}`,
        reference_type: "shift_created",
        read: false
      });

      toast.success("Roster saved and employee notified!");
      handleClose();
    } catch (err) {
      console.error("Roster save error:", err);
      toast.error("Failed to save roster");
    } finally {
      setSavingRoster(false);
    }
  };

  const handleClose = () => {
    onClose();
    setStep(1);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedUser(null);
    setGeneratedPin("");
    setSendingInvite(false);
    setSavingRoster(false);
    // Reset roster
    const initial: Record<string, { enabled: boolean; start: string; end: string }> = {};
    DAYS_OF_WEEK.forEach(day => {
      initial[day] = { enabled: false, start: "09:00", end: "17:00" };
    });
    setRosterShifts(initial);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="staff-invite-dialog !gap-0 !p-0">
        <DialogHeader className="staff-invite-dialog__heading !space-y-0">
          <DialogTitle className="staff-invite-dialog__title">
            {step === 1 && "Search User Profile"}
            {step === 2 && "Configure Access"}
            {step === 3 && "Review & Send Invite"}
            {step === 4 && "Create Roster"}
            <span>Step {step} of 4</span>
          </DialogTitle>
          <DialogDescription className="staff-invite-dialog__description">
            {step === 1 && "Search for an existing user profile in the app"}
            {step === 2 && "Set role and permissions for this employee"}
            {step === 3 && "Review details and send the invitation"}
            {step === 4 && "Set up their weekly shift schedule (optional)"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="staff-invite-dialog__scroll">
          {/* Step 1: Search by Profile */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by profile name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="pl-10 bg-slate-800 border-slate-600 text-white"
                  />
                </div>
                <Button onClick={handleSearch} disabled={searching} className="bg-primary">
                  {searching ? "..." : <Search className="w-4 h-4" />}
                </Button>
              </div>

              <p className="text-xs text-slate-500 flex items-center gap-1">
                <AtSign className="w-3 h-3" /> Find users by their profile display name within the app
              </p>

              {searchResults.length === 0 && searchQuery && !searching && (
                <div className="text-center py-8">
                  <User className="h-12 w-12 mx-auto text-slate-500 mb-3" />
                  <p className="text-slate-400">No users found matching "{searchQuery}"</p>
                  <p className="text-xs text-slate-500 mt-1">Try a different search term</p>
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {searchResults.map((user) => (
                    <Card
                      key={user.id}
                      className={`cursor-pointer transition-all border-2 ${
                        selectedUser?.id === user.id 
                          ? "border-primary bg-primary/10" 
                          : "border-slate-700 bg-slate-800 hover:border-slate-600"
                      }`}
                      onClick={() => setSelectedUser(user)}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback className="bg-primary/20 text-white">{user.displayName[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-medium text-white">{user.displayName}</p>
                          <p className="text-sm text-primary">{user.username}</p>
                          {user.bio && <p className="text-xs text-slate-400">{user.bio}</p>}
                        </div>
                        {selectedUser?.id === user.id && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!selectedUser}
                  className="bg-primary"
                >
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Configure (Face ID removed — it's the employee's choice) */}
          {step === 2 && (
            <div className="space-y-4">
              {selectedUser && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardContent className="p-3 flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={selectedUser.avatar} />
                      <AvatarFallback className="text-white">{selectedUser.displayName[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-white">{selectedUser.displayName}</p>
                      <p className="text-sm text-primary">{selectedUser.username}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                <Label className="text-white">Role</Label>
                <Select value={selectedRole} onValueChange={handleRoleChange}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="staff-invite-dialog__select-content">
                    {roleOptions.map((role) => (
                      <SelectItem key={role.value} value={role.value} className="staff-invite-dialog__select-item">
                        <div>
                          <p className="font-medium">{role.label}</p>
                          <p className="text-xs text-slate-400">{role.description}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Permissions</Label>
                <div className="grid grid-cols-2 gap-2">
                  {permissionOptions.map((perm) => (
                    <div
                      key={perm.key}
                      className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                        permissions[perm.key] 
                          ? "border-primary/50 bg-primary/10" 
                          : "border-slate-700 bg-slate-800"
                      }`}
                    >
                      <Checkbox
                        checked={permissions[perm.key]}
                        onCheckedChange={(checked) => 
                          setPermissions({...permissions, [perm.key]: !!checked})
                        }
                        className="border-slate-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-white">{perm.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(1)} className="border-slate-600 text-white hover:text-white">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={generatePin} className="bg-green-600 hover:bg-green-700">
                  <ShieldCheck className="mr-2 h-4 w-4" /> Generate PIN
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Review & Send Invite */}
          {step === 3 && (
            <div className="space-y-4 text-center">
              <div className="staff-invite-dialog__pin-card p-6">
                <ShieldCheck className="staff-invite-dialog__pin-icon h-12 w-12 mx-auto mb-4" />
                <p className="text-sm text-slate-400 mb-2">Employee Work Mode PIN</p>
                <p className="text-4xl font-mono font-bold tracking-[0.5em] text-white">
                  {generatedPin}
                </p>
                <p className="text-xs text-slate-500 mt-3">
                  This PIN will be sent automatically to {selectedUser?.displayName} when you send the invite.
                </p>
              </div>

              <div className="bg-slate-800 rounded-lg p-4 text-left">
                <p className="font-medium mb-2 text-white">Summary</p>
                <div className="text-sm text-slate-400 space-y-1">
                  <p><span className="text-white">Employee:</span> {selectedUser?.displayName}</p>
                  <p><span className="text-white">Role:</span> {roleOptions.find(r => r.value === selectedRole)?.label}</p>
                  <p><span className="text-white">Permissions:</span> {Object.entries(permissions).filter(([,v]) => v).map(([k]) => k).join(", ")}</p>
                </div>
              </div>

              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                <p className="text-sm text-orange-400">
                  <strong>Important:</strong> When on shift, employee will be in Work Mode only — no social features available.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1 border-slate-600 text-white hover:text-white">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={handleSendInvite}
                  disabled={sendingInvite}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  {sendingInvite ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
                  ) : (
                    <><Send className="mr-2 h-4 w-4" /> Invite {selectedUser?.displayName}</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Roster creation */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-3">
                <Check className="h-6 w-6 text-green-400 flex-shrink-0" />
                <div>
                  <p className="font-medium text-green-400">Invitation Sent!</p>
                  <p className="text-xs text-slate-400">{selectedUser?.displayName} will receive a notification to accept.</p>
                </div>
              </div>

              <div>
                <Label className="text-white flex items-center gap-2 mb-3">
                  <Calendar className="h-4 w-4" /> Weekly Roster for {selectedUser?.displayName}
                </Label>
                <div className="space-y-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <div key={day} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      rosterShifts[day].enabled ? "border-primary/50 bg-primary/5" : "border-slate-700 bg-slate-800/50"
                    }`}>
                      <Checkbox
                        checked={rosterShifts[day].enabled}
                        onCheckedChange={(checked) => setRosterShifts(prev => ({
                          ...prev, [day]: { ...prev[day], enabled: !!checked }
                        }))}
                        className="border-slate-500"
                      />
                      <span className="text-sm font-medium text-white w-24">{day}</span>
                      {rosterShifts[day].enabled && (
                        <div className="flex items-center gap-2 flex-1">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-slate-400" />
                            <Input
                              type="time"
                              value={rosterShifts[day].start}
                              onChange={(e) => setRosterShifts(prev => ({
                                ...prev, [day]: { ...prev[day], start: e.target.value }
                              }))}
                              className="h-8 w-28 bg-slate-700 border-slate-600 text-white text-xs"
                            />
                          </div>
                          <span className="text-slate-500 text-xs">to</span>
                          <Input
                            type="time"
                            value={rosterShifts[day].end}
                            onChange={(e) => setRosterShifts(prev => ({
                              ...prev, [day]: { ...prev[day], end: e.target.value }
                            }))}
                            className="h-8 w-28 bg-slate-700 border-slate-600 text-white text-xs"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={handleClose} className="flex-1 border-slate-600 text-white hover:text-white">
                  Skip for Now
                </Button>
                <Button
                  onClick={handleSaveRoster}
                  disabled={savingRoster || !Object.values(rosterShifts).some(s => s.enabled)}
                  className="flex-1 bg-primary"
                >
                  {savingRoster ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                  ) : (
                    <>Save Roster</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
