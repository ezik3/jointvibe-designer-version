
-- Helper function to check admin roles
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner_superadmin', 'admin_manager', 'admin_support', 'admin_finance', 'admin_compliance')
  )
$$;

-- RLS Policies for venue_wallets
CREATE POLICY "Venues can view own wallet" ON public.venue_wallets FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employee_venue_links WHERE venue_id = venue_wallets.venue_id AND user_id = auth.uid() AND is_active = true)
);
CREATE POLICY "Admins can view all venue wallets" ON public.venue_wallets FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can update venue wallets" ON public.venue_wallets FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "System can insert venue wallets" ON public.venue_wallets FOR INSERT WITH CHECK (true);

-- RLS Policies for transactions
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT USING (
  (from_wallet_type = 'user' AND from_wallet_id = auth.uid()) OR 
  (to_wallet_type = 'user' AND to_wallet_id = auth.uid())
);
CREATE POLICY "Admins can view all transactions" ON public.transactions FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "System can insert transactions" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update transactions" ON public.transactions FOR UPDATE USING (true);

-- RLS Policies for ledger_entries
CREATE POLICY "Users can view own ledger entries" ON public.ledger_entries FOR SELECT USING (
  wallet_type = 'user' AND wallet_id = auth.uid()
);
CREATE POLICY "Admins can view all ledger entries" ON public.ledger_entries FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "System can insert ledger entries" ON public.ledger_entries FOR INSERT WITH CHECK (true);

-- RLS Policies for mint_burn_audit
CREATE POLICY "Admins can view mint burn audit" ON public.mint_burn_audit FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "System can insert mint burn audit" ON public.mint_burn_audit FOR INSERT WITH CHECK (true);

-- RLS Policies for deposit_records
CREATE POLICY "Users can view own deposits" ON public.deposit_records FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can view all deposits" ON public.deposit_records FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Users can create deposits" ON public.deposit_records FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "System can update deposits" ON public.deposit_records FOR UPDATE USING (true);

-- RLS Policies for withdrawal_records
CREATE POLICY "Users can view own withdrawals" ON public.withdrawal_records FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can view all withdrawals" ON public.withdrawal_records FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Users can create withdrawals" ON public.withdrawal_records FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "System can update withdrawals" ON public.withdrawal_records FOR UPDATE USING (true);

-- RLS Policies for platform_treasury
CREATE POLICY "Finance admins can view treasury" ON public.platform_treasury FOR SELECT USING (
  has_role(auth.uid(), 'owner_superadmin') OR has_role(auth.uid(), 'admin_finance')
);
CREATE POLICY "System can update treasury" ON public.platform_treasury FOR UPDATE USING (true);

-- RLS Policies for exchange_rates (public read)
CREATE POLICY "Anyone can view exchange rates" ON public.exchange_rates FOR SELECT USING (true);
CREATE POLICY "System can manage exchange rates" ON public.exchange_rates FOR ALL USING (true);

-- RLS Policies for wallet_freezes
CREATE POLICY "Compliance admins can view freezes" ON public.wallet_freezes FOR SELECT USING (
  has_role(auth.uid(), 'owner_superadmin') OR has_role(auth.uid(), 'admin_compliance')
);
CREATE POLICY "Compliance admins can create freezes" ON public.wallet_freezes FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'owner_superadmin') OR has_role(auth.uid(), 'admin_compliance')
);
CREATE POLICY "Compliance admins can update freezes" ON public.wallet_freezes FOR UPDATE USING (
  has_role(auth.uid(), 'owner_superadmin') OR has_role(auth.uid(), 'admin_compliance')
);

-- RLS Policies for admin_audit_log
CREATE POLICY "Admins can view audit log" ON public.admin_audit_log FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "System can insert audit log" ON public.admin_audit_log FOR INSERT WITH CHECK (true);
