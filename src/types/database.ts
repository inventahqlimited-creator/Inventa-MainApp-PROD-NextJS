/**
 * Auto-generate this file by running:
 *   npx supabase gen types typescript --project-id cggtzuthslbvdvuaqadk > src/types/database.ts
 *
 * Regenerate every time you change the database schema.
 * Commit the generated file to git.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      org_members: {
        Row: {
          id: string
          user_id: string
          org_id: string
          role: 'admin' | 'manager' | 'staff' | 'read_only'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          org_id: string
          role?: 'admin' | 'manager' | 'staff' | 'read_only'
          created_at?: string
        }
        Update: {
          role?: 'admin' | 'manager' | 'staff' | 'read_only'
        }
      }
      organisations: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
          is_active: boolean
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
          is_active?: boolean
        }
        Update: {
          name?: string
          slug?: string
          is_active?: boolean
        }
      }
      contacts: {
        Row: {
          id: string
          org_id: string
          name: string
          type: string
          email: string | null
          phone: string | null
          status: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['contacts']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>
      }
      products: {
        Row: {
          id: string
          org_id: string
          name: string
          sku: string
          type: string
          status: string
          sell_price: number
          cost_price: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }
      // Add more tables as you run supabase gen types
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// Convenience type helpers
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
