export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ad_analytics: {
        Row: {
          booking_id: string | null
          campaign_id: string
          city: string | null
          clicks: number | null
          created_at: string | null
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          placement_type:
            | Database["public"]["Enums"]["ad_placement_type"]
            | null
          signups_completed: number
          signups_started: number
          updated_at: string | null
        }
        Insert: {
          booking_id?: string | null
          campaign_id: string
          city?: string | null
          clicks?: number | null
          created_at?: string | null
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          placement_type?:
            | Database["public"]["Enums"]["ad_placement_type"]
            | null
          signups_completed?: number
          signups_started?: number
          updated_at?: string | null
        }
        Update: {
          booking_id?: string | null
          campaign_id?: string
          city?: string | null
          clicks?: number | null
          created_at?: string | null
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          placement_type?:
            | Database["public"]["Enums"]["ad_placement_type"]
            | null
          signups_completed?: number
          signups_started?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_analytics_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ad_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_analytics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_bookings: {
        Row: {
          base_price: number
          bid_amount: number | null
          campaign_id: string
          created_at: string | null
          end_date: string
          final_price: number
          id: string
          payment_status: string | null
          placement_type: Database["public"]["Enums"]["ad_placement_type"]
          start_date: string
          stripe_payment_intent_id: string | null
          target_cities: string[]
          target_locations: Json | null
          updated_at: string | null
        }
        Insert: {
          base_price: number
          bid_amount?: number | null
          campaign_id: string
          created_at?: string | null
          end_date: string
          final_price: number
          id?: string
          payment_status?: string | null
          placement_type: Database["public"]["Enums"]["ad_placement_type"]
          start_date: string
          stripe_payment_intent_id?: string | null
          target_cities: string[]
          target_locations?: Json | null
          updated_at?: string | null
        }
        Update: {
          base_price?: number
          bid_amount?: number | null
          campaign_id?: string
          created_at?: string | null
          end_date?: string
          final_price?: number
          id?: string
          payment_status?: string | null
          placement_type?: Database["public"]["Enums"]["ad_placement_type"]
          start_date?: string
          stripe_payment_intent_id?: string | null
          target_cities?: string[]
          target_locations?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_bookings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          advertiser_id: string
          auto_details: Json | null
          bathrooms: number | null
          bedrooms: number | null
          campaign_type: Database["public"]["Enums"]["advertiser_vertical"]
          city: string
          created_at: string | null
          cta_text: string | null
          cta_url: string | null
          description: string | null
          headline: string
          id: string
          parking: number | null
          property_address: string | null
          property_price: number | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["ad_campaign_status"] | null
          updated_at: string | null
        }
        Insert: {
          advertiser_id: string
          auto_details?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          campaign_type?: Database["public"]["Enums"]["advertiser_vertical"]
          city: string
          created_at?: string | null
          cta_text?: string | null
          cta_url?: string | null
          description?: string | null
          headline: string
          id?: string
          parking?: number | null
          property_address?: string | null
          property_price?: number | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["ad_campaign_status"] | null
          updated_at?: string | null
        }
        Update: {
          advertiser_id?: string
          auto_details?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          campaign_type?: Database["public"]["Enums"]["advertiser_vertical"]
          city?: string
          created_at?: string | null
          cta_text?: string | null
          cta_url?: string | null
          description?: string | null
          headline?: string
          id?: string
          parking?: number | null
          property_address?: string | null
          property_price?: number | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["ad_campaign_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "advertisers"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_media: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          media_type: string | null
          media_url: string
          sort_order: number | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          media_type?: string | null
          media_url: string
          sort_order?: number | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          media_type?: string | null
          media_url?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_media_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action_type: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      advertisers: {
        Row: {
          advertiser_type: Database["public"]["Enums"]["advertiser_vertical"]
          company_name: string | null
          contact_email: string
          contact_phone: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          license_number: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          advertiser_type?: Database["public"]["Enums"]["advertiser_vertical"]
          company_name?: string | null
          contact_email: string
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          license_number?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          advertiser_type?: Database["public"]["Enums"]["advertiser_vertical"]
          company_name?: string | null
          contact_email?: string
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          license_number?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_knowledge_docs: {
        Row: {
          content: string
          created_at: string
          doc_type: string
          embedding: string | null
          id: string
          metadata: Json | null
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          doc_type: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          doc_type?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_docs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          mode: string
          role: string
          session_id: string
          user_id: string
          venue_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          mode: string
          role: string
          session_id: string
          user_id: string
          venue_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          mode?: string
          role?: string
          session_id?: string
          user_id?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          plan: string
          started_at: string
          tokens_purchased: number
          tokens_remaining: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan?: string
          started_at?: string
          tokens_purchased?: number
          tokens_remaining?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan?: string
          started_at?: string
          tokens_purchased?: number
          tokens_remaining?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_token_limits: {
        Row: {
          created_at: string
          daily_discovery_limit: number
          daily_general_limit: number
          id: string
          monthly_discovery_limit: number
          monthly_general_limit: number
          plan: string
          venue_unlimited: boolean
        }
        Insert: {
          created_at?: string
          daily_discovery_limit?: number
          daily_general_limit?: number
          id?: string
          monthly_discovery_limit?: number
          monthly_general_limit?: number
          plan: string
          venue_unlimited?: boolean
        }
        Update: {
          created_at?: string
          daily_discovery_limit?: number
          daily_general_limit?: number
          id?: string
          monthly_discovery_limit?: number
          monthly_general_limit?: number
          plan?: string
          venue_unlimited?: boolean
        }
        Relationships: []
      }
      ai_topups: {
        Row: {
          amount_jvc: number
          amount_usd: number
          created_at: string
          id: string
          payment_method: string
          status: string
          stripe_payment_id: string | null
          tokens_purchased: number
          user_id: string
        }
        Insert: {
          amount_jvc: number
          amount_usd: number
          created_at?: string
          id?: string
          payment_method: string
          status?: string
          stripe_payment_id?: string | null
          tokens_purchased: number
          user_id: string
        }
        Update: {
          amount_jvc?: number
          amount_usd?: number
          created_at?: string
          id?: string
          payment_method?: string
          status?: string
          stripe_payment_id?: string | null
          tokens_purchased?: number
          user_id?: string
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          created_at: string
          discovery_tokens_used: number
          general_tokens_used: number
          id: string
          last_reset: string
          period_start: string
          period_type: string
          tier: string
          tokens_used: number
          updated_at: string
          user_id: string
          venue_tokens_used: number
        }
        Insert: {
          created_at?: string
          discovery_tokens_used?: number
          general_tokens_used?: number
          id?: string
          last_reset?: string
          period_start: string
          period_type: string
          tier?: string
          tokens_used?: number
          updated_at?: string
          user_id: string
          venue_tokens_used?: number
        }
        Update: {
          created_at?: string
          discovery_tokens_used?: number
          general_tokens_used?: number
          id?: string
          last_reset?: string
          period_start?: string
          period_type?: string
          tier?: string
          tokens_used?: number
          updated_at?: string
          user_id?: string
          venue_tokens_used?: number
        }
        Relationships: []
      }
      bridge_customers: {
        Row: {
          bridge_customer_id: string | null
          country_code: string | null
          created_at: string
          id: string
          kyc_link: string | null
          kyc_link_expires_at: string | null
          kyc_status: string
          rejection_reason: string | null
          tos_accepted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bridge_customer_id?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          kyc_link?: string | null
          kyc_link_expires_at?: string | null
          kyc_status?: string
          rejection_reason?: string | null
          tos_accepted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bridge_customer_id?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          kyc_link?: string | null
          kyc_link_expires_at?: string | null
          kyc_status?: string
          rejection_reason?: string | null
          tos_accepted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bridge_external_accounts: {
        Row: {
          account_label: string | null
          beneficiary_name: string | null
          bridge_external_account_id: string | null
          created_at: string
          currency: string
          id: string
          is_default: boolean
          rail: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_label?: string | null
          beneficiary_name?: string | null
          bridge_external_account_id?: string | null
          created_at?: string
          currency: string
          id?: string
          is_default?: boolean
          rail: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_label?: string | null
          beneficiary_name?: string | null
          bridge_external_account_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          rail?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bridge_transfers: {
        Row: {
          bank_reference: string | null
          bridge_transfer_id: string | null
          completed_at: string | null
          created_at: string
          destination_amount: number | null
          destination_currency: string
          direction: string
          estimated_arrival: string | null
          external_account_id: string | null
          failure_reason: string | null
          fee_usd: number
          id: string
          source_amount: number
          source_asset: string
          status: string
          user_id: string
          xrpl_tx_hash: string | null
        }
        Insert: {
          bank_reference?: string | null
          bridge_transfer_id?: string | null
          completed_at?: string | null
          created_at?: string
          destination_amount?: number | null
          destination_currency: string
          direction?: string
          estimated_arrival?: string | null
          external_account_id?: string | null
          failure_reason?: string | null
          fee_usd?: number
          id?: string
          source_amount: number
          source_asset: string
          status?: string
          user_id: string
          xrpl_tx_hash?: string | null
        }
        Update: {
          bank_reference?: string | null
          bridge_transfer_id?: string | null
          completed_at?: string | null
          created_at?: string
          destination_amount?: number | null
          destination_currency?: string
          direction?: string
          estimated_arrival?: string | null
          external_account_id?: string | null
          failure_reason?: string | null
          fee_usd?: number
          id?: string
          source_amount?: number
          source_asset?: string
          status?: string
          user_id?: string
          xrpl_tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bridge_transfers_external_account_id_fkey"
            columns: ["external_account_id"]
            isOneToOne: false
            referencedRelation: "bridge_external_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bridge_virtual_accounts: {
        Row: {
          account_number: string | null
          beneficiary_name: string | null
          bic: string | null
          bridge_virtual_account_id: string | null
          created_at: string
          currency: string
          destination_asset: string
          iban: string | null
          id: string
          routing_number: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number?: string | null
          beneficiary_name?: string | null
          bic?: string | null
          bridge_virtual_account_id?: string | null
          created_at?: string
          currency: string
          destination_asset?: string
          iban?: string | null
          id?: string
          routing_number?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string | null
          beneficiary_name?: string | null
          bic?: string | null
          bridge_virtual_account_id?: string | null
          created_at?: string
          currency?: string
          destination_asset?: string
          iban?: string | null
          id?: string
          routing_number?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bridge_webhook_events: {
        Row: {
          bridge_event_id: string
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          received_at: string
        }
        Insert: {
          bridge_event_id: string
          error?: string | null
          event_type: string
          id?: string
          payload: Json
          processed?: boolean
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          bridge_event_id?: string
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
      check_ins: {
        Row: {
          checked_in_at: string | null
          checked_out_at: string | null
          id: string
          table_number: string | null
          user_id: string
          venue_id: string
          visibility: string | null
        }
        Insert: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          id?: string
          table_number?: string | null
          user_id: string
          venue_id: string
          visibility?: string | null
        }
        Update: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          id?: string
          table_number?: string | null
          user_id?: string
          venue_id?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      city_products: {
        Row: {
          city: string
          country: string
          created_at: string | null
          currency: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          pass_type: string
          price_cents: number
          slug: string
          sold_count: number
          stripe_price_id: string | null
          tier: string
          total_supply: number
          updated_at: string | null
        }
        Insert: {
          city: string
          country: string
          created_at?: string | null
          currency?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          pass_type?: string
          price_cents?: number
          slug: string
          sold_count?: number
          stripe_price_id?: string | null
          tier?: string
          total_supply?: number
          updated_at?: string | null
        }
        Update: {
          city?: string
          country?: string
          created_at?: string | null
          currency?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          pass_type?: string
          price_cents?: number
          slug?: string
          sold_count?: number
          stripe_price_id?: string | null
          tier?: string
          total_supply?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      content_translations: {
        Row: {
          confidence: number | null
          content_id: string
          content_type: string
          created_at: string
          id: string
          provider: string
          source_hash: string
          source_lang: string
          target_lang: string
          translated_text: string
        }
        Insert: {
          confidence?: number | null
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          provider?: string
          source_hash: string
          source_lang: string
          target_lang: string
          translated_text: string
        }
        Update: {
          confidence?: number | null
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          provider?: string
          source_hash?: string
          source_lang?: string
          target_lang?: string
          translated_text?: string
        }
        Relationships: []
      }
      country_subsidy_usage: {
        Row: {
          country_code: string
          created_at: string | null
          daily_deposit_count: number | null
          daily_subsidy_total: number | null
          date: string
          id: string
          monthly_deposit_count: number | null
          monthly_subsidy_total: number | null
          updated_at: string | null
        }
        Insert: {
          country_code: string
          created_at?: string | null
          daily_deposit_count?: number | null
          daily_subsidy_total?: number | null
          date?: string
          id?: string
          monthly_deposit_count?: number | null
          monthly_subsidy_total?: number | null
          updated_at?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string | null
          daily_deposit_count?: number | null
          daily_subsidy_total?: number | null
          date?: string
          id?: string
          monthly_deposit_count?: number | null
          monthly_subsidy_total?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crypto_deposit_addresses: {
        Row: {
          created_at: string
          destination_tag: number
          hot_wallet_address: string
          id: string
          is_active: boolean
          network: string
          preferred_asset: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination_tag: number
          hot_wallet_address: string
          id?: string
          is_active?: boolean
          network: string
          preferred_asset?: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination_tag?: number
          hot_wallet_address?: string
          id?: string
          is_active?: boolean
          network?: string
          preferred_asset?: string
          user_id?: string
        }
        Relationships: []
      }
      crypto_deposits: {
        Row: {
          amount_received: number
          asset_received: string
          credited_at: string | null
          destination_tag: number | null
          detected_at: string
          failure_reason: string | null
          id: string
          jvc_credited: number
          ledger_index: number | null
          network: string
          pending_until: string | null
          raw_tx: Json | null
          rlusd_swapped: number | null
          status: string
          tx_hash: string
          usd_value_at_receipt: number
          user_id: string
        }
        Insert: {
          amount_received: number
          asset_received: string
          credited_at?: string | null
          destination_tag?: number | null
          detected_at?: string
          failure_reason?: string | null
          id?: string
          jvc_credited?: number
          ledger_index?: number | null
          network: string
          pending_until?: string | null
          raw_tx?: Json | null
          rlusd_swapped?: number | null
          status?: string
          tx_hash: string
          usd_value_at_receipt: number
          user_id: string
        }
        Update: {
          amount_received?: number
          asset_received?: string
          credited_at?: string | null
          destination_tag?: number | null
          detected_at?: string
          failure_reason?: string | null
          id?: string
          jvc_credited?: number
          ledger_index?: number | null
          network?: string
          pending_until?: string | null
          raw_tx?: Json | null
          rlusd_swapped?: number | null
          status?: string
          tx_hash?: string
          usd_value_at_receipt?: number
          user_id?: string
        }
        Relationships: []
      }
      crypto_reserve_state: {
        Row: {
          id: number
          last_reconciled_at: string | null
          reserve_health_ratio: number | null
          total_jvc_minted_from_crypto: number
          total_rlusd_reserve: number
          total_xrp_held: number
          updated_at: string
        }
        Insert: {
          id?: number
          last_reconciled_at?: string | null
          reserve_health_ratio?: number | null
          total_jvc_minted_from_crypto?: number
          total_rlusd_reserve?: number
          total_xrp_held?: number
          updated_at?: string
        }
        Update: {
          id?: number
          last_reconciled_at?: string | null
          reserve_health_ratio?: number | null
          total_jvc_minted_from_crypto?: number
          total_rlusd_reserve?: number
          total_xrp_held?: number
          updated_at?: string
        }
        Relationships: []
      }
      crypto_sandbox_balances: {
        Row: {
          balance_usd: number
          created_at: string
          is_locked: boolean
          locked_at: string | null
          locked_reason: string | null
          total_granted_usd: number
          total_spent_usd: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_usd?: number
          created_at?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_reason?: string | null
          total_granted_usd?: number
          total_spent_usd?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_usd?: number
          created_at?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_reason?: string | null
          total_granted_usd?: number
          total_spent_usd?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crypto_sandbox_grants: {
        Row: {
          amount_usd: number
          created_at: string
          granted_by: string | null
          id: string
          kind: string
          note: string | null
          user_id: string
          venue_id: string | null
        }
        Insert: {
          amount_usd: number
          created_at?: string
          granted_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          user_id: string
          venue_id?: string | null
        }
        Update: {
          amount_usd?: number
          created_at?: string
          granted_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          user_id?: string
          venue_id?: string | null
        }
        Relationships: []
      }
      crypto_supported_assets: {
        Row: {
          asset_type: string
          created_at: string
          decimals: number
          display_name: string
          icon_url: string | null
          id: string
          is_active: boolean
          is_stablecoin: boolean
          issuer_address: string | null
          max_deposit_usd: number
          min_deposit_usd: number
          network: string
          sort_order: number
          swap_fee_bps: number
          symbol: string
          updated_at: string
        }
        Insert: {
          asset_type: string
          created_at?: string
          decimals?: number
          display_name: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_stablecoin?: boolean
          issuer_address?: string | null
          max_deposit_usd?: number
          min_deposit_usd?: number
          network: string
          sort_order?: number
          swap_fee_bps?: number
          symbol: string
          updated_at?: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          decimals?: number
          display_name?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_stablecoin?: boolean
          issuer_address?: string | null
          max_deposit_usd?: number
          min_deposit_usd?: number
          network?: string
          sort_order?: number
          swap_fee_bps?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      crypto_swap_quotes: {
        Row: {
          consumed: boolean
          created_at: string
          expires_at: string
          fee_amount_usd: number
          fee_bps: number
          from_amount: number
          from_symbol: string
          id: string
          rate: number
          slippage_bps: number
          to_amount: number
          to_symbol: string
          usd_value: number
          user_id: string
        }
        Insert: {
          consumed?: boolean
          created_at?: string
          expires_at: string
          fee_amount_usd: number
          fee_bps: number
          from_amount: number
          from_symbol: string
          id?: string
          rate: number
          slippage_bps?: number
          to_amount: number
          to_symbol: string
          usd_value: number
          user_id: string
        }
        Update: {
          consumed?: boolean
          created_at?: string
          expires_at?: string
          fee_amount_usd?: number
          fee_bps?: number
          from_amount?: number
          from_symbol?: string
          id?: string
          rate?: number
          slippage_bps?: number
          to_amount?: number
          to_symbol?: string
          usd_value?: number
          user_id?: string
        }
        Relationships: []
      }
      crypto_swaps: {
        Row: {
          completed_at: string | null
          created_at: string
          deposit_id: string | null
          executed_rate: number
          failure_reason: string | null
          fee_amount_usd: number
          from_amount: number
          from_symbol: string
          id: string
          quote_id: string | null
          source: string
          status: string
          to_amount: number
          to_symbol: string
          usd_value: number
          user_id: string
          xrpl_tx_hash: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deposit_id?: string | null
          executed_rate: number
          failure_reason?: string | null
          fee_amount_usd: number
          from_amount: number
          from_symbol: string
          id?: string
          quote_id?: string | null
          source?: string
          status?: string
          to_amount: number
          to_symbol: string
          usd_value: number
          user_id: string
          xrpl_tx_hash?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deposit_id?: string | null
          executed_rate?: number
          failure_reason?: string | null
          fee_amount_usd?: number
          from_amount?: number
          from_symbol?: string
          id?: string
          quote_id?: string | null
          source?: string
          status?: string
          to_amount?: number
          to_symbol?: string
          usd_value?: number
          user_id?: string
          xrpl_tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crypto_swaps_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "crypto_deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crypto_swaps_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "crypto_swap_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      crypto_user_swap_prefs: {
        Row: {
          auto_swap_to_rlusd: boolean
          created_at: string
          max_slippage_bps: number
          preferred_deposit_asset: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_swap_to_rlusd?: boolean
          created_at?: string
          max_slippage_bps?: number
          preferred_deposit_asset?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_swap_to_rlusd?: boolean
          created_at?: string
          max_slippage_bps?: number
          preferred_deposit_asset?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crypto_withdrawal_holds: {
        Row: {
          amount_locked: number
          created_at: string
          deposit_id: string | null
          hold_until: string
          id: string
          released: boolean
          user_id: string
        }
        Insert: {
          amount_locked: number
          created_at?: string
          deposit_id?: string | null
          hold_until: string
          id?: string
          released?: boolean
          user_id: string
        }
        Update: {
          amount_locked?: number
          created_at?: string
          deposit_id?: string | null
          hold_until?: string
          id?: string
          released?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crypto_withdrawal_holds_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "crypto_deposits"
            referencedColumns: ["id"]
          },
        ]
      }
      crypto_withdrawals: {
        Row: {
          amount_asset: number | null
          amount_jvc: number
          asset: string
          broadcast_at: string | null
          confirmed_at: string | null
          created_at: string
          destination_address: string
          destination_tag: number | null
          failure_reason: string | null
          fee_usd: number
          fx_rate: number | null
          id: string
          ledger_index: number | null
          network: string
          pin_verified: boolean
          requires_manual_review: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          amount_asset?: number | null
          amount_jvc: number
          asset?: string
          broadcast_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          destination_address: string
          destination_tag?: number | null
          failure_reason?: string | null
          fee_usd?: number
          fx_rate?: number | null
          id?: string
          ledger_index?: number | null
          network: string
          pin_verified?: boolean
          requires_manual_review?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          amount_asset?: number | null
          amount_jvc?: number
          asset?: string
          broadcast_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          destination_address?: string
          destination_tag?: number | null
          failure_reason?: string | null
          fee_usd?: number
          fx_rate?: number | null
          id?: string
          ledger_index?: number | null
          network?: string
          pin_verified?: boolean
          requires_manual_review?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      customer_notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_profiles: {
        Row: {
          age: number | null
          avatar_url: string | null
          background_desktop: string | null
          background_mobile: string | null
          bio: string | null
          city: string | null
          connection_count: number | null
          country_code: string | null
          created_at: string | null
          currency: string | null
          default_discovery_level: string | null
          display_name: string | null
          founders_pass_dismissed: boolean | null
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          relationship_status: string | null
          selected_background: string | null
          state: string | null
          stripe_account_id: string | null
          stripe_customer_id: string | null
          stripe_onboarding_complete: boolean | null
          stripe_payouts_enabled: boolean | null
          suburb: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          background_desktop?: string | null
          background_mobile?: string | null
          bio?: string | null
          city?: string | null
          connection_count?: number | null
          country_code?: string | null
          created_at?: string | null
          currency?: string | null
          default_discovery_level?: string | null
          display_name?: string | null
          founders_pass_dismissed?: boolean | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          relationship_status?: string | null
          selected_background?: string | null
          state?: string | null
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_onboarding_complete?: boolean | null
          stripe_payouts_enabled?: boolean | null
          suburb?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          background_desktop?: string | null
          background_mobile?: string | null
          bio?: string | null
          city?: string | null
          connection_count?: number | null
          country_code?: string | null
          created_at?: string | null
          currency?: string | null
          default_discovery_level?: string | null
          display_name?: string | null
          founders_pass_dismissed?: boolean | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          relationship_status?: string | null
          selected_background?: string | null
          state?: string | null
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_onboarding_complete?: boolean | null
          stripe_payouts_enabled?: boolean | null
          suburb?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      delivery_fee_config: {
        Row: {
          base_fee: number
          created_at: string | null
          id: string
          max_fee: number
          min_fee: number
          per_km_rate: number
          platform_fee: number
          updated_at: string | null
        }
        Insert: {
          base_fee?: number
          created_at?: string | null
          id?: string
          max_fee?: number
          min_fee?: number
          per_km_rate?: number
          platform_fee?: number
          updated_at?: string | null
        }
        Update: {
          base_fee?: number
          created_at?: string | null
          id?: string
          max_fee?: number
          min_fee?: number
          per_km_rate?: number
          platform_fee?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      deposit_records: {
        Row: {
          amount_jvc: number
          amount_local: number
          amount_usd: number
          completed_at: string | null
          country_code: string | null
          created_at: string
          crypto_from_address: string | null
          crypto_tx_hash: string | null
          deposit_method: string
          device_fingerprint: string | null
          exchange_rate: number
          failure_reason: string | null
          first_deposit_bonus: number | null
          gateway_session_id: string | null
          gateway_tx_hash: string | null
          id: string
          intended_amount: number | null
          ip_address: string | null
          is_first_deposit: boolean | null
          kyc_status_at_deposit: string | null
          local_currency: string
          metadata: Json | null
          net_amount: number | null
          payment_rail: string | null
          pending_until: string | null
          provider_fee: number | null
          status: string
          stripe_charge_amount: number | null
          stripe_charge_id: string | null
          stripe_fee: number | null
          stripe_payment_intent_id: string | null
          subsidy_credited: number | null
          user_id: string | null
          venue_id: string | null
          wallet_credit_amount: number | null
        }
        Insert: {
          amount_jvc: number
          amount_local: number
          amount_usd: number
          completed_at?: string | null
          country_code?: string | null
          created_at?: string
          crypto_from_address?: string | null
          crypto_tx_hash?: string | null
          deposit_method: string
          device_fingerprint?: string | null
          exchange_rate?: number
          failure_reason?: string | null
          first_deposit_bonus?: number | null
          gateway_session_id?: string | null
          gateway_tx_hash?: string | null
          id?: string
          intended_amount?: number | null
          ip_address?: string | null
          is_first_deposit?: boolean | null
          kyc_status_at_deposit?: string | null
          local_currency?: string
          metadata?: Json | null
          net_amount?: number | null
          payment_rail?: string | null
          pending_until?: string | null
          provider_fee?: number | null
          status?: string
          stripe_charge_amount?: number | null
          stripe_charge_id?: string | null
          stripe_fee?: number | null
          stripe_payment_intent_id?: string | null
          subsidy_credited?: number | null
          user_id?: string | null
          venue_id?: string | null
          wallet_credit_amount?: number | null
        }
        Update: {
          amount_jvc?: number
          amount_local?: number
          amount_usd?: number
          completed_at?: string | null
          country_code?: string | null
          created_at?: string
          crypto_from_address?: string | null
          crypto_tx_hash?: string | null
          deposit_method?: string
          device_fingerprint?: string | null
          exchange_rate?: number
          failure_reason?: string | null
          first_deposit_bonus?: number | null
          gateway_session_id?: string | null
          gateway_tx_hash?: string | null
          id?: string
          intended_amount?: number | null
          ip_address?: string | null
          is_first_deposit?: boolean | null
          kyc_status_at_deposit?: string | null
          local_currency?: string
          metadata?: Json | null
          net_amount?: number | null
          payment_rail?: string | null
          pending_until?: string | null
          provider_fee?: number | null
          status?: string
          stripe_charge_amount?: number | null
          stripe_charge_id?: string | null
          stripe_fee?: number | null
          stripe_payment_intent_id?: string | null
          subsidy_credited?: number | null
          user_id?: string | null
          venue_id?: string | null
          wallet_credit_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deposit_records_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_profiles: {
        Row: {
          average_rating: number | null
          created_at: string | null
          current_latitude: number | null
          current_longitude: number | null
          drivers_license_id: string | null
          drivers_license_status: string
          drivers_license_url: string | null
          id: string
          id_document_status: string
          id_document_type: string | null
          id_document_url: string | null
          is_18_plus: boolean
          is_available: boolean | null
          last_location_update: string | null
          license_verified: boolean | null
          total_deliveries: number | null
          total_rides: number | null
          updated_at: string | null
          user_id: string
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_modes: Database["public"]["Enums"]["driver_mode"][]
          vehicle_plate: string | null
          vehicle_type: string | null
        }
        Insert: {
          average_rating?: number | null
          created_at?: string | null
          current_latitude?: number | null
          current_longitude?: number | null
          drivers_license_id?: string | null
          drivers_license_status?: string
          drivers_license_url?: string | null
          id?: string
          id_document_status?: string
          id_document_type?: string | null
          id_document_url?: string | null
          is_18_plus?: boolean
          is_available?: boolean | null
          last_location_update?: string | null
          license_verified?: boolean | null
          total_deliveries?: number | null
          total_rides?: number | null
          updated_at?: string | null
          user_id: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_modes?: Database["public"]["Enums"]["driver_mode"][]
          vehicle_plate?: string | null
          vehicle_type?: string | null
        }
        Update: {
          average_rating?: number | null
          created_at?: string | null
          current_latitude?: number | null
          current_longitude?: number | null
          drivers_license_id?: string | null
          drivers_license_status?: string
          drivers_license_url?: string | null
          id?: string
          id_document_status?: string
          id_document_type?: string | null
          id_document_url?: string | null
          is_18_plus?: boolean
          is_available?: boolean | null
          last_location_update?: string | null
          license_verified?: boolean | null
          total_deliveries?: number | null
          total_rides?: number | null
          updated_at?: string | null
          user_id?: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_modes?: Database["public"]["Enums"]["driver_mode"][]
          vehicle_plate?: string | null
          vehicle_type?: string | null
        }
        Relationships: []
      }
      driver_shifts: {
        Row: {
          created_at: string | null
          deliveries_completed: number | null
          driver_id: string
          earnings: number | null
          ended_at: string | null
          id: string
          rides_completed: number | null
          shift_type: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          deliveries_completed?: number | null
          driver_id: string
          earnings?: number | null
          ended_at?: string | null
          id?: string
          rides_completed?: number | null
          shift_type: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          deliveries_completed?: number | null
          driver_id?: string
          earnings?: number | null
          ended_at?: string | null
          id?: string
          rides_completed?: number | null
          shift_type?: string
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      employee_face_auth_log: {
        Row: {
          attempted_at: string | null
          confidence_score: number | null
          employee_id: string
          failure_reason: string | null
          id: string
          success: boolean
          venue_id: string
        }
        Insert: {
          attempted_at?: string | null
          confidence_score?: number | null
          employee_id: string
          failure_reason?: string | null
          id?: string
          success: boolean
          venue_id: string
        }
        Update: {
          attempted_at?: string | null
          confidence_score?: number | null
          employee_id?: string
          failure_reason?: string | null
          id?: string
          success?: boolean
          venue_id?: string
        }
        Relationships: []
      }
      employee_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          employee_email: string
          employee_user_id: string | null
          expires_at: string | null
          id: string
          invitation_token: string | null
          invited_by: string
          permissions: Json | null
          pin_code: string | null
          role: string
          status: string | null
          venue_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          employee_email: string
          employee_user_id?: string | null
          expires_at?: string | null
          id?: string
          invitation_token?: string | null
          invited_by: string
          permissions?: Json | null
          pin_code?: string | null
          role?: string
          status?: string | null
          venue_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          employee_email?: string
          employee_user_id?: string | null
          expires_at?: string | null
          id?: string
          invitation_token?: string | null
          invited_by?: string
          permissions?: Json | null
          pin_code?: string | null
          role?: string
          status?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_invitations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_roster: {
        Row: {
          created_at: string | null
          day_of_week: string
          employee_id: string
          end_time: string
          id: string
          is_recurring: boolean | null
          specific_date: string | null
          start_time: string
          station: string | null
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: string
          employee_id: string
          end_time: string
          id?: string
          is_recurring?: boolean | null
          specific_date?: string | null
          start_time: string
          station?: string | null
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: string
          employee_id?: string
          end_time?: string
          id?: string
          is_recurring?: boolean | null
          specific_date?: string | null
          start_time?: string
          station?: string | null
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_roster_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_shifts: {
        Row: {
          clock_in_location: Json | null
          clock_in_time: string | null
          clock_out_location: Json | null
          clock_out_time: string | null
          created_at: string | null
          employee_id: string
          id: string
          notes: string | null
          orders_served: number | null
          status: string | null
          total_sales: number | null
          venue_id: string
        }
        Insert: {
          clock_in_location?: Json | null
          clock_in_time?: string | null
          clock_out_location?: Json | null
          clock_out_time?: string | null
          created_at?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          orders_served?: number | null
          status?: string | null
          total_sales?: number | null
          venue_id: string
        }
        Update: {
          clock_in_location?: Json | null
          clock_in_time?: string | null
          clock_out_location?: Json | null
          clock_out_time?: string | null
          created_at?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          orders_served?: number | null
          status?: string | null
          total_sales?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_shifts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_venue_links: {
        Row: {
          created_at: string | null
          face_enrolled_at: string | null
          face_enrollment_status: string | null
          face_reference_key: string | null
          hired_date: string | null
          id: string
          is_active: boolean | null
          permissions: Json | null
          pin_hash: string | null
          role: string
          terminated_date: string | null
          updated_at: string | null
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          face_enrolled_at?: string | null
          face_enrollment_status?: string | null
          face_reference_key?: string | null
          hired_date?: string | null
          id?: string
          is_active?: boolean | null
          permissions?: Json | null
          pin_hash?: string | null
          role?: string
          terminated_date?: string | null
          updated_at?: string | null
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          face_enrolled_at?: string | null
          face_enrollment_status?: string | null
          face_reference_key?: string | null
          hired_date?: string | null
          id?: string
          is_active?: boolean | null
          permissions?: Json | null
          pin_hash?: string | null
          role?: string
          terminated_date?: string | null
          updated_at?: string | null
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_venue_links_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_verification_tokens: {
        Row: {
          created_at: string | null
          employee_id: string
          expires_at: string
          id: string
          token: string
          used: boolean | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          expires_at: string
          id?: string
          token: string
          used?: boolean | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          expires_at?: string
          id?: string
          token?: string
          used?: boolean | null
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          base_currency: string
          expires_at: string
          fetched_at: string
          id: string
          rate: number
          source: string
          target_currency: string
        }
        Insert: {
          base_currency?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          rate: number
          source?: string
          target_currency: string
        }
        Update: {
          base_currency?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          rate?: number
          source?: string
          target_currency?: string
        }
        Relationships: []
      }
      floorplans: {
        Row: {
          canvas_height: number | null
          canvas_width: number | null
          created_at: string | null
          created_by: string | null
          id: string
          items: Json | null
          name: string
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          canvas_height?: number | null
          canvas_width?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          items?: Json | null
          name: string
          updated_at?: string | null
          venue_id?: string
        }
        Update: {
          canvas_height?: number | null
          canvas_width?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          items?: Json | null
          name?: string
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: []
      }
      food_delivery_orders: {
        Row: {
          actual_delivery_time: string | null
          actual_pickup_time: string | null
          calculated_delivery_fee: number | null
          created_at: string | null
          customer_id: string | null
          customer_rating: number | null
          delivery_address: string
          delivery_fee: number | null
          delivery_latitude: number | null
          delivery_longitude: number | null
          driver_earnings: number | null
          driver_id: string | null
          driver_rating: number | null
          estimated_delivery_time: string | null
          estimated_pickup_time: string | null
          id: string
          order_id: string | null
          pickup_address: string | null
          pickup_latitude: number | null
          pickup_longitude: number | null
          platform_fee: number | null
          special_instructions: string | null
          status: string | null
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          actual_delivery_time?: string | null
          actual_pickup_time?: string | null
          calculated_delivery_fee?: number | null
          created_at?: string | null
          customer_id?: string | null
          customer_rating?: number | null
          delivery_address: string
          delivery_fee?: number | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          driver_earnings?: number | null
          driver_id?: string | null
          driver_rating?: number | null
          estimated_delivery_time?: string | null
          estimated_pickup_time?: string | null
          id?: string
          order_id?: string | null
          pickup_address?: string | null
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          platform_fee?: number | null
          special_instructions?: string | null
          status?: string | null
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          actual_delivery_time?: string | null
          actual_pickup_time?: string | null
          calculated_delivery_fee?: number | null
          created_at?: string | null
          customer_id?: string | null
          customer_rating?: number | null
          delivery_address?: string
          delivery_fee?: number | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          driver_earnings?: number | null
          driver_id?: string | null
          driver_rating?: number | null
          estimated_delivery_time?: string | null
          estimated_pickup_time?: string | null
          id?: string
          order_id?: string | null
          pickup_address?: string | null
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          platform_fee?: number | null
          special_instructions?: string | null
          status?: string | null
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_delivery_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string | null
          details: Json | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string | null
          details?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string | null
          details?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
        }
        Relationships: []
      }
      founder_claim_rate_limits: {
        Row: {
          attempts: number | null
          first_attempt_at: string | null
          id: string
          identifier: string
          identifier_type: string
          last_attempt_at: string | null
          locked_until: string | null
        }
        Insert: {
          attempts?: number | null
          first_attempt_at?: string | null
          id?: string
          identifier: string
          identifier_type?: string
          last_attempt_at?: string | null
          locked_until?: string | null
        }
        Update: {
          attempts?: number | null
          first_attempt_at?: string | null
          id?: string
          identifier?: string
          identifier_type?: string
          last_attempt_at?: string | null
          locked_until?: string | null
        }
        Relationships: []
      }
      founder_entitlements: {
        Row: {
          city_product_id: string
          created_at: string | null
          end_at: string | null
          id: string
          metadata: Json | null
          pass_type: string
          start_at: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          city_product_id: string
          created_at?: string | null
          end_at?: string | null
          id?: string
          metadata?: Json | null
          pass_type?: string
          start_at?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          city_product_id?: string
          created_at?: string | null
          end_at?: string | null
          id?: string
          metadata?: Json | null
          pass_type?: string
          start_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "founder_entitlements_city_product_id_fkey"
            columns: ["city_product_id"]
            isOneToOne: false
            referencedRelation: "city_products"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_webhook_events: {
        Row: {
          event_type: string
          id: string
          payload: Json | null
          processed_at: string | null
        }
        Insert: {
          event_type: string
          id: string
          payload?: Json | null
          processed_at?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
        }
        Relationships: []
      }
      founders_purchases: {
        Row: {
          city_product_id: string
          claim_attempts: number | null
          claim_code_hash: string
          claim_code_prefix: string
          claimed_at: string | null
          claimed_by_user_id: string | null
          created_at: string | null
          id: string
          pass_type: string
          purchased_at: string | null
          purchaser_email: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          city_product_id: string
          claim_attempts?: number | null
          claim_code_hash: string
          claim_code_prefix: string
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string | null
          id?: string
          pass_type?: string
          purchased_at?: string | null
          purchaser_email: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          city_product_id?: string
          claim_attempts?: number | null
          claim_code_hash?: string
          claim_code_prefix?: string
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string | null
          id?: string
          pass_type?: string
          purchased_at?: string | null
          purchaser_email?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "founders_purchases_city_product_id_fkey"
            columns: ["city_product_id"]
            isOneToOne: false
            referencedRelation: "city_products"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_payments: {
        Row: {
          amount: number
          attributed_at: string | null
          attributed_user_id: string | null
          claim_token: string
          created_at: string
          expires_at: string
          guest_email: string | null
          guest_phone: string | null
          id: string
          order_id: string | null
          paid_at: string | null
          platform_fee: number
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          total_charged: number | null
          venue_id: string
        }
        Insert: {
          amount: number
          attributed_at?: string | null
          attributed_user_id?: string | null
          claim_token: string
          created_at?: string
          expires_at?: string
          guest_email?: string | null
          guest_phone?: string | null
          id?: string
          order_id?: string | null
          paid_at?: string | null
          platform_fee?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_charged?: number | null
          venue_id: string
        }
        Update: {
          amount?: number
          attributed_at?: string | null
          attributed_user_id?: string | null
          claim_token?: string
          created_at?: string
          expires_at?: string
          guest_email?: string | null
          guest_phone?: string | null
          id?: string
          order_id?: string | null
          paid_at?: string | null
          platform_fee?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_charged?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_payments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          entry_type: string
          id: string
          transaction_id: string
          wallet_id: string | null
          wallet_type: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          entry_type: string
          id?: string
          transaction_id: string
          wallet_id?: string | null
          wallet_type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          entry_type?: string
          id?: string
          transaction_id?: string
          wallet_id?: string | null
          wallet_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          language_confidence: number | null
          source_language: string | null
          stream_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          language_confidence?: number | null
          source_language?: string | null
          stream_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          language_confidence?: number | null
          source_language?: string | null
          stream_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_chat_messages_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_viewers: {
        Row: {
          id: string
          last_seen_at: string
          stream_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_seen_at?: string
          stream_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_seen_at?: string
          stream_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_viewers_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_streams: {
        Row: {
          city: string | null
          country: string | null
          ended_at: string | null
          host_user_id: string
          id: string
          preview_image_url: string | null
          room_name: string
          started_at: string
          status: string
          title: string
          venue_id: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          ended_at?: string | null
          host_user_id: string
          id?: string
          preview_image_url?: string | null
          room_name: string
          started_at?: string
          status?: string
          title?: string
          venue_id?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          ended_at?: string | null
          host_user_id?: string
          id?: string
          preview_image_url?: string | null
          room_name?: string
          started_at?: string
          status?: string
          title?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_streams_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      mint_burn_audit: {
        Row: {
          admin_id: string | null
          admin_reason: string | null
          amount_jvc: number
          amount_usd: number
          balance_after: number
          balance_before: number
          created_at: string
          deposit_id: string | null
          id: string
          operation_type: string
          total_supply_after: number
          total_supply_before: number
          triggered_by: string
          wallet_id: string
          wallet_type: string
          withdrawal_id: string | null
        }
        Insert: {
          admin_id?: string | null
          admin_reason?: string | null
          amount_jvc: number
          amount_usd: number
          balance_after: number
          balance_before: number
          created_at?: string
          deposit_id?: string | null
          id?: string
          operation_type: string
          total_supply_after: number
          total_supply_before: number
          triggered_by: string
          wallet_id: string
          wallet_type: string
          withdrawal_id?: string | null
        }
        Update: {
          admin_id?: string | null
          admin_reason?: string | null
          amount_jvc?: number
          amount_usd?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          deposit_id?: string | null
          id?: string
          operation_type?: string
          total_supply_after?: number
          total_supply_before?: number
          triggered_by?: string
          wallet_id?: string
          wallet_type?: string
          withdrawal_id?: string | null
        }
        Relationships: []
      }
      operational_idempotency_keys: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          operation_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          operation_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          operation_type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          image_url: string | null
          menu_item_id: string
          modifiers: Json | null
          name: string
          notes: string | null
          order_id: string
          price: number
          quantity: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          menu_item_id: string
          modifiers?: Json | null
          name: string
          notes?: string | null
          order_id: string
          price: number
          quantity?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          menu_item_id?: string
          modifiers?: Json | null
          name?: string
          notes?: string | null
          order_id?: string
          price?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          language_confidence: number | null
          order_id: string
          order_type: string
          read_at: string | null
          sender_id: string
          sender_type: string
          source_language: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          language_confidence?: number | null
          order_id: string
          order_type: string
          read_at?: string | null
          sender_id: string
          sender_type: string
          source_language?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          language_confidence?: number | null
          order_id?: string
          order_type?: string
          read_at?: string | null
          sender_id?: string
          sender_type?: string
          source_language?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string | null
          customer_name: string | null
          id: string
          is_preorder: boolean | null
          is_test_order: boolean
          notes: string | null
          order_number: number
          priority: string | null
          reservation_id: string | null
          scheduled_for: string | null
          staff_id: string | null
          station: string | null
          status: string | null
          subtotal: number | null
          table_id: string | null
          table_number: string | null
          tax: number | null
          total: number | null
          updated_at: string | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_name?: string | null
          id?: string
          is_preorder?: boolean | null
          is_test_order?: boolean
          notes?: string | null
          order_number?: never
          priority?: string | null
          reservation_id?: string | null
          scheduled_for?: string | null
          staff_id?: string | null
          station?: string | null
          status?: string | null
          subtotal?: number | null
          table_id?: string | null
          table_number?: string | null
          tax?: number | null
          total?: number | null
          updated_at?: string | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_name?: string | null
          id?: string
          is_preorder?: boolean | null
          is_test_order?: boolean
          notes?: string | null
          order_number?: never
          priority?: string | null
          reservation_id?: string | null
          scheduled_for?: string | null
          staff_id?: string | null
          station?: string | null
          status?: string | null
          subtotal?: number | null
          table_id?: string | null
          table_number?: string | null
          tax?: number | null
          total?: number | null
          updated_at?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "table_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "venue_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          expires_at: string
          fee: number | null
          id: string
          order_id: string | null
          paid_by: string | null
          payment_method: string | null
          proximity_token: string | null
          proximity_token_expires_at: string | null
          qr_token: string
          status: string | null
          venue_id: string
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at: string
          fee?: number | null
          id?: string
          order_id?: string | null
          paid_by?: string | null
          payment_method?: string | null
          proximity_token?: string | null
          proximity_token_expires_at?: string | null
          qr_token: string
          status?: string | null
          venue_id: string
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          fee?: number | null
          id?: string
          order_id?: string | null
          paid_by?: string | null
          payment_method?: string | null
          proximity_token?: string | null
          proximity_token_expires_at?: string | null
          qr_token?: string
          status?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_security_settings: {
        Row: {
          created_at: string | null
          enrolled_at: string | null
          enrolled_selfie_url: string | null
          face_enabled: boolean | null
          face_threshold: string | null
          id: string
          last_verification_at: string | null
          last_verification_method: string | null
          payment_pin_hash: string | null
          pin_failed_attempts: number | null
          pin_locked_until: string | null
          pin_set_at: string | null
          total_face_verifications: number | null
          total_pin_verifications: number | null
          trusted_devices: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enrolled_at?: string | null
          enrolled_selfie_url?: string | null
          face_enabled?: boolean | null
          face_threshold?: string | null
          id?: string
          last_verification_at?: string | null
          last_verification_method?: string | null
          payment_pin_hash?: string | null
          pin_failed_attempts?: number | null
          pin_locked_until?: string | null
          pin_set_at?: string | null
          total_face_verifications?: number | null
          total_pin_verifications?: number | null
          trusted_devices?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          enrolled_at?: string | null
          enrolled_selfie_url?: string | null
          face_enabled?: boolean | null
          face_threshold?: string | null
          id?: string
          last_verification_at?: string | null
          last_verification_method?: string | null
          payment_pin_hash?: string | null
          pin_failed_attempts?: number | null
          pin_locked_until?: string | null
          pin_set_at?: string | null
          total_face_verifications?: number | null
          total_pin_verifications?: number | null
          trusted_devices?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_verification_log: {
        Row: {
          created_at: string | null
          device_id: string | null
          face_match_score: number | null
          failure_reason: string | null
          id: string
          ip_address: string | null
          liveness_score: number | null
          success: boolean
          transaction_amount: number | null
          user_id: string
          verification_method: string
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          face_match_score?: number | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          liveness_score?: number | null
          success: boolean
          transaction_amount?: number | null
          user_id: string
          verification_method: string
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          face_match_score?: number | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          liveness_score?: number | null
          success?: boolean
          transaction_amount?: number | null
          user_id?: string
          verification_method?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          order_id: string
          payment_method: string
          staff_id: string | null
          status: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          order_id: string
          payment_method: string
          staff_id?: string | null
          status?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          order_id?: string
          payment_method?: string
          staff_id?: string | null
          status?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      platform_treasury: {
        Row: {
          collected_fees: number
          created_at: string
          id: string
          last_reconciled_at: string | null
          last_reconciliation_at: string | null
          owner_withdrawn: number | null
          pending_deposits: number
          pending_withdrawals: number
          reconciliation_status: string | null
          stripe_balance: number
          total_deposits_received: number | null
          total_jvc_supply: number
          total_usd_backing: number
          total_user_payouts: number | null
          total_venue_payouts: number | null
          updated_at: string
        }
        Insert: {
          collected_fees?: number
          created_at?: string
          id?: string
          last_reconciled_at?: string | null
          last_reconciliation_at?: string | null
          owner_withdrawn?: number | null
          pending_deposits?: number
          pending_withdrawals?: number
          reconciliation_status?: string | null
          stripe_balance?: number
          total_deposits_received?: number | null
          total_jvc_supply?: number
          total_usd_backing?: number
          total_user_payouts?: number | null
          total_venue_payouts?: number | null
          updated_at?: string
        }
        Update: {
          collected_fees?: number
          created_at?: string
          id?: string
          last_reconciled_at?: string | null
          last_reconciliation_at?: string | null
          owner_withdrawn?: number | null
          pending_deposits?: number
          pending_withdrawals?: number
          reconciliation_status?: string | null
          stripe_balance?: number
          total_deposits_received?: number | null
          total_jvc_supply?: number
          total_usd_backing?: number
          total_user_payouts?: number | null
          total_venue_payouts?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          language_confidence: number | null
          post_id: string
          source_language: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          language_confidence?: number | null
          post_id: string
          source_language?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          language_confidence?: number | null
          post_id?: string
          source_language?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_pounds: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_pounds_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reports: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reason: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reason?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_tagged_users: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tagged_users_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_watch_events: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
          watch_time_ms: number
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
          watch_time_ms?: number
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
          watch_time_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_watch_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          comments_count: number | null
          content: string
          created_at: string | null
          id: string
          image_url: string | null
          is_live: boolean | null
          language_confidence: number | null
          post_type: string | null
          pounds_count: number | null
          save_count: number | null
          share_count: number | null
          shared_post_id: string | null
          source_language: string | null
          user_id: string
          venue_id: string | null
          video_url: string | null
          view_count: number | null
          visibility: string | null
        }
        Insert: {
          comments_count?: number | null
          content: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_live?: boolean | null
          language_confidence?: number | null
          post_type?: string | null
          pounds_count?: number | null
          save_count?: number | null
          share_count?: number | null
          shared_post_id?: string | null
          source_language?: string | null
          user_id: string
          venue_id?: string | null
          video_url?: string | null
          view_count?: number | null
          visibility?: string | null
        }
        Update: {
          comments_count?: number | null
          content?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_live?: boolean | null
          language_confidence?: number | null
          post_type?: string | null
          pounds_count?: number | null
          save_count?: number | null
          share_count?: number | null
          shared_post_id?: string | null
          source_language?: string | null
          user_id?: string
          venue_id?: string | null
          video_url?: string | null
          view_count?: number | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_shared_post_id_fkey"
            columns: ["shared_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          language: string | null
          onboarding_step: string
          phone_number: string | null
          phone_verified: boolean | null
          phone_verified_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          language?: string | null
          onboarding_step?: string
          phone_number?: string | null
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          language?: string | null
          onboarding_step?: string
          phone_number?: string | null
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_credit_fulfillments: {
        Row: {
          amount_cents: number
          created_at: string
          credits_granted: number
          fulfilled_at: string
          fulfilled_by: string | null
          id: string
          reach_tier: string
          stripe_session_id: string
          venue_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          credits_granted: number
          fulfilled_at?: string
          fulfilled_by?: string | null
          id?: string
          reach_tier: string
          stripe_session_id: string
          venue_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          credits_granted?: number
          fulfilled_at?: string
          fulfilled_by?: string | null
          id?: string
          reach_tier?: string
          stripe_session_id?: string
          venue_id?: string
        }
        Relationships: []
      }
      push_notification_tokens: {
        Row: {
          created_at: string
          device_type: string | null
          id: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          id?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_type?: string | null
          id?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          owner_id: string
          owner_type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          owner_id: string
          owner_type: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          owner_id?: string
          owner_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          amount_cents: number
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string
          currency: string
          id: string
          issued_at: string | null
          issued_to_id: string
          issued_to_type: string
          period_month: string | null
          referral_id: string
          reward_type: string
          status: string
          venue_id: string | null
        }
        Insert: {
          amount_cents: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          currency?: string
          id?: string
          issued_at?: string | null
          issued_to_id: string
          issued_to_type: string
          period_month?: string | null
          referral_id: string
          reward_type: string
          status?: string
          venue_id?: string | null
        }
        Update: {
          amount_cents?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          currency?: string
          id?: string
          issued_at?: string | null
          issued_to_id?: string
          issued_to_type?: string
          period_month?: string | null
          referral_id?: string
          reward_type?: string
          status?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          metadata: Json | null
          qualified_at: string | null
          referral_code_id: string
          referred_venue_id: string | null
          referrer_id: string
          referrer_type: string
          rewarded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          metadata?: Json | null
          qualified_at?: string | null
          referral_code_id: string
          referred_venue_id?: string | null
          referrer_id: string
          referrer_type: string
          rewarded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          metadata?: Json | null
          qualified_at?: string | null
          referral_code_id?: string
          referred_venue_id?: string | null
          referrer_id?: string
          referrer_type?: string
          rewarded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_venue_id_fkey"
            columns: ["referred_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_reminders: {
        Row: {
          created_at: string
          id: string
          reminder_type: string
          reservation_id: string
          sent_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          reminder_type: string
          reservation_id: string
          sent_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          reminder_type?: string
          reservation_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_reminders_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "table_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_bookings: {
        Row: {
          actual_duration_minutes: number | null
          actual_fare: number | null
          created_at: string | null
          customer_id: string
          customer_rating: number | null
          destination_address: string
          destination_latitude: number | null
          destination_longitude: number | null
          distance_km: number | null
          driver_earnings: number | null
          driver_id: string | null
          driver_rating: number | null
          estimated_duration_minutes: number | null
          estimated_fare: number | null
          id: string
          payment_status: string | null
          pickup_address: string
          pickup_latitude: number | null
          pickup_longitude: number | null
          platform_fee: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          actual_duration_minutes?: number | null
          actual_fare?: number | null
          created_at?: string | null
          customer_id: string
          customer_rating?: number | null
          destination_address: string
          destination_latitude?: number | null
          destination_longitude?: number | null
          distance_km?: number | null
          driver_earnings?: number | null
          driver_id?: string | null
          driver_rating?: number | null
          estimated_duration_minutes?: number | null
          estimated_fare?: number | null
          id?: string
          payment_status?: string | null
          pickup_address: string
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          platform_fee?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_duration_minutes?: number | null
          actual_fare?: number | null
          created_at?: string | null
          customer_id?: string
          customer_rating?: number | null
          destination_address?: string
          destination_latitude?: number | null
          destination_longitude?: number | null
          distance_km?: number | null
          driver_earnings?: number | null
          driver_id?: string | null
          driver_rating?: number | null
          estimated_duration_minutes?: number | null
          estimated_fare?: number | null
          id?: string
          payment_status?: string | null
          pickup_address?: string
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          platform_fee?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ride_fare_config: {
        Row: {
          base_fare: number
          created_at: string | null
          id: string
          max_fare: number
          min_fare: number
          per_km_rate: number
          per_minute_rate: number
          platform_fee: number
          updated_at: string | null
        }
        Insert: {
          base_fare?: number
          created_at?: string | null
          id?: string
          max_fare?: number
          min_fare?: number
          per_km_rate?: number
          per_minute_rate?: number
          platform_fee?: number
          updated_at?: string | null
        }
        Update: {
          base_fare?: number
          created_at?: string | null
          id?: string
          max_fare?: number
          min_fare?: number
          per_km_rate?: number
          per_minute_rate?: number
          platform_fee?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      runner_fraud_flags: {
        Row: {
          created_at: string
          details: Json | null
          flag_type: Database["public"]["Enums"]["runner_fraud_flag_type"]
          id: string
          job_id: string | null
          runner_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          flag_type: Database["public"]["Enums"]["runner_fraud_flag_type"]
          id?: string
          job_id?: string | null
          runner_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          flag_type?: Database["public"]["Enums"]["runner_fraud_flag_type"]
          id?: string
          job_id?: string | null
          runner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runner_fraud_flags_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "runner_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      runner_jobs: {
        Row: {
          accepted_at: string | null
          approval_requested_at: string | null
          approved_at: string | null
          approved_total_usd: number | null
          buffer_pct: number
          cancel_reason: string | null
          cancelled_at: string | null
          cart_preview_json: Json | null
          completed_at: string | null
          created_at: string
          customer_id: string
          delivered_at: string | null
          dispute_window_ends_at: string | null
          distance_surcharge_usd: number
          dropoff_address: string
          dropoff_latitude: number | null
          dropoff_longitude: number | null
          dropoff_proof_urls: string[]
          est_item_cost_usd: number
          final_item_cost_usd: number | null
          held_amount_usd: number
          id: string
          pickup_address: string | null
          pickup_latitude: number | null
          pickup_longitude: number | null
          pickup_venue_id: string | null
          platform_fee_usd: number
          price_tier: Database["public"]["Enums"]["runner_price_tier"]
          purchase_proof_urls: string[]
          purchased_at: string | null
          runner_fee_usd: number
          runner_id: string | null
          status: Database["public"]["Enums"]["runner_job_status"]
          task_description: string
          tip_usd: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_total_usd?: number | null
          buffer_pct?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cart_preview_json?: Json | null
          completed_at?: string | null
          created_at?: string
          customer_id: string
          delivered_at?: string | null
          dispute_window_ends_at?: string | null
          distance_surcharge_usd?: number
          dropoff_address: string
          dropoff_latitude?: number | null
          dropoff_longitude?: number | null
          dropoff_proof_urls?: string[]
          est_item_cost_usd?: number
          final_item_cost_usd?: number | null
          held_amount_usd: number
          id?: string
          pickup_address?: string | null
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          pickup_venue_id?: string | null
          platform_fee_usd?: number
          price_tier: Database["public"]["Enums"]["runner_price_tier"]
          purchase_proof_urls?: string[]
          purchased_at?: string | null
          runner_fee_usd: number
          runner_id?: string | null
          status?: Database["public"]["Enums"]["runner_job_status"]
          task_description: string
          tip_usd?: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_total_usd?: number | null
          buffer_pct?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cart_preview_json?: Json | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          delivered_at?: string | null
          dispute_window_ends_at?: string | null
          distance_surcharge_usd?: number
          dropoff_address?: string
          dropoff_latitude?: number | null
          dropoff_longitude?: number | null
          dropoff_proof_urls?: string[]
          est_item_cost_usd?: number
          final_item_cost_usd?: number | null
          held_amount_usd?: number
          id?: string
          pickup_address?: string | null
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          pickup_venue_id?: string | null
          platform_fee_usd?: number
          price_tier?: Database["public"]["Enums"]["runner_price_tier"]
          purchase_proof_urls?: string[]
          purchased_at?: string | null
          runner_fee_usd?: number
          runner_id?: string | null
          status?: Database["public"]["Enums"]["runner_job_status"]
          task_description?: string
          tip_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "runner_jobs_pickup_venue_id_fkey"
            columns: ["pickup_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      runner_wallet_holds: {
        Row: {
          amount_usd: number
          created_at: string
          id: string
          job_id: string
          status: Database["public"]["Enums"]["runner_hold_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_usd: number
          created_at?: string
          id?: string
          job_id: string
          status?: Database["public"]["Enums"]["runner_hold_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_usd?: number
          created_at?: string
          id?: string
          job_id?: string
          status?: Database["public"]["Enums"]["runner_hold_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runner_wallet_holds_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "runner_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_posts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_reminders: {
        Row: {
          created_at: string
          day_of_week: string
          employee_id: string
          enabled: boolean
          id: string
          reminder_minutes_before: number
          roster_id: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: string
          employee_id: string
          enabled?: boolean
          id?: string
          reminder_minutes_before?: number
          roster_id: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: string
          employee_id?: string
          enabled?: boolean
          id?: string
          reminder_minutes_before?: number
          roster_id?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_reminders_roster_id_fkey"
            columns: ["roster_id"]
            isOneToOne: false
            referencedRelation: "employee_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reminders_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_payouts: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string | null
          currency: string | null
          failure_reason: string | null
          id: string
          recipient_id: string
          recipient_type: string
          status: string | null
          stripe_account_id: string | null
          stripe_payout_id: string | null
          stripe_transfer_id: string | null
          updated_at: string | null
          venue_id: string | null
          withdrawal_record_id: string | null
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string | null
          currency?: string | null
          failure_reason?: string | null
          id?: string
          recipient_id: string
          recipient_type: string
          status?: string | null
          stripe_account_id?: string | null
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string | null
          venue_id?: string | null
          withdrawal_record_id?: string | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string | null
          currency?: string | null
          failure_reason?: string | null
          id?: string
          recipient_id?: string
          recipient_type?: string
          status?: string | null
          stripe_account_id?: string | null
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string | null
          venue_id?: string | null
          withdrawal_record_id?: string | null
        }
        Relationships: []
      }
      table_reservations: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          deposit_amount: number | null
          deposit_deadline: string | null
          deposit_forfeited: boolean
          deposit_paid: boolean
          deposit_paid_at: string | null
          deposit_required: boolean
          end_time: string
          has_pre_order: boolean
          id: string
          notified_1hr_before: boolean | null
          notified_30min_before: boolean | null
          notified_hours_before: boolean | null
          order_id: string | null
          party_size: number
          reservation_date: string
          special_requests: string | null
          start_time: string
          status: string
          table_id: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          deposit_amount?: number | null
          deposit_deadline?: string | null
          deposit_forfeited?: boolean
          deposit_paid?: boolean
          deposit_paid_at?: string | null
          deposit_required?: boolean
          end_time: string
          has_pre_order?: boolean
          id?: string
          notified_1hr_before?: boolean | null
          notified_30min_before?: boolean | null
          notified_hours_before?: boolean | null
          order_id?: string | null
          party_size?: number
          reservation_date: string
          special_requests?: string | null
          start_time: string
          status?: string
          table_id?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deposit_amount?: number | null
          deposit_deadline?: string | null
          deposit_forfeited?: boolean
          deposit_paid?: boolean
          deposit_paid_at?: string | null
          deposit_required?: boolean
          end_time?: string
          has_pre_order?: boolean
          id?: string
          notified_1hr_before?: boolean | null
          notified_30min_before?: boolean | null
          notified_hours_before?: boolean | null
          order_id?: string | null
          party_size?: number
          reservation_date?: string
          special_requests?: string | null
          start_time?: string
          status?: string
          table_id?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_reservations_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "venue_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_reservations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      test_wallet_balances: {
        Row: {
          balance_cents: number
          created_at: string
          id: string
          initial_balance_cents: number
          invite_id: string
          is_active: boolean
          updated_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          balance_cents?: number
          created_at?: string
          id?: string
          initial_balance_cents?: number
          invite_id: string
          is_active?: boolean
          updated_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          balance_cents?: number
          created_at?: string
          id?: string
          initial_balance_cents?: number
          invite_id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_wallet_balances_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "venue_test_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_wallet_balances_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_encouragement_log: {
        Row: {
          created_at: string
          encouragement_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encouragement_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encouragement_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      tier_point_events: {
        Row: {
          action_type: string
          created_at: string
          expires_at: string
          id: string
          metadata: Json
          points: number
          score_category: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          expires_at: string
          id?: string
          metadata?: Json
          points: number
          score_category: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          expires_at?: string
          id?: string
          metadata?: Json
          points?: number
          score_category?: string
          user_id?: string
        }
        Relationships: []
      }
      transaction_limits: {
        Row: {
          created_at: string | null
          daily_spend_limit: number | null
          daily_spent_reset_at: string | null
          daily_spent_today: number | null
          daily_withdrawal_limit: number | null
          id: string
          per_transaction_limit: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_spend_limit?: number | null
          daily_spent_reset_at?: string | null
          daily_spent_today?: number | null
          daily_withdrawal_limit?: number | null
          id?: string
          per_transaction_limit?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_spend_limit?: number | null
          daily_spent_reset_at?: string | null
          daily_spent_today?: number | null
          daily_withdrawal_limit?: number | null
          id?: string
          per_transaction_limit?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_jvc: number
          amount_local: number | null
          amount_usd: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          exchange_rate: number | null
          fee_amount: number
          fee_collected: boolean
          from_wallet_id: string | null
          from_wallet_type: string | null
          id: string
          is_test: boolean
          local_currency: string | null
          metadata: Json | null
          reference_id: string | null
          reference_type: string | null
          status: string
          to_wallet_id: string | null
          to_wallet_type: string | null
          transaction_type: string
        }
        Insert: {
          amount_jvc: number
          amount_local?: number | null
          amount_usd: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          exchange_rate?: number | null
          fee_amount?: number
          fee_collected?: boolean
          from_wallet_id?: string | null
          from_wallet_type?: string | null
          id?: string
          is_test?: boolean
          local_currency?: string | null
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          to_wallet_id?: string | null
          to_wallet_type?: string | null
          transaction_type: string
        }
        Update: {
          amount_jvc?: number
          amount_local?: number | null
          amount_usd?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          exchange_rate?: number | null
          fee_amount?: number
          fee_collected?: boolean
          from_wallet_id?: string | null
          from_wallet_type?: string | null
          id?: string
          is_test?: boolean
          local_currency?: string | null
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          to_wallet_id?: string | null
          to_wallet_type?: string | null
          transaction_type?: string
        }
        Relationships: []
      }
      treasury_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          id: string
          message: string
          payload: Json
          severity: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          id?: string
          message: string
          payload?: Json
          severity: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          id?: string
          message?: string
          payload?: Json
          severity?: string
        }
        Relationships: []
      }
      treasury_reconciliation_runs: {
        Row: {
          created_by: string | null
          health_ratio: number
          id: string
          notes: string | null
          run_at: string
          status: string
          surplus_usd: number
          total_jvc_outstanding: number
          total_pending_deposits_usd: number
          total_pending_withdrawals_usd: number
          total_rlusd_reserves: number
        }
        Insert: {
          created_by?: string | null
          health_ratio: number
          id?: string
          notes?: string | null
          run_at?: string
          status: string
          surplus_usd: number
          total_jvc_outstanding: number
          total_pending_deposits_usd?: number
          total_pending_withdrawals_usd?: number
          total_rlusd_reserves: number
        }
        Update: {
          created_by?: string | null
          health_ratio?: number
          id?: string
          notes?: string | null
          run_at?: string
          status?: string
          surplus_usd?: number
          total_jvc_outstanding?: number
          total_pending_deposits_usd?: number
          total_pending_withdrawals_usd?: number
          total_rlusd_reserves?: number
        }
        Relationships: []
      }
      user_connections: {
        Row: {
          connected_user_id: string
          created_at: string | null
          id: string
          status: string | null
          user_id: string
        }
        Insert: {
          connected_user_id: string
          created_at?: string | null
          id?: string
          status?: string | null
          user_id: string
        }
        Update: {
          connected_user_id?: string
          created_at?: string | null
          id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_deal_impressions: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          impression_date: string
          placement_type: string
          snoozed_until: string | null
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          impression_date?: string
          placement_type: string
          snoozed_until?: string | null
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          impression_date?: string
          placement_type?: string
          snoozed_until?: string | null
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_deal_impressions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "venue_deals_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_deal_impressions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
          is_close_friend: boolean | null
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
          is_close_friend?: boolean | null
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
          is_close_friend?: boolean | null
        }
        Relationships: []
      }
      user_memory: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          memory_type: string
          metadata: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          memory_type: string
          metadata?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          memory_type?: string
          metadata?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tiers: {
        Row: {
          created_at: string
          current_tier: string
          follower_count_snapshot: number
          geographic_reach: string
          id: string
          joint_score: number
          last_calculated_at: string | null
          last_streak_week: string | null
          reach_score: number
          streak_weeks: number
          tier_at_risk: boolean
          tier_at_risk_since: string | null
          updated_at: string
          user_id: string
          venue_impact_label: string
          venue_impact_raw: number
          vibe_score: number
        }
        Insert: {
          created_at?: string
          current_tier?: string
          follower_count_snapshot?: number
          geographic_reach?: string
          id?: string
          joint_score?: number
          last_calculated_at?: string | null
          last_streak_week?: string | null
          reach_score?: number
          streak_weeks?: number
          tier_at_risk?: boolean
          tier_at_risk_since?: string | null
          updated_at?: string
          user_id: string
          venue_impact_label?: string
          venue_impact_raw?: number
          vibe_score?: number
        }
        Update: {
          created_at?: string
          current_tier?: string
          follower_count_snapshot?: number
          geographic_reach?: string
          id?: string
          joint_score?: number
          last_calculated_at?: string | null
          last_streak_week?: string | null
          reach_score?: number
          streak_weeks?: number
          tier_at_risk?: boolean
          tier_at_risk_since?: string | null
          updated_at?: string
          user_id?: string
          venue_impact_label?: string
          venue_impact_raw?: number
          vibe_score?: number
        }
        Relationships: []
      }
      user_verification: {
        Row: {
          aws_verification_id: string | null
          biometric_template_id: string | null
          created_at: string | null
          document_back_url: string | null
          document_expiry: string | null
          document_front_url: string | null
          document_number: string | null
          document_status:
            | Database["public"]["Enums"]["verification_status"]
            | null
          document_type: Database["public"]["Enums"]["id_document_type"] | null
          extracted_dob: string | null
          extracted_name: string | null
          face_match_confidence: number | null
          face_status: Database["public"]["Enums"]["verification_status"] | null
          id: string
          is_18_plus: boolean | null
          is_21_plus: boolean | null
          is_age_verified: boolean | null
          issuing_country: string | null
          liveness_score: number | null
          overall_status:
            | Database["public"]["Enums"]["verification_status"]
            | null
          rejected_at: string | null
          rejection_reason: string | null
          selfie_url: string | null
          updated_at: string | null
          user_id: string
          verified_age: number | null
          verified_at: string | null
        }
        Insert: {
          aws_verification_id?: string | null
          biometric_template_id?: string | null
          created_at?: string | null
          document_back_url?: string | null
          document_expiry?: string | null
          document_front_url?: string | null
          document_number?: string | null
          document_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          document_type?: Database["public"]["Enums"]["id_document_type"] | null
          extracted_dob?: string | null
          extracted_name?: string | null
          face_match_confidence?: number | null
          face_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          id?: string
          is_18_plus?: boolean | null
          is_21_plus?: boolean | null
          is_age_verified?: boolean | null
          issuing_country?: string | null
          liveness_score?: number | null
          overall_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          rejected_at?: string | null
          rejection_reason?: string | null
          selfie_url?: string | null
          updated_at?: string | null
          user_id: string
          verified_age?: number | null
          verified_at?: string | null
        }
        Update: {
          aws_verification_id?: string | null
          biometric_template_id?: string | null
          created_at?: string | null
          document_back_url?: string | null
          document_expiry?: string | null
          document_front_url?: string | null
          document_number?: string | null
          document_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          document_type?: Database["public"]["Enums"]["id_document_type"] | null
          extracted_dob?: string | null
          extracted_name?: string | null
          face_match_confidence?: number | null
          face_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          id?: string
          is_18_plus?: boolean | null
          is_21_plus?: boolean | null
          is_age_verified?: boolean | null
          issuing_country?: string | null
          liveness_score?: number | null
          overall_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          rejected_at?: string | null
          rejection_reason?: string | null
          selfie_url?: string | null
          updated_at?: string | null
          user_id?: string
          verified_age?: number | null
          verified_at?: string | null
        }
        Relationships: []
      }
      user_vibe_preferences: {
        Row: {
          behavioral_weight: number
          declared_weight: number
          id: string
          last_reinforced_at: string | null
          selected_at: string
          tag_name: string
          total_weight: number | null
          user_id: string
        }
        Insert: {
          behavioral_weight?: number
          declared_weight?: number
          id?: string
          last_reinforced_at?: string | null
          selected_at?: string
          tag_name: string
          total_weight?: number | null
          user_id: string
        }
        Update: {
          behavioral_weight?: number
          declared_weight?: number
          id?: string
          last_reinforced_at?: string | null
          selected_at?: string
          tag_name?: string
          total_weight?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_wallets: {
        Row: {
          balance_jv_token: number | null
          balance_usd: number | null
          country_code: string | null
          created_at: string | null
          crypto_lifetime_deposit_usd: number | null
          crypto_pending_balance: number | null
          first_deposit_at: string | null
          first_deposit_bonus_claimed: boolean | null
          freeze_reason: string | null
          frozen_at: string | null
          frozen_by: string | null
          id: string
          is_frozen: boolean
          last_crypto_deposit_at: string | null
          last_deposit_at: string | null
          last_spend_at: string | null
          locked_balance: number
          pending_balance: number
          pending_until: string | null
          reward_points: number | null
          subsidized_deposit_count: number | null
          subsidy_balance: number | null
          subsidy_lifetime_total: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance_jv_token?: number | null
          balance_usd?: number | null
          country_code?: string | null
          created_at?: string | null
          crypto_lifetime_deposit_usd?: number | null
          crypto_pending_balance?: number | null
          first_deposit_at?: string | null
          first_deposit_bonus_claimed?: boolean | null
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          id?: string
          is_frozen?: boolean
          last_crypto_deposit_at?: string | null
          last_deposit_at?: string | null
          last_spend_at?: string | null
          locked_balance?: number
          pending_balance?: number
          pending_until?: string | null
          reward_points?: number | null
          subsidized_deposit_count?: number | null
          subsidy_balance?: number | null
          subsidy_lifetime_total?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance_jv_token?: number | null
          balance_usd?: number | null
          country_code?: string | null
          created_at?: string | null
          crypto_lifetime_deposit_usd?: number | null
          crypto_pending_balance?: number | null
          first_deposit_at?: string | null
          first_deposit_bonus_claimed?: boolean | null
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          id?: string
          is_frozen?: boolean
          last_crypto_deposit_at?: string | null
          last_deposit_at?: string | null
          last_spend_at?: string | null
          locked_balance?: number
          pending_balance?: number
          pending_until?: string | null
          reward_points?: number | null
          subsidized_deposit_count?: number | null
          subsidy_balance?: number | null
          subsidy_lifetime_total?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      venue_3d_jobs: {
        Row: {
          created_at: string
          current_stage: number
          error_message: string | null
          final_model_url: string | null
          id: string
          preview_model_url: string | null
          priority: number
          progress: number
          queue_position: number | null
          refined_model_url: string | null
          status: string
          updated_at: string
          venue_id: string
          video_url: string | null
          worker_id: string | null
        }
        Insert: {
          created_at?: string
          current_stage?: number
          error_message?: string | null
          final_model_url?: string | null
          id?: string
          preview_model_url?: string | null
          priority?: number
          progress?: number
          queue_position?: number | null
          refined_model_url?: string | null
          status?: string
          updated_at?: string
          venue_id: string
          video_url?: string | null
          worker_id?: string | null
        }
        Update: {
          created_at?: string
          current_stage?: number
          error_message?: string | null
          final_model_url?: string | null
          id?: string
          preview_model_url?: string | null
          priority?: number
          progress?: number
          queue_position?: number | null
          refined_model_url?: string | null
          status?: string
          updated_at?: string
          venue_id?: string
          video_url?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_3d_jobs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_3d_models: {
        Row: {
          created_at: string | null
          hotspots: Json | null
          id: string
          model_type: string
          model_url: string | null
          status: string
          updated_at: string | null
          venue_id: string
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          hotspots?: Json | null
          id?: string
          model_type?: string
          model_url?: string | null
          status?: string
          updated_at?: string | null
          venue_id: string
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          hotspots?: Json | null
          id?: string
          model_type?: string
          model_url?: string | null
          status?: string
          updated_at?: string | null
          venue_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_3d_models_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_activity_scores: {
        Row: {
          activity_score: number
          check_ins_1h: number
          live_streams: number
          live_viewers: number
          posts_1h: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          activity_score?: number
          check_ins_1h?: number
          live_streams?: number
          live_viewers?: number
          posts_1h?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          activity_score?: number
          check_ins_1h?: number
          live_streams?: number
          live_viewers?: number
          posts_1h?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_activity_scores_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_ai_usage: {
        Row: {
          created_at: string | null
          id: string
          usage_type: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          usage_type: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          usage_type?: string
          venue_id?: string
        }
        Relationships: []
      }
      venue_classifications: {
        Row: {
          city: string | null
          country_code: string
          country_name: string
          created_at: string | null
          declared_capacity: number | null
          id: string
          is_founder_venue: boolean | null
          launchpad_mode_ends_at: string
          original_approved_at: string | null
          size_band: string
          tier_category: string
          venue_id: string
        }
        Insert: {
          city?: string | null
          country_code: string
          country_name?: string
          created_at?: string | null
          declared_capacity?: number | null
          id?: string
          is_founder_venue?: boolean | null
          launchpad_mode_ends_at?: string
          original_approved_at?: string | null
          size_band: string
          tier_category: string
          venue_id: string
        }
        Update: {
          city?: string | null
          country_code?: string
          country_name?: string
          created_at?: string | null
          declared_capacity?: number | null
          id?: string
          is_founder_venue?: boolean | null
          launchpad_mode_ends_at?: string
          original_approved_at?: string | null
          size_band?: string
          tier_category?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_classifications_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_deal_redemptions: {
        Row: {
          deal_id: string
          id: string
          placement_type: string | null
          redeemed_at: string
          redemption_code: string
          user_id: string
          venue_id: string
          verified_at: string | null
          verified_by_staff_id: string | null
        }
        Insert: {
          deal_id: string
          id?: string
          placement_type?: string | null
          redeemed_at?: string
          redemption_code: string
          user_id: string
          venue_id: string
          verified_at?: string | null
          verified_by_staff_id?: string | null
        }
        Update: {
          deal_id?: string
          id?: string
          placement_type?: string | null
          redeemed_at?: string
          redemption_code?: string
          user_id?: string
          venue_id?: string
          verified_at?: string | null
          verified_by_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_deal_redemptions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "venue_deals_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_deal_redemptions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_deals_library: {
        Row: {
          created_at: string
          description: string | null
          discount_text: string | null
          expires_at: string | null
          headline: string | null
          id: string
          last_used_at: string | null
          linked_vibe_id: string | null
          media_type: string | null
          media_url: string | null
          placement_types: string[] | null
          reach_tier: string | null
          scheduled_for: string | null
          status: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_text?: string | null
          expires_at?: string | null
          headline?: string | null
          id?: string
          last_used_at?: string | null
          linked_vibe_id?: string | null
          media_type?: string | null
          media_url?: string | null
          placement_types?: string[] | null
          reach_tier?: string | null
          scheduled_for?: string | null
          status?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_text?: string | null
          expires_at?: string | null
          headline?: string | null
          id?: string
          last_used_at?: string | null
          linked_vibe_id?: string | null
          media_type?: string | null
          media_url?: string | null
          placement_types?: string[] | null
          reach_tier?: string | null
          scheduled_for?: string | null
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_deals_library_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_follows: {
        Row: {
          created_at: string
          follow_type: string
          id: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          follow_type?: string
          id?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          follow_type?: string
          id?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_follows_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_impact_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          impact_value: number
          metadata: Json
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          impact_value?: number
          metadata?: Json
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          impact_value?: number
          metadata?: Json
          user_id?: string
          venue_id?: string
        }
        Relationships: []
      }
      venue_memory: {
        Row: {
          content: string
          created_at: string
          id: string
          memory_type: string
          metadata: Json | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          memory_type: string
          metadata?: Json | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          memory_type?: string
          metadata?: Json | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_memory_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_menu_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number | null
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_menu_categories_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_menu_items: {
        Row: {
          available: boolean
          base_price: number
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          preparation_time: number | null
          sizes: Json | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          available?: boolean
          base_price?: number
          category: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          preparation_time?: number | null
          sizes?: Json | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          available?: boolean
          base_price?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          preparation_time?: number | null
          sizes?: Json | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_menu_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_modules: {
        Row: {
          ai_assistant: boolean
          analytics_level: string
          created_at: string
          deliveries: boolean
          floorplan: boolean
          home_orb_config: Json
          id: string
          inventory: boolean
          kitchen: boolean
          menu: boolean
          messaging: boolean
          orders: boolean
          payments: boolean
          pos: boolean
          preset: string
          push_deals: boolean
          reservations: boolean
          staff: boolean
          tables: boolean
          updated_at: string
          venue_id: string
          vibe_credits: number | null
          vibes_enabled: boolean | null
          wallet: boolean
        }
        Insert: {
          ai_assistant?: boolean
          analytics_level?: string
          created_at?: string
          deliveries?: boolean
          floorplan?: boolean
          home_orb_config?: Json
          id?: string
          inventory?: boolean
          kitchen?: boolean
          menu?: boolean
          messaging?: boolean
          orders?: boolean
          payments?: boolean
          pos?: boolean
          preset?: string
          push_deals?: boolean
          reservations?: boolean
          staff?: boolean
          tables?: boolean
          updated_at?: string
          venue_id: string
          vibe_credits?: number | null
          vibes_enabled?: boolean | null
          wallet?: boolean
        }
        Update: {
          ai_assistant?: boolean
          analytics_level?: string
          created_at?: string
          deliveries?: boolean
          floorplan?: boolean
          home_orb_config?: Json
          id?: string
          inventory?: boolean
          kitchen?: boolean
          menu?: boolean
          messaging?: boolean
          orders?: boolean
          payments?: boolean
          pos?: boolean
          preset?: string
          push_deals?: boolean
          reservations?: boolean
          staff?: boolean
          tables?: boolean
          updated_at?: string
          venue_id?: string
          vibe_credits?: number | null
          vibes_enabled?: boolean | null
          wallet?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "venue_modules_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_operating_hours: {
        Row: {
          close_time: string
          created_at: string | null
          day_of_week: number
          id: string
          is_closed: boolean | null
          open_time: string
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          close_time: string
          created_at?: string | null
          day_of_week: number
          id?: string
          is_closed?: boolean | null
          open_time: string
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          close_time?: string
          created_at?: string | null
          day_of_week?: number
          id?: string
          is_closed?: boolean | null
          open_time?: string
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_operating_hours_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_owner_security: {
        Row: {
          created_at: string | null
          face_enrolled_at: string | null
          face_reference_key: string | null
          face_threshold_amount: number | null
          id: string
          owner_id: string
          pin_failed_attempts: number | null
          pin_hash: string | null
          pin_locked_until: string | null
          pin_salt: string | null
          require_face_for_withdrawal: boolean | null
          require_pin_for_withdrawal: boolean | null
          updated_at: string | null
          venue_id: string
          withdrawal_daily_limit: number | null
          withdrawal_per_tx_limit: number | null
        }
        Insert: {
          created_at?: string | null
          face_enrolled_at?: string | null
          face_reference_key?: string | null
          face_threshold_amount?: number | null
          id?: string
          owner_id: string
          pin_failed_attempts?: number | null
          pin_hash?: string | null
          pin_locked_until?: string | null
          pin_salt?: string | null
          require_face_for_withdrawal?: boolean | null
          require_pin_for_withdrawal?: boolean | null
          updated_at?: string | null
          venue_id: string
          withdrawal_daily_limit?: number | null
          withdrawal_per_tx_limit?: number | null
        }
        Update: {
          created_at?: string | null
          face_enrolled_at?: string | null
          face_reference_key?: string | null
          face_threshold_amount?: number | null
          id?: string
          owner_id?: string
          pin_failed_attempts?: number | null
          pin_hash?: string | null
          pin_locked_until?: string | null
          pin_salt?: string | null
          require_face_for_withdrawal?: boolean | null
          require_pin_for_withdrawal?: boolean | null
          updated_at?: string | null
          venue_id?: string
          withdrawal_daily_limit?: number | null
          withdrawal_per_tx_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_owner_security_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_performers: {
        Row: {
          active_end: string | null
          active_start: string | null
          created_at: string | null
          display_name: string | null
          id: string
          permissions: string[] | null
          role: string
          status: string | null
          user_id: string
          venue_id: string
        }
        Insert: {
          active_end?: string | null
          active_start?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          permissions?: string[] | null
          role: string
          status?: string | null
          user_id: string
          venue_id: string
        }
        Update: {
          active_end?: string | null
          active_start?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          permissions?: string[] | null
          role?: string
          status?: string | null
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_performers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_pioneer_status: {
        Row: {
          country_code: string
          id: string
          is_active: boolean | null
          pioneer_badge_awarded_at: string | null
          pool_size_at_award: number | null
          size_band: string
          tier_category: string
          venue_id: string
        }
        Insert: {
          country_code: string
          id?: string
          is_active?: boolean | null
          pioneer_badge_awarded_at?: string | null
          pool_size_at_award?: number | null
          size_band: string
          tier_category: string
          venue_id: string
        }
        Update: {
          country_code?: string
          id?: string
          is_active?: boolean | null
          pioneer_badge_awarded_at?: string | null
          pool_size_at_award?: number | null
          size_band?: string
          tier_category?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_pioneer_status_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_push_credits: {
        Row: {
          created_at: string
          credit_type: string
          credits_remaining: number
          id: string
          reach_tier: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          credit_type?: string
          credits_remaining?: number
          id?: string
          reach_tier: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          credit_type?: string
          credits_remaining?: number
          id?: string
          reach_tier?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_push_credits_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_reports: {
        Row: {
          admin_notes: string | null
          created_at: string
          description: string
          evidence_urls: string[] | null
          id: string
          report_type: string
          reported_venue_id: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          description: string
          evidence_urls?: string[] | null
          id?: string
          report_type: string
          reported_venue_id: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          description?: string
          evidence_urls?: string[] | null
          id?: string
          report_type?: string
          reported_venue_id?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_reports_reported_venue_id_fkey"
            columns: ["reported_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_score_counters: {
        Row: {
          checkins_current: number | null
          deals_run_current: number | null
          events_hosted_current: number | null
          features_used_flags: number | null
          id: string
          jvc_transactions_current: number | null
          last_counter_reset: string | null
          live_streams_current: number | null
          orders_completed_current: number | null
          orders_response_time_sum_minutes: number | null
          orders_total_current: number | null
          prev_checkins: number | null
          prev_jvc_transactions: number | null
          prev_orders_completed: number | null
          prev_orders_total: number | null
          prev_returning_customers: number | null
          prev_unique_customers: number | null
          push_notifications_sent_current: number | null
          returning_customers_current: number | null
          tagged_post_engagements_current: number | null
          unique_customers_current: number | null
          updated_at: string | null
          venue_id: string
          window_prev_start: string
          window_start: string
        }
        Insert: {
          checkins_current?: number | null
          deals_run_current?: number | null
          events_hosted_current?: number | null
          features_used_flags?: number | null
          id?: string
          jvc_transactions_current?: number | null
          last_counter_reset?: string | null
          live_streams_current?: number | null
          orders_completed_current?: number | null
          orders_response_time_sum_minutes?: number | null
          orders_total_current?: number | null
          prev_checkins?: number | null
          prev_jvc_transactions?: number | null
          prev_orders_completed?: number | null
          prev_orders_total?: number | null
          prev_returning_customers?: number | null
          prev_unique_customers?: number | null
          push_notifications_sent_current?: number | null
          returning_customers_current?: number | null
          tagged_post_engagements_current?: number | null
          unique_customers_current?: number | null
          updated_at?: string | null
          venue_id: string
          window_prev_start?: string
          window_start?: string
        }
        Update: {
          checkins_current?: number | null
          deals_run_current?: number | null
          events_hosted_current?: number | null
          features_used_flags?: number | null
          id?: string
          jvc_transactions_current?: number | null
          last_counter_reset?: string | null
          live_streams_current?: number | null
          orders_completed_current?: number | null
          orders_response_time_sum_minutes?: number | null
          orders_total_current?: number | null
          prev_checkins?: number | null
          prev_jvc_transactions?: number | null
          prev_orders_completed?: number | null
          prev_orders_total?: number | null
          prev_returning_customers?: number | null
          prev_unique_customers?: number | null
          push_notifications_sent_current?: number | null
          returning_customers_current?: number | null
          tagged_post_engagements_current?: number | null
          unique_customers_current?: number | null
          updated_at?: string | null
          venue_id?: string
          window_prev_start?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_score_counters_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_tables: {
        Row: {
          capacity: number
          created_at: string | null
          floorplan_id: string | null
          id: string
          section: string | null
          status: string | null
          table_number: string
          updated_at: string | null
          x_position: number | null
          y_position: number | null
        }
        Insert: {
          capacity?: number
          created_at?: string | null
          floorplan_id?: string | null
          id?: string
          section?: string | null
          status?: string | null
          table_number: string
          updated_at?: string | null
          x_position?: number | null
          y_position?: number | null
        }
        Update: {
          capacity?: number
          created_at?: string | null
          floorplan_id?: string | null
          id?: string
          section?: string | null
          status?: string | null
          table_number?: string
          updated_at?: string | null
          x_position?: number | null
          y_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_tables_floorplan_id_fkey"
            columns: ["floorplan_id"]
            isOneToOne: false
            referencedRelation: "floorplans"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_terminals: {
        Row: {
          created_at: string | null
          device_id: string
          id: string
          is_active: boolean | null
          last_seen_at: string | null
          staff_id: string
          terminal_name: string
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          device_id: string
          id?: string
          is_active?: boolean | null
          last_seen_at?: string | null
          staff_id: string
          terminal_name?: string
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: string
          id?: string
          is_active?: boolean | null
          last_seen_at?: string | null
          staff_id?: string
          terminal_name?: string
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_terminals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_test_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          declined_at: string | null
          id: string
          invited_by: string
          invited_user_id: string
          is_simulator: boolean
          status: string
          test_balance_cents: number
          venue_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          declined_at?: string | null
          id?: string
          invited_by: string
          invited_user_id: string
          is_simulator?: boolean
          status?: string
          test_balance_cents?: number
          venue_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          declined_at?: string | null
          id?: string
          invited_by?: string
          invited_user_id?: string
          is_simulator?: boolean
          status?: string
          test_balance_cents?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_test_invites_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_test_users: {
        Row: {
          id: string
          invited_at: string
          invited_by: string
          status: string
          user_id: string
          venue_id: string
        }
        Insert: {
          id?: string
          invited_at?: string
          invited_by: string
          status?: string
          user_id: string
          venue_id: string
        }
        Update: {
          id?: string
          invited_at?: string
          invited_by?: string
          status?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_test_users_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_tier_history: {
        Row: {
          changed_at: string | null
          composite_score_at_change: number | null
          id: string
          new_tier: string
          previous_tier: string
          reason: string
          venue_id: string
        }
        Insert: {
          changed_at?: string | null
          composite_score_at_change?: number | null
          id?: string
          new_tier: string
          previous_tier: string
          reason: string
          venue_id: string
        }
        Update: {
          changed_at?: string | null
          composite_score_at_change?: number | null
          id?: string
          new_tier?: string
          previous_tier?: string
          reason?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_tier_history_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_tier_scores: {
        Row: {
          at_risk_since: string | null
          bonus_points: number | null
          composite_score: number | null
          created_at: string | null
          current_tier: string
          engagement_score: number | null
          fulfillment_score: number | null
          grace_period_ends_at: string | null
          id: string
          is_tier_at_risk: boolean | null
          last_calculated_at: string | null
          launchpad_active: boolean | null
          launchpad_multiplier_applied: number | null
          needs_recalculation: boolean | null
          participation_score: number | null
          raw_score_before_multiplier: number | null
          return_rate_score: number | null
          score_frozen: boolean | null
          size_multiplier: number | null
          tier_updated_at: string | null
          updated_at: string | null
          utilization_score: number | null
          velocity_score: number | null
          venue_id: string
        }
        Insert: {
          at_risk_since?: string | null
          bonus_points?: number | null
          composite_score?: number | null
          created_at?: string | null
          current_tier?: string
          engagement_score?: number | null
          fulfillment_score?: number | null
          grace_period_ends_at?: string | null
          id?: string
          is_tier_at_risk?: boolean | null
          last_calculated_at?: string | null
          launchpad_active?: boolean | null
          launchpad_multiplier_applied?: number | null
          needs_recalculation?: boolean | null
          participation_score?: number | null
          raw_score_before_multiplier?: number | null
          return_rate_score?: number | null
          score_frozen?: boolean | null
          size_multiplier?: number | null
          tier_updated_at?: string | null
          updated_at?: string | null
          utilization_score?: number | null
          velocity_score?: number | null
          venue_id: string
        }
        Update: {
          at_risk_since?: string | null
          bonus_points?: number | null
          composite_score?: number | null
          created_at?: string | null
          current_tier?: string
          engagement_score?: number | null
          fulfillment_score?: number | null
          grace_period_ends_at?: string | null
          id?: string
          is_tier_at_risk?: boolean | null
          last_calculated_at?: string | null
          launchpad_active?: boolean | null
          launchpad_multiplier_applied?: number | null
          needs_recalculation?: boolean | null
          participation_score?: number | null
          raw_score_before_multiplier?: number | null
          return_rate_score?: number | null
          score_frozen?: boolean | null
          size_multiplier?: number | null
          tier_updated_at?: string | null
          updated_at?: string | null
          utilization_score?: number | null
          velocity_score?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_tier_scores_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_verification_documents: {
        Row: {
          address_confidence: number | null
          address_match_score: number | null
          admin_notes: string | null
          business_name_confidence: number | null
          business_name_match_score: number | null
          created_at: string
          document_type: string
          extracted_account_number: string | null
          extracted_address: string | null
          extracted_business_name: string | null
          extracted_city: string | null
          extracted_country: string | null
          extracted_document_number: string | null
          extracted_expiry_date: string | null
          extracted_issue_date: string | null
          extracted_postal_code: string | null
          extracted_state: string | null
          failure_reason: string | null
          id: string
          overall_confidence: number | null
          raw_ocr_blocks: Json | null
          raw_ocr_text: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          s3_key: string | null
          status: string
          storage_url: string
          updated_at: string
          uploaded_by: string
          venue_id: string
        }
        Insert: {
          address_confidence?: number | null
          address_match_score?: number | null
          admin_notes?: string | null
          business_name_confidence?: number | null
          business_name_match_score?: number | null
          created_at?: string
          document_type: string
          extracted_account_number?: string | null
          extracted_address?: string | null
          extracted_business_name?: string | null
          extracted_city?: string | null
          extracted_country?: string | null
          extracted_document_number?: string | null
          extracted_expiry_date?: string | null
          extracted_issue_date?: string | null
          extracted_postal_code?: string | null
          extracted_state?: string | null
          failure_reason?: string | null
          id?: string
          overall_confidence?: number | null
          raw_ocr_blocks?: Json | null
          raw_ocr_text?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          s3_key?: string | null
          status?: string
          storage_url: string
          updated_at?: string
          uploaded_by: string
          venue_id: string
        }
        Update: {
          address_confidence?: number | null
          address_match_score?: number | null
          admin_notes?: string | null
          business_name_confidence?: number | null
          business_name_match_score?: number | null
          created_at?: string
          document_type?: string
          extracted_account_number?: string | null
          extracted_address?: string | null
          extracted_business_name?: string | null
          extracted_city?: string | null
          extracted_country?: string | null
          extracted_document_number?: string | null
          extracted_expiry_date?: string | null
          extracted_issue_date?: string | null
          extracted_postal_code?: string | null
          extracted_state?: string | null
          failure_reason?: string | null
          id?: string
          overall_confidence?: number | null
          raw_ocr_blocks?: Json | null
          raw_ocr_text?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          s3_key?: string | null
          status?: string
          storage_url?: string
          updated_at?: string
          uploaded_by?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_verification_documents_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_vibe_credits: {
        Row: {
          created_at: string | null
          credit_type: string
          credits_remaining: number
          id: string
          last_weekly_refresh_at: string | null
          reach_tier: string
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          credit_type?: string
          credits_remaining?: number
          id?: string
          last_weekly_refresh_at?: string | null
          reach_tier?: string
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string | null
          credit_type?: string
          credits_remaining?: number
          id?: string
          last_weekly_refresh_at?: string | null
          reach_tier?: string
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_vibe_credits_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_vibe_tags: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          tag_name: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          tag_name: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          tag_name?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_vibe_tags_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_vibes: {
        Row: {
          converted_to_deal_id: string | null
          created_at: string | null
          expires_at: string
          id: string
          message: string
          reach_type: string | null
          response_summary: Json | null
          status: string | null
          venue_id: string
        }
        Insert: {
          converted_to_deal_id?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          message: string
          reach_type?: string | null
          response_summary?: Json | null
          status?: string | null
          venue_id: string
        }
        Update: {
          converted_to_deal_id?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          message?: string
          reach_type?: string | null
          response_summary?: Json | null
          status?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_vibes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_wallets: {
        Row: {
          balance_jvc: number
          balance_usd: number
          created_at: string
          freeze_reason: string | null
          frozen_at: string | null
          frozen_by: string | null
          id: string
          is_frozen: boolean
          locked_balance: number
          pending_balance: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          balance_jvc?: number
          balance_usd?: number
          created_at?: string
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          id?: string
          is_frozen?: boolean
          locked_balance?: number
          pending_balance?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          balance_jvc?: number
          balance_usd?: number
          created_at?: string
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          id?: string
          is_frozen?: boolean
          locked_balance?: number
          pending_balance?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_wallets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_weekly_competitions: {
        Row: {
          competition_type: string
          country_code: string
          created_at: string | null
          id: string
          is_winner: boolean | null
          meets_minimum_threshold: boolean | null
          metric_value: number | null
          pool_size: number | null
          rank_in_pool: number | null
          score_bonus_applied: boolean | null
          size_band: string
          tier_category: string
          updated_at: string | null
          venue_id: string
          week_start: string
          winner_badge_expires_at: string | null
        }
        Insert: {
          competition_type: string
          country_code: string
          created_at?: string | null
          id?: string
          is_winner?: boolean | null
          meets_minimum_threshold?: boolean | null
          metric_value?: number | null
          pool_size?: number | null
          rank_in_pool?: number | null
          score_bonus_applied?: boolean | null
          size_band: string
          tier_category: string
          updated_at?: string | null
          venue_id: string
          week_start: string
          winner_badge_expires_at?: string | null
        }
        Update: {
          competition_type?: string
          country_code?: string
          created_at?: string | null
          id?: string
          is_winner?: boolean | null
          meets_minimum_threshold?: boolean | null
          metric_value?: number | null
          pool_size?: number | null
          rank_in_pool?: number | null
          score_bonus_applied?: boolean | null
          size_band?: string
          tier_category?: string
          updated_at?: string | null
          venue_id?: string
          week_start?: string
          winner_badge_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_weekly_competitions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_withdrawal_audit: {
        Row: {
          amount: number
          created_at: string | null
          failure_reason: string | null
          id: string
          ip_address: string | null
          owner_id: string
          venue_id: string
          verification_method: string
          verification_passed: boolean
          withdrawal_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          owner_id: string
          venue_id: string
          verification_method: string
          verification_passed: boolean
          withdrawal_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          owner_id?: string
          venue_id?: string
          verification_method?: string
          verification_passed?: boolean
          withdrawal_id?: string | null
        }
        Relationships: []
      }
      venues: {
        Row: {
          address: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          business_email: string | null
          business_license: string | null
          capacity: number | null
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          currency: string | null
          current_occupancy: number | null
          default_reservation_duration_minutes: number | null
          delivery_enabled: boolean | null
          deposit_deadline_hours: number | null
          deposit_required_within_hours: number | null
          description: string | null
          id: string
          image_url: string | null
          is_18_plus: boolean | null
          is_21_plus: boolean | null
          language_confidence: number | null
          latitude: number | null
          longitude: number | null
          max_advance_booking_days: number | null
          max_delivery_radius_km: number | null
          min_booking_lead_minutes: number | null
          name: string
          owner_user_id: string | null
          phone: string | null
          registration_step: string | null
          rejection_reason: string | null
          require_employee_face_id: boolean | null
          requires_id_verification: boolean | null
          reservation_deposit_percent: number | null
          reservations_enabled: boolean | null
          source_language: string | null
          staff_size: string | null
          stripe_account_id: string | null
          stripe_charges_enabled: boolean | null
          stripe_country: string | null
          stripe_onboarding_complete: boolean | null
          stripe_onboarding_expires_at: string | null
          stripe_onboarding_url: string | null
          stripe_payouts_enabled: boolean | null
          subscription_id: string | null
          subscription_started_at: string | null
          time_slot_interval_minutes: number | null
          timezone: string | null
          updated_at: string | null
          venue_setup_type: string | null
          venue_status: string
          venue_type: string | null
          verified_at: string | null
          vibe_score: number | null
          went_live_at: string | null
        }
        Insert: {
          address?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_email?: string | null
          business_license?: string | null
          capacity?: number | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          currency?: string | null
          current_occupancy?: number | null
          default_reservation_duration_minutes?: number | null
          delivery_enabled?: boolean | null
          deposit_deadline_hours?: number | null
          deposit_required_within_hours?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_18_plus?: boolean | null
          is_21_plus?: boolean | null
          language_confidence?: number | null
          latitude?: number | null
          longitude?: number | null
          max_advance_booking_days?: number | null
          max_delivery_radius_km?: number | null
          min_booking_lead_minutes?: number | null
          name: string
          owner_user_id?: string | null
          phone?: string | null
          registration_step?: string | null
          rejection_reason?: string | null
          require_employee_face_id?: boolean | null
          requires_id_verification?: boolean | null
          reservation_deposit_percent?: number | null
          reservations_enabled?: boolean | null
          source_language?: string | null
          staff_size?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean | null
          stripe_country?: string | null
          stripe_onboarding_complete?: boolean | null
          stripe_onboarding_expires_at?: string | null
          stripe_onboarding_url?: string | null
          stripe_payouts_enabled?: boolean | null
          subscription_id?: string | null
          subscription_started_at?: string | null
          time_slot_interval_minutes?: number | null
          timezone?: string | null
          updated_at?: string | null
          venue_setup_type?: string | null
          venue_status?: string
          venue_type?: string | null
          verified_at?: string | null
          vibe_score?: number | null
          went_live_at?: string | null
        }
        Update: {
          address?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_email?: string | null
          business_license?: string | null
          capacity?: number | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          currency?: string | null
          current_occupancy?: number | null
          default_reservation_duration_minutes?: number | null
          delivery_enabled?: boolean | null
          deposit_deadline_hours?: number | null
          deposit_required_within_hours?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_18_plus?: boolean | null
          is_21_plus?: boolean | null
          language_confidence?: number | null
          latitude?: number | null
          longitude?: number | null
          max_advance_booking_days?: number | null
          max_delivery_radius_km?: number | null
          min_booking_lead_minutes?: number | null
          name?: string
          owner_user_id?: string | null
          phone?: string | null
          registration_step?: string | null
          rejection_reason?: string | null
          require_employee_face_id?: boolean | null
          requires_id_verification?: boolean | null
          reservation_deposit_percent?: number | null
          reservations_enabled?: boolean | null
          source_language?: string | null
          staff_size?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean | null
          stripe_country?: string | null
          stripe_onboarding_complete?: boolean | null
          stripe_onboarding_expires_at?: string | null
          stripe_onboarding_url?: string | null
          stripe_payouts_enabled?: boolean | null
          subscription_id?: string | null
          subscription_started_at?: string | null
          time_slot_interval_minutes?: number | null
          timezone?: string | null
          updated_at?: string | null
          venue_setup_type?: string | null
          venue_status?: string
          venue_type?: string | null
          verified_at?: string | null
          vibe_score?: number | null
          went_live_at?: string | null
        }
        Relationships: []
      }
      verification_documents: {
        Row: {
          computed_age: number | null
          created_at: string
          dob_confidence: number | null
          document_number_confidence: number | null
          document_side: string
          document_type: string
          extracted_address: string | null
          extracted_country: string | null
          extracted_date_of_birth: string | null
          extracted_document_number: string | null
          extracted_expiry_date: string | null
          extracted_first_name: string | null
          extracted_full_name: string | null
          extracted_gender: string | null
          extracted_issue_date: string | null
          extracted_last_name: string | null
          failure_reason: string | null
          id: string
          is_18_plus: boolean | null
          is_21_plus: boolean | null
          is_expired: boolean | null
          name_confidence: number | null
          overall_confidence: number | null
          raw_ocr_blocks: Json | null
          raw_ocr_text: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          s3_key: string | null
          status: string
          storage_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          computed_age?: number | null
          created_at?: string
          dob_confidence?: number | null
          document_number_confidence?: number | null
          document_side?: string
          document_type: string
          extracted_address?: string | null
          extracted_country?: string | null
          extracted_date_of_birth?: string | null
          extracted_document_number?: string | null
          extracted_expiry_date?: string | null
          extracted_first_name?: string | null
          extracted_full_name?: string | null
          extracted_gender?: string | null
          extracted_issue_date?: string | null
          extracted_last_name?: string | null
          failure_reason?: string | null
          id?: string
          is_18_plus?: boolean | null
          is_21_plus?: boolean | null
          is_expired?: boolean | null
          name_confidence?: number | null
          overall_confidence?: number | null
          raw_ocr_blocks?: Json | null
          raw_ocr_text?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          s3_key?: string | null
          status?: string
          storage_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          computed_age?: number | null
          created_at?: string
          dob_confidence?: number | null
          document_number_confidence?: number | null
          document_side?: string
          document_type?: string
          extracted_address?: string | null
          extracted_country?: string | null
          extracted_date_of_birth?: string | null
          extracted_document_number?: string | null
          extracted_expiry_date?: string | null
          extracted_first_name?: string | null
          extracted_full_name?: string | null
          extracted_gender?: string | null
          extracted_issue_date?: string | null
          extracted_last_name?: string | null
          failure_reason?: string | null
          id?: string
          is_18_plus?: boolean | null
          is_21_plus?: boolean | null
          is_expired?: boolean | null
          name_confidence?: number | null
          overall_confidence?: number | null
          raw_ocr_blocks?: Json | null
          raw_ocr_text?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          s3_key?: string | null
          status?: string
          storage_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vibe_credit_fulfillments: {
        Row: {
          amount_cents: number
          created_at: string | null
          credits_granted: number
          fulfilled_by: string | null
          id: string
          reach_tier: string
          stripe_session_id: string
          venue_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string | null
          credits_granted: number
          fulfilled_by?: string | null
          id?: string
          reach_tier: string
          stripe_session_id: string
          venue_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          credits_granted?: number
          fulfilled_by?: string | null
          id?: string
          reach_tier?: string
          stripe_session_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_credit_fulfillments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_responses: {
        Row: {
          created_at: string | null
          id: string
          response: string
          user_id: string
          vibe_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          response: string
          user_id: string
          vibe_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          response?: string
          user_id?: string
          vibe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_responses_vibe_id_fkey"
            columns: ["vibe_id"]
            isOneToOne: false
            referencedRelation: "venue_vibes"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_tags: {
        Row: {
          category: string
          created_at: string
          created_by_venue_id: string | null
          id: string
          status: string
          tag_name: string
          usage_count: number
        }
        Insert: {
          category: string
          created_at?: string
          created_by_venue_id?: string | null
          id?: string
          status?: string
          tag_name: string
          usage_count?: number
        }
        Update: {
          category?: string
          created_at?: string
          created_by_venue_id?: string | null
          id?: string
          status?: string
          tag_name?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "vibe_tags_created_by_venue_id_fkey"
            columns: ["created_by_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_freezes: {
        Row: {
          created_at: string
          freeze_reason: string
          frozen_by: string
          id: string
          is_active: boolean
          unfreeze_reason: string | null
          unfrozen_at: string | null
          unfrozen_by: string | null
          wallet_id: string
          wallet_type: string
        }
        Insert: {
          created_at?: string
          freeze_reason: string
          frozen_by: string
          id?: string
          is_active?: boolean
          unfreeze_reason?: string | null
          unfrozen_at?: string | null
          unfrozen_by?: string | null
          wallet_id: string
          wallet_type: string
        }
        Update: {
          created_at?: string
          freeze_reason?: string
          frozen_by?: string
          id?: string
          is_active?: boolean
          unfreeze_reason?: string | null
          unfrozen_at?: string | null
          unfrozen_by?: string | null
          wallet_id?: string
          wallet_type?: string
        }
        Relationships: []
      }
      withdrawal_auth_tokens: {
        Row: {
          authorized_amount: number
          created_at: string | null
          expires_at: string
          id: string
          owner_id: string
          token: string
          used: boolean | null
          used_at: string | null
          venue_id: string
        }
        Insert: {
          authorized_amount: number
          created_at?: string | null
          expires_at: string
          id?: string
          owner_id: string
          token: string
          used?: boolean | null
          used_at?: string | null
          venue_id: string
        }
        Update: {
          authorized_amount?: number
          created_at?: string | null
          expires_at?: string
          id?: string
          owner_id?: string
          token?: string
          used?: boolean | null
          used_at?: string | null
          venue_id?: string
        }
        Relationships: []
      }
      withdrawal_records: {
        Row: {
          amount_jvc: number
          amount_local: number
          amount_usd: number
          approved_at: string | null
          approved_by: string | null
          bank_account_last4: string | null
          bank_name: string | null
          completed_at: string | null
          created_at: string
          crypto_to_address: string | null
          crypto_tx_hash: string | null
          exchange_rate: number
          failure_reason: string | null
          fee_amount: number
          id: string
          local_currency: string
          metadata: Json | null
          net_payout: number
          processed_at: string | null
          rejection_reason: string | null
          status: string
          stripe_payout_id: string | null
          user_id: string | null
          venue_id: string | null
          withdrawal_method: string
        }
        Insert: {
          amount_jvc: number
          amount_local: number
          amount_usd: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account_last4?: string | null
          bank_name?: string | null
          completed_at?: string | null
          created_at?: string
          crypto_to_address?: string | null
          crypto_tx_hash?: string | null
          exchange_rate?: number
          failure_reason?: string | null
          fee_amount?: number
          id?: string
          local_currency?: string
          metadata?: Json | null
          net_payout: number
          processed_at?: string | null
          rejection_reason?: string | null
          status?: string
          stripe_payout_id?: string | null
          user_id?: string | null
          venue_id?: string | null
          withdrawal_method: string
        }
        Update: {
          amount_jvc?: number
          amount_local?: number
          amount_usd?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account_last4?: string | null
          bank_name?: string | null
          completed_at?: string | null
          created_at?: string
          crypto_to_address?: string | null
          crypto_tx_hash?: string | null
          exchange_rate?: number
          failure_reason?: string | null
          fee_amount?: number
          id?: string
          local_currency?: string
          metadata?: Json | null
          net_payout?: number
          processed_at?: string | null
          rejection_reason?: string | null
          status?: string
          stripe_payout_id?: string | null
          user_id?: string | null
          venue_id?: string | null
          withdrawal_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_records_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      top_users_by_pounds: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string | null
          location: string | null
          total_pounds: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_treasury_daily_flows: {
        Row: {
          day: string | null
          deposits_usd: number | null
          offramps_usd: number | null
          swaps_usd: number | null
          withdrawals_usd: number | null
        }
        Relationships: []
      }
      v_treasury_health: {
        Row: {
          pending_deposits_usd: number | null
          pending_offramps_usd: number | null
          pending_withdrawals_usd: number | null
          total_jvc_outstanding: number | null
          total_rlusd_reserves: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_venue_composite_score: {
        Args: { p_venue_id: string }
        Returns: number
      }
      calculate_venue_engagement_score: {
        Args: { p_venue_id: string }
        Returns: number
      }
      calculate_venue_fulfillment_score: {
        Args: { p_venue_id: string }
        Returns: number
      }
      calculate_venue_participation_score: {
        Args: { p_venue_id: string }
        Returns: number
      }
      calculate_venue_return_rate_score: {
        Args: { p_venue_id: string }
        Returns: number
      }
      calculate_venue_utilization_score: {
        Args: { p_venue_id: string }
        Returns: number
      }
      calculate_venue_velocity_score: {
        Args: { p_venue_id: string }
        Returns: number
      }
      can_approve_venue_entry: {
        Args: { p_venue_id: string }
        Returns: boolean
      }
      can_manage_venue_caution_preferences: {
        Args: { p_venue_id: string }
        Returns: boolean
      }
      can_manage_venue_patron_moderation: {
        Args: { p_venue_id: string }
        Returns: boolean
      }
      can_view_venue_internal_patrons: {
        Args: { p_venue_id: string }
        Returns: boolean
      }
      check_ai_quota: {
        Args: { p_intent: string; p_user_id: string }
        Returns: Json
      }
      checkout_current_venue_checkin: {
        Args: { p_idempotency_key?: string; p_venue_id: string }
        Returns: Json
      }
      complete_bridge_transfer: {
        Args: {
          p_bank_reference: string
          p_bridge_transfer_id: string
          p_destination_amount: number
          p_transfer_id: string
        }
        Returns: undefined
      }
      complete_crypto_swap: {
        Args: {
          p_actual_to_amount: number
          p_executed_rate: number
          p_swap_id: string
          p_tx_hash: string
        }
        Returns: undefined
      }
      count_referral_residual_months: {
        Args: { p_referral_id: string }
        Returns: number
      }
      create_venue_checkin_for_user: {
        Args: {
          p_checkin_entry_source?: string
          p_idempotency_key?: string
          p_metadata?: Json
          p_venue_id: string
          p_verification_state?: string
          p_visibility?: string
        }
        Returns: Json
      }
      credit_venue_wallet: {
        Args: { p_amount: number; p_description?: string; p_venue_id: string }
        Returns: number
      }
      credit_wallet: {
        Args: { p_amount: number; p_description?: string; p_user_id: string }
        Returns: number
      }
      crypto_available_balance: { Args: { _user_id: string }; Returns: number }
      debit_wallet: {
        Args: { p_amount: number; p_description?: string; p_user_id: string }
        Returns: number
      }
      delete_venue_menu_category: {
        Args: { p_category: string; p_venue_id: string }
        Returns: boolean
      }
      detect_text_language: {
        Args: { p_text: string }
        Returns: {
          confidence: number
          lang: string
        }[]
      }
      evaluate_venue_tier: { Args: { p_venue_id: string }; Returns: string }
      execute_crypto_swap: {
        Args: {
          p_deposit_id?: string
          p_quote_id: string
          p_source?: string
          p_user_id: string
        }
        Returns: string
      }
      fail_bridge_transfer: {
        Args: { p_reason: string; p_transfer_id: string }
        Returns: undefined
      }
      fail_crypto_swap: {
        Args: { p_reason: string; p_swap_id: string }
        Returns: undefined
      }
      generate_referral_code: { Args: never; Returns: string }
      get_driver_signup_ad: {
        Args: {
          p_city: string
          p_country: string
          p_state: string
          p_suburb: string
        }
        Returns: {
          auto_details: Json
          booking_id: string
          campaign_id: string
          cta_text: string
          cta_url: string
          description: string
          headline: string
          media_url: string
          suburb_match: number
        }[]
      }
      get_or_create_ai_usage: {
        Args: { p_period_type?: string; p_user_id: string }
        Returns: {
          created_at: string
          discovery_tokens_used: number
          general_tokens_used: number
          id: string
          last_reset: string
          period_start: string
          period_type: string
          tier: string
          tokens_used: number
          updated_at: string
          user_id: string
          venue_tokens_used: number
        }
        SetofOptions: {
          from: "*"
          to: "ai_usage"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_referral_total_residuals: {
        Args: { p_referral_id: string }
        Returns: number
      }
      get_venue_staff_operational_notifications: {
        Args: { p_include_read?: boolean; p_limit?: number; p_venue_id: string }
        Returns: Json
      }
      grant_crypto_sandbox_funds: {
        Args: {
          _amount_usd: number
          _note?: string
          _target_user: string
          _venue_id: string
        }
        Returns: Json
      }
      has_recent_venue_operational_action: {
        Args: {
          p_operation_type?: string
          p_venue_id: string
          p_window_seconds?: number
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_venue_operational_idempotency_key: {
        Args: { p_idempotency_key: string }
        Returns: boolean
      }
      increment_user_payouts: { Args: { p_amount: number }; Returns: undefined }
      increment_venue_payouts: {
        Args: { p_amount: number }
        Returns: undefined
      }
      increment_vibe_behavioral_weight: {
        Args: { p_increment?: number; p_tag_name: string; p_user_id: string }
        Returns: undefined
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      mark_all_venue_staff_operational_notifications_read: {
        Args: { p_venue_id: string }
        Returns: undefined
      }
      mark_venue_staff_operational_notification_read: {
        Args: { p_notification_id: string; p_read?: boolean }
        Returns: undefined
      }
      match_documents: {
        Args: {
          filter_venue_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          doc_type: string
          id: string
          metadata: Json
          similarity: number
          venue_id: string
        }[]
      }
      match_user_memory: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_user_id: string
        }
        Returns: {
          content: string
          id: string
          memory_type: string
          metadata: Json
          similarity: number
        }[]
      }
      match_venue_knowledge: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_venue_id: string
        }
        Returns: {
          content: string
          doc_type: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      match_venue_profiles: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          user_lat?: number
          user_lng?: number
        }
        Returns: {
          content: string
          doc_type: string
          id: string
          metadata: Json
          similarity: number
          venue_id: string
        }[]
      }
      process_payment_atomic: {
        Args: {
          p_platform_fee?: number
          p_total_amount: number
          p_user_id: string
          p_venue_id: string
        }
        Returns: Json
      }
      record_ai_usage: {
        Args: { p_intent: string; p_tokens_used: number; p_user_id: string }
        Returns: undefined
      }
      refund_crypto_withdrawal: {
        Args: { _reason: string; _withdrawal_id: string }
        Returns: undefined
      }
      request_bridge_offramp: {
        Args: {
          p_destination_currency: string
          p_external_account_id: string
          p_source_amount: number
          p_source_asset: string
          p_user_id: string
        }
        Returns: string
      }
      request_crypto_withdrawal: {
        Args: {
          _amount_jvc: number
          _asset: string
          _destination_address: string
          _destination_tag: number
          _fee_usd: number
          _network: string
          _pin_verified: boolean
          _user_id: string
        }
        Returns: string
      }
      rename_venue_menu_category: {
        Args: {
          p_current_name: string
          p_next_name: string
          p_venue_id: string
        }
        Returns: boolean
      }
      run_treasury_reconciliation: { Args: never; Returns: string }
      simulate_crypto_sandbox_deposit: {
        Args: { _amount_usd: number }
        Returns: Json
      }
      spend_crypto_sandbox_funds: {
        Args: { _amount_usd: number; _ref?: string; _user_id: string }
        Returns: Json
      }
      store_withdrawal_token: {
        Args: {
          p_amount: number
          p_expires_at: string
          p_owner_id: string
          p_token: string
          p_venue_id: string
        }
        Returns: undefined
      }
      user_has_active_test_invite: {
        Args: { _user_id: string }
        Returns: boolean
      }
      validate_withdrawal_token: {
        Args: {
          p_amount: number
          p_owner_id: string
          p_token: string
          p_venue_id: string
        }
        Returns: boolean
      }
      wipe_user_crypto_sandbox: {
        Args: { _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      ad_campaign_status:
        | "draft"
        | "pending"
        | "approved"
        | "rejected"
        | "live"
        | "paused"
        | "completed"
      ad_placement_type:
        | "city_view"
        | "public_post"
        | "both"
        | "sidebar"
        | "driver_signup"
      advertiser_vertical: "real_estate" | "auto"
      app_role:
        | "admin"
        | "manager"
        | "staff"
        | "kitchen"
        | "owner_superadmin"
        | "admin_manager"
        | "admin_support"
        | "admin_finance"
        | "admin_compliance"
      driver_mode: "car" | "motorcycle" | "bicycle" | "runner"
      id_document_type: "drivers_license" | "passport" | "age_card"
      property_type: "for_sale" | "for_lease" | "for_rent"
      runner_fraud_flag_type:
        | "exceeded_tolerance"
        | "cancelled_at_store"
        | "failed_delivery"
        | "approval_timeout_override"
      runner_hold_status: "held" | "released" | "captured" | "refunded"
      runner_job_status:
        | "pending"
        | "accepted"
        | "at_store"
        | "awaiting_approval"
        | "approved"
        | "purchased"
        | "delivered"
        | "completed"
        | "cancelled"
        | "rejected"
        | "disputed"
      runner_price_tier: "quick" | "standard" | "priority"
      verification_status: "unverified" | "pending" | "verified" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ad_campaign_status: [
        "draft",
        "pending",
        "approved",
        "rejected",
        "live",
        "paused",
        "completed",
      ],
      ad_placement_type: [
        "city_view",
        "public_post",
        "both",
        "sidebar",
        "driver_signup",
      ],
      advertiser_vertical: ["real_estate", "auto"],
      app_role: [
        "admin",
        "manager",
        "staff",
        "kitchen",
        "owner_superadmin",
        "admin_manager",
        "admin_support",
        "admin_finance",
        "admin_compliance",
      ],
      driver_mode: ["car", "motorcycle", "bicycle", "runner"],
      id_document_type: ["drivers_license", "passport", "age_card"],
      property_type: ["for_sale", "for_lease", "for_rent"],
      runner_fraud_flag_type: [
        "exceeded_tolerance",
        "cancelled_at_store",
        "failed_delivery",
        "approval_timeout_override",
      ],
      runner_hold_status: ["held", "released", "captured", "refunded"],
      runner_job_status: [
        "pending",
        "accepted",
        "at_store",
        "awaiting_approval",
        "approved",
        "purchased",
        "delivered",
        "completed",
        "cancelled",
        "rejected",
        "disputed",
      ],
      runner_price_tier: ["quick", "standard", "priority"],
      verification_status: ["unverified", "pending", "verified", "rejected"],
    },
  },
} as const
