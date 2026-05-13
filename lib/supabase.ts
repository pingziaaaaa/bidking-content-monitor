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
          name: string;
          url: string;
          status: AccountItem['status'];
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform: Platform;
          name: string;
          url: string;
          status?: AccountItem['status'];
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform?: Platform;
          name?: string;
          url?: string;
          status?: AccountItem['status'];
          note?: string | null;
          created_at?: string;
        };
      };
      content_items: {
        Row: {
          id: string;
          platform: Platform;
          platform_content_id: string | null;
          title: string;
          url: string;
          creator: string;
          source: ContentItem['source'];
          discovered_at: string;
          followers: number | null;
          views: number | null;
          impressions: number | null;
          engagements: number | null;
          peak_viewers: number | null;
          vod_views: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform: Platform;
          platform_content_id?: string | null;
          title: string;
          url: string;
          creator: string;
          source: ContentItem['source'];
          discovered_at: string;
          followers?: number | null;
          views?: number | null;
          impressions?: number | null;
          engagements?: number | null;
          peak_viewers?: number | null;
          vod_views?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform?: Platform;
          platform_content_id?: string | null;
          title?: string;
          url?: string;
          creator?: string;
          source?: ContentItem['source'];
          discovered_at?: string;
          followers?: number | null;
          views?: number | null;
          impressions?: number | null;
          engagements?: number | null;
          peak_viewers?: number | null;
          vod_views?: number | null;
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

export function createBrowserSupabaseClient(): SupabaseClient<Database> | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}

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
  return {
    id: row.id,
    platform: row.platform,
    title: row.title,
    url: row.url,
    creator: row.creator,
    source: row.source,
    discoveredAt: row.discovered_at,
    metrics: {
      followers: row.followers ?? undefined,
      views: row.views ?? undefined,
      impressions: row.impressions ?? undefined,
      engagements: row.engagements ?? undefined,
      peakViewers: row.peak_viewers ?? undefined,
      vodViews: row.vod_views ?? undefined,
    },
  };
}

export function mapAccountRowToItem(row: Database['public']['Tables']['monitored_accounts']['Row']): AccountItem {
  return {
    id: row.id,
    platform: row.platform,
    name: row.name,
    url: row.url,
    status: row.status,
    note: row.note ?? undefined,
  };
}
