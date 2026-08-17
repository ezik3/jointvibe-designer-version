drop policy if exists "Public can view paid live ad bookings" on public.ad_bookings;

create policy "Public can view paid live ad bookings"
on public.ad_bookings
for select
to public
using (
  payment_status = 'paid'
  and exists (
    select 1
    from public.ad_campaigns
    where ad_campaigns.id = ad_bookings.campaign_id
      and ad_campaigns.status = 'live'
  )
);