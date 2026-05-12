import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AccountItem, ContentItem, Platform } from '@/lib/mock-data';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      monitor_keywords: {
        Row: {
          id: string;
          keyword: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          keyword: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          keyword?: string;
          created_at?: string;
        };
      };
      monitored_accounts: {
        Row: {
          id: string;
          platform: Platform;
          account_name: string;
          account_url: string;
          note: string | null;
          status: AccountItem['status'];
          created_at: string;
        };
        Insert: {
          id?: string;
          platform: Platform;
          account_name: string;
          account_url: string;
          note?: string | null;
          status?: AccountItem['status'];
          created_at?: string;
        };
        Update: {
          id?: string;
          platform?: Platform;
          account_name?: string;
          account_url?: string;
          note?: string | null;
          status?: AccountItem['status'];
          created_at?: string;
        };
      };
      content_items: {
        Row: {
          id: string;
          platform: Platform;
          title: string;
          body: string | null;
          creator_name: string;
          url: string;
          metric_value: number | null;
          metric_label: string | null;
          source: ContentItem['source'];
          found_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform: Platform;
          title: string;
          body?: string | null;
          creator_name: string;
          url: string;
          metric_value?: number | null;
          metric_label?: string | null;
          source: ContentItem['source'];
          found_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform?: Platform;
          title?: string;
          body?: string | null;
          creator_name?: string;
          url?: string;
          metric_value?: number | null;
          metric_label?: string | null;
          source?: ContentItem['source'];
          found_at?: string;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

// This module is imported by server routes only. Do not import it from Client Components,
// because the service role key must never be bundled into browser code.

export function createServerSupabaseClient(): SupabaseClient<Database> | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function mapContentRowToItem(row: Database['public']['Tables']['content_items']['Row']): ContentItem {
  const metricLabel = row.metric_label?.toLowerCase() ?? '';
  const metricValue = row.metric_value ?? undefined;

  return {
    id: row.id,
    platform: row.platform,
    title: row.title || row.body || '未命名内容',
    url: row.url,
    creator: row.creator_name,
    source: row.source,
    discoveredAt: row.found_at,
    metrics: {
      views: metricLabel.includes('view') && row.platform === 'YouTube' ? metricValue : undefined,
      impressions: metricLabel.includes('impression') ? metricValue : undefined,
      engagements: metricLabel.includes('engagement') || metricLabel.includes('互动') ? metricValue : undefined,
      peakViewers: metricLabel.includes('peak') ? metricValue : undefined,
      vodViews: metricLabel.includes('vod') ? metricValue : undefined,
    },
  };
}

export function mapAccountRowToItem(row: Database['public']['Tables']['monitored_accounts']['Row']): AccountItem {
  return {
    id: row.id,
    platform: row.platform,
    name: row.account_name,
    url: row.account_url,
    status: row.status,
    note: row.note ?? undefined,
  };
}
