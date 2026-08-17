import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface EmployeePermissions {
  accept_payments: boolean;
  create_orders: boolean;
  manage_tables: boolean;
  view_reports: boolean;
  manage_staff: boolean;
  manage_menu: boolean;
  process_refunds: boolean;
  max_payment_amount?: number;
}

export interface EmployeeVenueLink {
  id: string;
  venue_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  permissions: EmployeePermissions;
  pin_hash: string | null;
  hired_date: string | null;
}

const DEFAULT_PERMISSIONS: EmployeePermissions = {
  accept_payments: true,
  create_orders: true,
  manage_tables: true,
  view_reports: false,
  manage_staff: false,
  manage_menu: false,
  process_refunds: false,
};

export const useEmployeeAuthorization = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [employeeLink, setEmployeeLink] = useState<EmployeeVenueLink | null>(null);

  // Check if current user is authorized employee for a venue
  const checkEmployeeAuthorization = useCallback(async (venueId: string): Promise<EmployeeVenueLink | null> => {
    if (!user?.id) return null;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('employee_venue_links')
        .select('*')
        .eq('user_id', user.id)
        .eq('venue_id', venueId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        console.log('Employee not found for venue:', venueId);
        return null;
      }

      const rawPermissions = data.permissions as Record<string, unknown> | null;
      const permissions: EmployeePermissions = {
        ...DEFAULT_PERMISSIONS,
        ...(rawPermissions || {}),
      };

      const link: EmployeeVenueLink = {
        ...data,
        is_active: data.is_active ?? false,
        permissions,
      };

      setEmployeeLink(link);
      return link;
    } catch (error) {
      console.error('Error checking employee authorization:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Check if employee has a specific permission
  const hasPermission = useCallback((permission: keyof EmployeePermissions): boolean => {
    if (!employeeLink) return false;
    return employeeLink.permissions[permission] === true;
  }, [employeeLink]);

  // Check if employee can accept payment of a certain amount
  const canAcceptPayment = useCallback((amount: number): { allowed: boolean; reason?: string } => {
    if (!employeeLink) {
      return { allowed: false, reason: 'Not authorized as employee' };
    }

    if (!employeeLink.is_active) {
      return { allowed: false, reason: 'Employee account is inactive' };
    }

    if (!employeeLink.permissions.accept_payments) {
      return { allowed: false, reason: 'No payment acceptance permission' };
    }

    const maxAmount = employeeLink.permissions.max_payment_amount;
    if (maxAmount && amount > maxAmount) {
      return { 
        allowed: false, 
        reason: `Amount exceeds your limit ($${maxAmount.toFixed(2)})` 
      };
    }

    return { allowed: true };
  }, [employeeLink]);

  // Verify employee PIN via secure server-side edge function
  const verifyEmployeePIN = useCallback(async (pin: string, venueId: string): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { data, error } = await supabase.functions.invoke('verify-employee-pin', {
        body: { action: 'verify', pin, venue_id: venueId }
      });

      if (error) {
        console.error('PIN verification error:', error);
        toast({
          title: "Verification Failed",
          description: "Could not verify PIN. Please try again.",
          variant: "destructive"
        });
        return false;
      }

      if (data?.locked) {
        toast({
          title: "Account Locked",
          description: data.error || "Too many attempts. Please try again later.",
          variant: "destructive"
        });
        return false;
      }

      if (data?.pinNotRequired) {
        return true;
      }

      if (!data?.valid) {
        toast({
          title: "Invalid PIN",
          description: data?.remainingAttempts !== undefined 
            ? `Please try again. ${data.remainingAttempts} attempts remaining.`
            : "Please try again",
          variant: "destructive"
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error('PIN verification error:', error);
      toast({
        title: "Verification Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
      return false;
    }
  }, [user?.id]);

  // Set employee PIN via secure server-side edge function
  const setEmployeePIN = useCallback(async (pin: string, venueId: string): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { data, error } = await supabase.functions.invoke('verify-employee-pin', {
        body: { action: 'set', pin, venue_id: venueId }
      });

      if (error || !data?.success) {
        toast({
          title: "Failed to Set PIN",
          description: data?.error || "Could not set PIN. Please try again.",
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "PIN Set Successfully",
        description: "Your PIN is now active for payment verification"
      });
      return true;
    } catch (error) {
      console.error('Error setting PIN:', error);
      toast({
        title: "Failed to Set PIN",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
      return false;
    }
  }, [user?.id]);

  // Log payment action for audit trail
  const logPaymentAction = useCallback(async (
    venueId: string,
    action: 'payment_initiated' | 'payment_completed' | 'payment_failed' | 'refund_processed',
    details: {
      amount: number;
      orderId?: string;
      customerId?: string;
      paymentMethod: string;
      errorMessage?: string;
    }
  ): Promise<void> => {
    if (!user?.id || !employeeLink) return;

    try {
      // Insert into admin_audit_log for comprehensive tracking
      await supabase.from('admin_audit_log').insert({
        admin_id: user.id,
        action_type: action,
        target_type: 'payment',
        target_id: details.orderId || null,
        details: {
          venue_id: venueId,
          employee_role: employeeLink.role,
          amount: details.amount,
          customer_id: details.customerId,
          payment_method: details.paymentMethod,
          error: details.errorMessage,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Failed to log payment action:', error);
      // Don't throw - logging should not block the payment
    }
  }, [user?.id, employeeLink]);

  return {
    loading,
    employeeLink,
    checkEmployeeAuthorization,
    hasPermission,
    canAcceptPayment,
    verifyEmployeePIN,
    setEmployeePIN,
    logPaymentAction,
    DEFAULT_PERMISSIONS,
  };
};
