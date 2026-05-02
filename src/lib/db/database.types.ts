export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      admin_audit_actions: {
        Row: {
          action: Database['public']['Enums']['admin_audit_action'];
          actor_id: string;
          created_at: string;
          id: number;
          reason: string | null;
          target_profile_id: string;
        };
        Insert: {
          action: Database['public']['Enums']['admin_audit_action'];
          actor_id: string;
          created_at?: string;
          id?: number;
          reason?: string | null;
          target_profile_id: string;
        };
        Update: {
          action?: Database['public']['Enums']['admin_audit_action'];
          actor_id?: string;
          created_at?: string;
          id?: number;
          reason?: string | null;
          target_profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'admin_audit_actions_target_profile_id_fkey';
            columns: ['target_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      auth_events: {
        Row: {
          actor_user_id: string | null;
          details: Json;
          id: number;
          ip: unknown;
          kind: Database['public']['Enums']['auth_event_kind'];
          occurred_at: string;
          tenant_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          actor_user_id?: string | null;
          details?: Json;
          id?: number;
          ip?: unknown;
          kind: Database['public']['Enums']['auth_event_kind'];
          occurred_at?: string;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          actor_user_id?: string | null;
          details?: Json;
          id?: number;
          ip?: unknown;
          kind?: Database['public']['Enums']['auth_event_kind'];
          occurred_at?: string;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      auth_failed_attempts: {
        Row: {
          count: number;
          key: string;
          locked_until: string | null;
          updated_at: string;
        };
        Insert: {
          count?: number;
          key: string;
          locked_until?: string | null;
          updated_at?: string;
        };
        Update: {
          count?: number;
          key?: string;
          locked_until?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          assigned_pro_profile_id: string | null;
          bank_details: Json | null;
          company_name: string;
          created_at: string;
          id: string;
          jurisdiction: string | null;
          license_expiry: string | null;
          office_address: Json | null;
          registered_activities: Json;
          shareholders: Json;
          status: Database['public']['Enums']['client_status'];
          tenant_id: string;
          trade_license_no: string | null;
          updated_at: string;
        };
        Insert: {
          assigned_pro_profile_id?: string | null;
          bank_details?: Json | null;
          company_name: string;
          created_at?: string;
          id?: string;
          jurisdiction?: string | null;
          license_expiry?: string | null;
          office_address?: Json | null;
          registered_activities?: Json;
          shareholders?: Json;
          status?: Database['public']['Enums']['client_status'];
          tenant_id: string;
          trade_license_no?: string | null;
          updated_at?: string;
        };
        Update: {
          assigned_pro_profile_id?: string | null;
          bank_details?: Json | null;
          company_name?: string;
          created_at?: string;
          id?: string;
          jurisdiction?: string | null;
          license_expiry?: string | null;
          office_address?: Json | null;
          registered_activities?: Json;
          shareholders?: Json;
          status?: Database['public']['Enums']['client_status'];
          tenant_id?: string;
          trade_license_no?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'clients_assigned_pro_profile_id_fkey';
            columns: ['assigned_pro_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clients_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      customer_profiles: {
        Row: {
          created_at: string;
          linked_client_id: string | null;
          nationality: string | null;
          passport_no_encrypted: string | null;
          profile_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          linked_client_id?: string | null;
          nationality?: string | null;
          passport_no_encrypted?: string | null;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          linked_client_id?: string | null;
          nationality?: string | null;
          passport_no_encrypted?: string | null;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_profiles_linked_client_id_fkey';
            columns: ['linked_client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'customer_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      employees: {
        Row: {
          client_id: string;
          created_at: string;
          eid_expiry: string | null;
          email: string | null;
          emirates_id_encrypted: string | null;
          id: string;
          name: string;
          nationality: string | null;
          passport_no_encrypted: string | null;
          phone: string | null;
          profile_id: string | null;
          status: Database['public']['Enums']['employee_status'];
          tenant_id: string;
          updated_at: string;
          visa_expiry: string | null;
          visa_no_encrypted: string | null;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          eid_expiry?: string | null;
          email?: string | null;
          emirates_id_encrypted?: string | null;
          id?: string;
          name: string;
          nationality?: string | null;
          passport_no_encrypted?: string | null;
          phone?: string | null;
          profile_id?: string | null;
          status?: Database['public']['Enums']['employee_status'];
          tenant_id: string;
          updated_at?: string;
          visa_expiry?: string | null;
          visa_no_encrypted?: string | null;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          eid_expiry?: string | null;
          email?: string | null;
          emirates_id_encrypted?: string | null;
          id?: string;
          name?: string;
          nationality?: string | null;
          passport_no_encrypted?: string | null;
          phone?: string | null;
          profile_id?: string | null;
          status?: Database['public']['Enums']['employee_status'];
          tenant_id?: string;
          updated_at?: string;
          visa_expiry?: string | null;
          visa_no_encrypted?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'employees_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'employees_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'employees_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      invites: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          created_by: string | null;
          email: string;
          expires_at: string;
          id: string;
          role: Database['public']['Enums']['app_role'];
          tenant_id: string | null;
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          email: string;
          expires_at: string;
          id?: string;
          role: Database['public']['Enums']['app_role'];
          tenant_id?: string | null;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          expires_at?: string;
          id?: string;
          role?: Database['public']['Enums']['app_role'];
          tenant_id?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invites_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      pro_profiles: {
        Row: {
          bio: string | null;
          created_at: string;
          credentials_verified: boolean;
          department: string | null;
          designation: string | null;
          license_no_encrypted: string | null;
          profile_id: string;
          service_areas: Json;
          updated_at: string;
          verified_at: string | null;
          verified_by_profile_id: string | null;
        };
        Insert: {
          bio?: string | null;
          created_at?: string;
          credentials_verified?: boolean;
          department?: string | null;
          designation?: string | null;
          license_no_encrypted?: string | null;
          profile_id: string;
          service_areas?: Json;
          updated_at?: string;
          verified_at?: string | null;
          verified_by_profile_id?: string | null;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          credentials_verified?: boolean;
          department?: string | null;
          designation?: string | null;
          license_no_encrypted?: string | null;
          profile_id?: string;
          service_areas?: Json;
          updated_at?: string;
          verified_at?: string | null;
          verified_by_profile_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pro_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_profiles_verified_by_profile_id_fkey';
            columns: ['verified_by_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          consent_accepted_at: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          last_login_at: string | null;
          last_login_ip: unknown;
          locale: string;
          mfa_enrolled_at: string | null;
          phone: string | null;
          policy_version: string | null;
          role: Database['public']['Enums']['app_role'];
          status: Database['public']['Enums']['profile_status'];
          suspension_reason: string | null;
          tenant_id: string | null;
          updated_at: string;
          username: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          consent_accepted_at?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          last_login_at?: string | null;
          last_login_ip?: unknown;
          locale?: string;
          mfa_enrolled_at?: string | null;
          phone?: string | null;
          policy_version?: string | null;
          role: Database['public']['Enums']['app_role'];
          status?: Database['public']['Enums']['profile_status'];
          suspension_reason?: string | null;
          tenant_id?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          consent_accepted_at?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          last_login_at?: string | null;
          last_login_ip?: unknown;
          locale?: string;
          mfa_enrolled_at?: string | null;
          phone?: string | null;
          policy_version?: string | null;
          role?: Database['public']['Enums']['app_role'];
          status?: Database['public']['Enums']['profile_status'];
          suspension_reason?: string | null;
          tenant_id?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      rate_limits: {
        Row: {
          key: string;
          last_refill: string;
          tokens: number;
        };
        Insert: {
          key: string;
          last_refill?: string;
          tokens: number;
        };
        Update: {
          key?: string;
          last_refill?: string;
          tokens?: number;
        };
        Relationships: [];
      };
      tenant_sms_config: {
        Row: {
          created_at: string;
          credentials_encrypted: string;
          enabled: boolean;
          provider: string;
          sender_id: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          credentials_encrypted: string;
          enabled?: boolean;
          provider: string;
          sender_id: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          credentials_encrypted?: string;
          enabled?: boolean;
          provider?: string;
          sender_id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tenant_sms_config_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: true;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      tenant_smtp_config: {
        Row: {
          created_at: string;
          enabled: boolean;
          from_address: string;
          host: string;
          password_encrypted: string;
          port: number;
          tenant_id: string;
          updated_at: string;
          username: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          from_address: string;
          host: string;
          password_encrypted: string;
          port: number;
          tenant_id: string;
          updated_at?: string;
          username: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          from_address?: string;
          host?: string;
          password_encrypted?: string;
          port?: number;
          tenant_id?: string;
          updated_at?: string;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tenant_smtp_config_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: true;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      tenant_whatsapp_config: {
        Row: {
          access_token_encrypted: string;
          business_account_id: string;
          created_at: string;
          enabled: boolean;
          phone_number_id: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          access_token_encrypted: string;
          business_account_id: string;
          created_at?: string;
          enabled?: boolean;
          phone_number_id: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          access_token_encrypted?: string;
          business_account_id?: string;
          created_at?: string;
          enabled?: boolean;
          phone_number_id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tenant_whatsapp_config_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: true;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      tenants: {
        Row: {
          created_at: string;
          email_reply_to: string | null;
          email_sender_name: string | null;
          favicon_url: string | null;
          id: string;
          logo_url: string | null;
          name: string;
          plan: string;
          primary_color: string | null;
          privacy_url: string | null;
          secondary_color: string | null;
          slug: string;
          status: string;
          terms_url: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email_reply_to?: string | null;
          email_sender_name?: string | null;
          favicon_url?: string | null;
          id?: string;
          logo_url?: string | null;
          name: string;
          plan?: string;
          primary_color?: string | null;
          privacy_url?: string | null;
          secondary_color?: string | null;
          slug: string;
          status?: string;
          terms_url?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email_reply_to?: string | null;
          email_sender_name?: string | null;
          favicon_url?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string;
          plan?: string;
          primary_color?: string | null;
          privacy_url?: string | null;
          secondary_color?: string | null;
          slug?: string;
          status?: string;
          terms_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_mfa_recovery_codes: {
        Row: {
          code_hash: string;
          created_at: string;
          id: string;
          used_at: string | null;
          user_id: string;
        };
        Insert: {
          code_hash: string;
          created_at?: string;
          id?: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          code_hash?: string;
          created_at?: string;
          id?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_password_history: {
        Row: {
          created_at: string;
          password_hash: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          password_hash: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          password_hash?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      mandoob_access_token_hook: { Args: { event: Json }; Returns: Json };
      rate_limit_consume: {
        Args: {
          p_capacity: number;
          p_cost?: number;
          p_key: string;
          p_refill_per_sec: number;
        };
        Returns: boolean;
      };
    };
    Enums: {
      admin_audit_action:
        | 'create_admin'
        | 'remove_admin'
        | 'suspend_admin'
        | 'restore_admin'
        | 'change_role'
        | 'change_status'
        | 'reset_mfa';
      app_role: 'super_admin' | 'admin' | 'pro' | 'customer' | 'employee';
      auth_event_kind:
        | 'login_success'
        | 'login_failure'
        | 'logout'
        | 'password_reset_requested'
        | 'password_reset_completed'
        | 'mfa_enrolled'
        | 'mfa_challenge_success'
        | 'mfa_challenge_failure'
        | 'mfa_reset'
        | 'invite_created'
        | 'invite_accepted'
        | 'session_revoked'
        | 'impersonation_started'
        | 'impersonation_ended'
        | 'admin_created'
        | 'admin_user_edited'
        | 'admin_user_role_changed'
        | 'admin_user_status_changed';
      client_status:
        | 'onboarding'
        | 'active'
        | 'renewal_due'
        | 'renewal_overdue'
        | 'suspended'
        | 'churned';
      employee_status: 'active' | 'inactive' | 'terminated';
      profile_status: 'active' | 'invited' | 'disabled' | 'suspended';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      admin_audit_action: [
        'create_admin',
        'remove_admin',
        'suspend_admin',
        'restore_admin',
        'change_role',
        'change_status',
        'reset_mfa',
      ],
      app_role: ['super_admin', 'admin', 'pro', 'customer', 'employee'],
      auth_event_kind: [
        'login_success',
        'login_failure',
        'logout',
        'password_reset_requested',
        'password_reset_completed',
        'mfa_enrolled',
        'mfa_challenge_success',
        'mfa_challenge_failure',
        'mfa_reset',
        'invite_created',
        'invite_accepted',
        'session_revoked',
        'impersonation_started',
        'impersonation_ended',
        'admin_created',
        'admin_user_edited',
        'admin_user_role_changed',
        'admin_user_status_changed',
      ],
      client_status: [
        'onboarding',
        'active',
        'renewal_due',
        'renewal_overdue',
        'suspended',
        'churned',
      ],
      employee_status: ['active', 'inactive', 'terminated'],
      profile_status: ['active', 'invited', 'disabled', 'suspended'],
    },
  },
} as const;
