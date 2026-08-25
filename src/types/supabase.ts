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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      day_report_entries: {
        Row: {
          ai_tools: Json | null
          ai_tools_v2: Json | null
          category: string
          created_at: string | null
          day_report_id: string
          growth_experience: string | null
          hours: number
          id: string
          is_ai_assisted: boolean
          outcome_images: Json | null
          outcome_type: string | null
          outcome_url: string | null
          related_id: string | null
          related_name: string | null
          sort_order: number
          staff_id: string
          title: string
        }
        Insert: {
          ai_tools?: Json | null
          ai_tools_v2?: Json | null
          category: string
          created_at?: string | null
          day_report_id: string
          growth_experience?: string | null
          hours?: number
          id?: string
          is_ai_assisted?: boolean
          outcome_images?: Json | null
          outcome_type?: string | null
          outcome_url?: string | null
          related_id?: string | null
          related_name?: string | null
          sort_order?: number
          staff_id: string
          title?: string
        }
        Update: {
          ai_tools?: Json | null
          ai_tools_v2?: Json | null
          category?: string
          created_at?: string | null
          day_report_id?: string
          growth_experience?: string | null
          hours?: number
          id?: string
          is_ai_assisted?: boolean
          outcome_images?: Json | null
          outcome_type?: string | null
          outcome_url?: string | null
          related_id?: string | null
          related_name?: string | null
          sort_order?: number
          staff_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_report_entries_day_report_id_fkey"
            columns: ["day_report_id"]
            isOneToOne: false
            referencedRelation: "day_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_report_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staffs"
            referencedColumns: ["id"]
          },
        ]
      }
      day_reports: {
        Row: {
          created_at: string | null
          id: string
          is_half_day: boolean
          is_holiday: boolean
          is_leave: boolean
          is_weekend: boolean
          leave_type: string | null
          office_location: string
          ot_hours: number
          report_date: string
          reviewed_at: string | null
          reviewer_id: string | null
          staff_id: string
          status: string
          submitted_at: string | null
          target_hours: number
          total_hours: number
          under_hours_reason: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_half_day?: boolean
          is_holiday?: boolean
          is_leave?: boolean
          is_weekend?: boolean
          leave_type?: string | null
          office_location?: string
          ot_hours?: number
          report_date: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          staff_id: string
          status?: string
          submitted_at?: string | null
          target_hours?: number
          total_hours?: number
          under_hours_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_half_day?: boolean
          is_holiday?: boolean
          is_leave?: boolean
          is_weekend?: boolean
          leave_type?: string | null
          office_location?: string
          ot_hours?: number
          report_date?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          staff_id?: string
          status?: string
          submitted_at?: string | null
          target_hours?: number
          total_hours?: number
          under_hours_reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "day_reports_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "staffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_reports_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staffs"
            referencedColumns: ["id"]
          },
        ]
      }
      login_logs: {
        Row: {
          created_at: string | null
          email: string
          id: string
          ip_address: string | null
          login_method: string
          success: boolean | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          ip_address?: string | null
          login_method?: string
          success?: boolean | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          ip_address?: string | null
          login_method?: string
          success?: boolean | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      staffs: {
        Row: {
          base_location: string | null
          brand_list_id: string | null
          chinese_name: string | null
          company_list_id: string | null
          created_at: string | null
          display_name: string
          entry_date: string | null
          full_name: string | null
          id: string
          otc_staff_sync_id: string | null
          position: string | null
          private_email: string | null
          private_phone: string | null
          profile_pic_url: string | null
          status: string
          synced_at: string | null
          team_name: string | null
          termination_date: string | null
          updated_at: string | null
          user_role: string | null
          work_email: string | null
          work_phone: string | null
        }
        Insert: {
          base_location?: string | null
          brand_list_id?: string | null
          chinese_name?: string | null
          company_list_id?: string | null
          created_at?: string | null
          display_name?: string
          entry_date?: string | null
          full_name?: string | null
          id?: string
          otc_staff_sync_id?: string | null
          position?: string | null
          private_email?: string | null
          private_phone?: string | null
          profile_pic_url?: string | null
          status?: string
          synced_at?: string | null
          team_name?: string | null
          termination_date?: string | null
          updated_at?: string | null
          user_role?: string | null
          work_email?: string | null
          work_phone?: string | null
        }
        Update: {
          base_location?: string | null
          brand_list_id?: string | null
          chinese_name?: string | null
          company_list_id?: string | null
          created_at?: string | null
          display_name?: string
          entry_date?: string | null
          full_name?: string | null
          id?: string
          otc_staff_sync_id?: string | null
          position?: string | null
          private_email?: string | null
          private_phone?: string | null
          profile_pic_url?: string | null
          status?: string
          synced_at?: string | null
          team_name?: string | null
          termination_date?: string | null
          updated_at?: string | null
          user_role?: string | null
          work_email?: string | null
          work_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staffs_brand_list_id_fkey"
            columns: ["brand_list_id"]
            isOneToOne: false
            referencedRelation: "brand_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffs_company_list_id_fkey"
            columns: ["company_list_id"]
            isOneToOne: false
            referencedRelation: "company_list"
            referencedColumns: ["uuid"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          classification: string
          created_at: string | null
          department: string | null
          display_name: string | null
          email: string | null
          google_email: string | null
          id: string
          office: string | null
          role_tag: string | null
          staff_id: string
          system_status: string
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          classification?: string
          created_at?: string | null
          department?: string | null
          display_name?: string | null
          email?: string | null
          google_email?: string | null
          id?: string
          office?: string | null
          role_tag?: string | null
          staff_id: string
          system_status?: string
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          classification?: string
          created_at?: string | null
          department?: string | null
          display_name?: string | null
          email?: string | null
          google_email?: string | null
          id?: string
          office?: string | null
          role_tag?: string | null
          staff_id?: string
          system_status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staffs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      resolve_users_for_auth: {
        Args: Record<PropertyKey, never>
        Returns: {
          auth_user_id: string | null
          classification: string
          created_at: string | null
          department: string | null
          display_name: string | null
          email: string | null
          google_email: string | null
          id: string
          office: string | null
          role_tag: string | null
          staff_id: string
          system_status: string
          updated_at: string | null
        }
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
