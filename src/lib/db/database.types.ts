export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admin_audit_actions: {
        Row: {
          action: string;
          actor_id: string;
          created_at: string;
          id: number;
          reason: string | null;
          target_profile_id: string;
        };
        Insert: {
          action: string;
          actor_id: string;
          created_at?: string;
          id?: number;
          reason?: string | null;
          target_profile_id: string;
        };
        Update: {
          action?: string;
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
      blog_media: {
        Row: {
          alt_text: string | null;
          caption: string | null;
          created_at: string;
          height: number | null;
          id: string;
          mime_type: string;
          original_name: string;
          public_url: string;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          updated_at: string;
          uploaded_by: string | null;
          width: number | null;
        };
        Insert: {
          alt_text?: string | null;
          caption?: string | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          mime_type: string;
          original_name: string;
          public_url: string;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          updated_at?: string;
          uploaded_by?: string | null;
          width?: number | null;
        };
        Update: {
          alt_text?: string | null;
          caption?: string | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          mime_type?: string;
          original_name?: string;
          public_url?: string;
          sha256?: string;
          size_bytes?: number;
          storage_path?: string;
          updated_at?: string;
          uploaded_by?: string | null;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'blog_media_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      blog_post_gallery_items: {
        Row: {
          alt_text: string | null;
          caption: string | null;
          created_at: string;
          media_id: string;
          post_id: string;
          sort_order: number;
        };
        Insert: {
          alt_text?: string | null;
          caption?: string | null;
          created_at?: string;
          media_id: string;
          post_id: string;
          sort_order?: number;
        };
        Update: {
          alt_text?: string | null;
          caption?: string | null;
          created_at?: string;
          media_id?: string;
          post_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'blog_post_gallery_items_media_id_fkey';
            columns: ['media_id'];
            isOneToOne: false;
            referencedRelation: 'blog_media';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blog_post_gallery_items_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'blog_posts';
            referencedColumns: ['id'];
          },
        ];
      };
      blog_post_revisions: {
        Row: {
          content_html: string;
          content_json: Json;
          created_at: string;
          created_by: string | null;
          excerpt: string | null;
          id: string;
          post_id: string;
          revision_note: string | null;
          status: string;
          title: string;
        };
        Insert: {
          content_html?: string;
          content_json?: Json;
          created_at?: string;
          created_by?: string | null;
          excerpt?: string | null;
          id?: string;
          post_id: string;
          revision_note?: string | null;
          status: string;
          title: string;
        };
        Update: {
          content_html?: string;
          content_json?: Json;
          created_at?: string;
          created_by?: string | null;
          excerpt?: string | null;
          id?: string;
          post_id?: string;
          revision_note?: string | null;
          status?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blog_post_revisions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blog_post_revisions_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'blog_posts';
            referencedColumns: ['id'];
          },
        ];
      };
      blog_post_terms: {
        Row: {
          created_at: string;
          post_id: string;
          term_id: string;
        };
        Insert: {
          created_at?: string;
          post_id: string;
          term_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          term_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blog_post_terms_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'blog_posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blog_post_terms_term_id_fkey';
            columns: ['term_id'];
            isOneToOne: false;
            referencedRelation: 'blog_terms';
            referencedColumns: ['id'];
          },
        ];
      };
      blog_posts: {
        Row: {
          author_id: string | null;
          canonical_url: string | null;
          content_html: string;
          content_json: Json;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          excerpt: string | null;
          featured_media_id: string | null;
          id: string;
          meta_description: string | null;
          meta_title: string | null;
          noindex: boolean;
          published_at: string | null;
          scheduled_for: string | null;
          slug: string;
          status: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          author_id?: string | null;
          canonical_url?: string | null;
          content_html?: string;
          content_json?: Json;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          excerpt?: string | null;
          featured_media_id?: string | null;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          noindex?: boolean;
          published_at?: string | null;
          scheduled_for?: string | null;
          slug: string;
          status?: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          author_id?: string | null;
          canonical_url?: string | null;
          content_html?: string;
          content_json?: Json;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          excerpt?: string | null;
          featured_media_id?: string | null;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          noindex?: boolean;
          published_at?: string | null;
          scheduled_for?: string | null;
          slug?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'blog_posts_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blog_posts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blog_posts_featured_media_id_fkey';
            columns: ['featured_media_id'];
            isOneToOne: false;
            referencedRelation: 'blog_media';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blog_posts_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      blog_terms: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          kind: string;
          name: string;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          kind: string;
          name: string;
          parent_id?: string | null;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          kind?: string;
          name?: string;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blog_terms_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blog_terms_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'blog_terms';
            referencedColumns: ['id'];
          },
        ];
      };
      bulk_import_jobs: {
        Row: {
          company_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          dedupe_key: string | null;
          error_rows: number | null;
          errors: Json | null;
          id: string;
          kind: Database['public']['Enums']['bulk_import_kind'];
          processed_rows: number | null;
          started_at: string | null;
          status: Database['public']['Enums']['bulk_import_status'];
          storage_path: string;
          tenant_id: string;
          total_rows: number | null;
          updated_at: string;
        };
        Insert: {
          company_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          dedupe_key?: string | null;
          error_rows?: number | null;
          errors?: Json | null;
          id?: string;
          kind: Database['public']['Enums']['bulk_import_kind'];
          processed_rows?: number | null;
          started_at?: string | null;
          status?: Database['public']['Enums']['bulk_import_status'];
          storage_path: string;
          tenant_id: string;
          total_rows?: number | null;
          updated_at?: string;
        };
        Update: {
          company_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          dedupe_key?: string | null;
          error_rows?: number | null;
          errors?: Json | null;
          id?: string;
          kind?: Database['public']['Enums']['bulk_import_kind'];
          processed_rows?: number | null;
          started_at?: string | null;
          status?: Database['public']['Enums']['bulk_import_status'];
          storage_path?: string;
          tenant_id?: string;
          total_rows?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bulk_import_jobs_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bulk_import_jobs_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'bulk_import_jobs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bulk_import_jobs_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      cms_pages: {
        Row: {
          background_image_media_id: string | null;
          canonical_url: string | null;
          content_html: string;
          content_json: Json;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          excerpt: string | null;
          hero_settings: Json;
          id: string;
          meta_description: string | null;
          meta_title: string | null;
          noindex: boolean;
          published_at: string | null;
          scheduled_for: string | null;
          schema_markup: Json;
          script_body_end: string | null;
          script_body_start: string | null;
          script_head: string | null;
          slug: string;
          status: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          background_image_media_id?: string | null;
          canonical_url?: string | null;
          content_html?: string;
          content_json?: Json;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          excerpt?: string | null;
          hero_settings?: Json;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          noindex?: boolean;
          published_at?: string | null;
          scheduled_for?: string | null;
          schema_markup?: Json;
          script_body_end?: string | null;
          script_body_start?: string | null;
          script_head?: string | null;
          slug: string;
          status?: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          background_image_media_id?: string | null;
          canonical_url?: string | null;
          content_html?: string;
          content_json?: Json;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          excerpt?: string | null;
          hero_settings?: Json;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          noindex?: boolean;
          published_at?: string | null;
          scheduled_for?: string | null;
          schema_markup?: Json;
          script_body_end?: string | null;
          script_body_start?: string | null;
          script_head?: string | null;
          slug?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cms_pages_background_image_media_id_fkey';
            columns: ['background_image_media_id'];
            isOneToOne: false;
            referencedRelation: 'blog_media';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cms_pages_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cms_pages_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      company_bank_details: {
        Row: {
          account_holder_name: string;
          account_number_encrypted: string | null;
          account_number_hash: string | null;
          account_number_last4: string | null;
          bank_name: string;
          branch_name: string | null;
          company_id: string;
          created_at: string;
          currency_code: string;
          iban_encrypted: string | null;
          iban_hash: string | null;
          iban_last4: string | null;
          swift_bic: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          account_holder_name: string;
          account_number_encrypted?: string | null;
          account_number_hash?: string | null;
          account_number_last4?: string | null;
          bank_name: string;
          branch_name?: string | null;
          company_id: string;
          created_at?: string;
          currency_code?: string;
          iban_encrypted?: string | null;
          iban_hash?: string | null;
          iban_last4?: string | null;
          swift_bic?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          account_holder_name?: string;
          account_number_encrypted?: string | null;
          account_number_hash?: string | null;
          account_number_last4?: string | null;
          bank_name?: string;
          branch_name?: string | null;
          company_id?: string;
          created_at?: string;
          currency_code?: string;
          iban_encrypted?: string | null;
          iban_hash?: string | null;
          iban_last4?: string | null;
          swift_bic?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'company_bank_details_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: true;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'company_bank_details_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'company_bank_details_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      company_office_details: {
        Row: {
          address_line_1: string | null;
          address_line_2: string | null;
          area: string | null;
          city: string | null;
          company_id: string;
          country_code: string;
          created_at: string;
          emirate: string | null;
          lease_expiry: string | null;
          lease_reference: string | null;
          office_type: Database['public']['Enums']['company_office_type'];
          postal_code: string | null;
          provider_name: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          address_line_1?: string | null;
          address_line_2?: string | null;
          area?: string | null;
          city?: string | null;
          company_id: string;
          country_code?: string;
          created_at?: string;
          emirate?: string | null;
          lease_expiry?: string | null;
          lease_reference?: string | null;
          office_type: Database['public']['Enums']['company_office_type'];
          postal_code?: string | null;
          provider_name?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          address_line_1?: string | null;
          address_line_2?: string | null;
          area?: string | null;
          city?: string | null;
          company_id?: string;
          country_code?: string;
          created_at?: string;
          emirate?: string | null;
          lease_expiry?: string | null;
          lease_reference?: string | null;
          office_type?: Database['public']['Enums']['company_office_type'];
          postal_code?: string | null;
          provider_name?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'company_office_details_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: true;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'company_office_details_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'company_office_details_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      company_onboarding_operations: {
        Row: {
          committed_version: number;
          company_id: string;
          created_at: string;
          operation_id: string;
          operation_kind: string;
          payload_hash: string;
          result: Json;
          tenant_id: string;
        };
        Insert: {
          committed_version: number;
          company_id: string;
          created_at?: string;
          operation_id: string;
          operation_kind: string;
          payload_hash: string;
          result: Json;
          tenant_id: string;
        };
        Update: {
          committed_version?: number;
          company_id?: string;
          created_at?: string;
          operation_id?: string;
          operation_kind?: string;
          payload_hash?: string;
          result?: Json;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'company_onboarding_operations_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'company_onboarding_operations_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'company_onboarding_operations_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      company_onboarding_sections: {
        Row: {
          company_id: string;
          completed_at: string | null;
          completed_by_profile_id: string | null;
          created_at: string;
          section_key: Database['public']['Enums']['company_onboarding_section_key'];
          status: Database['public']['Enums']['company_onboarding_section_status'];
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          completed_at?: string | null;
          completed_by_profile_id?: string | null;
          created_at?: string;
          section_key: Database['public']['Enums']['company_onboarding_section_key'];
          status?: Database['public']['Enums']['company_onboarding_section_status'];
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          completed_at?: string | null;
          completed_by_profile_id?: string | null;
          created_at?: string;
          section_key?: Database['public']['Enums']['company_onboarding_section_key'];
          status?: Database['public']['Enums']['company_onboarding_section_status'];
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'company_onboarding_sections_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'company_onboarding_sections_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'company_onboarding_sections_completed_by_profile_id_fkey';
            columns: ['completed_by_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'company_onboarding_sections_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      company_profiles: {
        Row: {
          activated_at: string | null;
          activated_by_profile_id: string | null;
          company_name: string;
          created_at: string;
          display_name: string | null;
          establishment_card_expiry: string | null;
          establishment_card_no_encrypted: string | null;
          establishment_card_no_hash: string | null;
          establishment_card_no_last4: string | null;
          id: string;
          jurisdiction_type: Database['public']['Enums']['company_jurisdiction_type'] | null;
          legal_structure: string | null;
          license_expiry: string | null;
          licensing_authority: string | null;
          onboarding_status: Database['public']['Enums']['company_onboarding_status'];
          onboarding_version: number;
          status: Database['public']['Enums']['company_status'];
          tenant_id: string;
          trade_license_no: string | null;
          updated_at: string;
        };
        Insert: {
          activated_at?: string | null;
          activated_by_profile_id?: string | null;
          company_name: string;
          created_at?: string;
          display_name?: string | null;
          establishment_card_expiry?: string | null;
          establishment_card_no_encrypted?: string | null;
          establishment_card_no_hash?: string | null;
          establishment_card_no_last4?: string | null;
          id?: string;
          jurisdiction_type?: Database['public']['Enums']['company_jurisdiction_type'] | null;
          legal_structure?: string | null;
          license_expiry?: string | null;
          licensing_authority?: string | null;
          onboarding_status?: Database['public']['Enums']['company_onboarding_status'];
          onboarding_version?: number;
          status?: Database['public']['Enums']['company_status'];
          tenant_id: string;
          trade_license_no?: string | null;
          updated_at?: string;
        };
        Update: {
          activated_at?: string | null;
          activated_by_profile_id?: string | null;
          company_name?: string;
          created_at?: string;
          display_name?: string | null;
          establishment_card_expiry?: string | null;
          establishment_card_no_encrypted?: string | null;
          establishment_card_no_hash?: string | null;
          establishment_card_no_last4?: string | null;
          id?: string;
          jurisdiction_type?: Database['public']['Enums']['company_jurisdiction_type'] | null;
          legal_structure?: string | null;
          license_expiry?: string | null;
          licensing_authority?: string | null;
          onboarding_status?: Database['public']['Enums']['company_onboarding_status'];
          onboarding_version?: number;
          status?: Database['public']['Enums']['company_status'];
          tenant_id?: string;
          trade_license_no?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'company_profiles_activated_by_profile_id_fkey';
            columns: ['activated_by_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'company_profiles_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: true;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      company_registered_activities: {
        Row: {
          activity_code: string;
          activity_name: string;
          authority_name: string;
          company_id: string;
          created_at: string;
          id: string;
          is_primary: boolean;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          activity_code: string;
          activity_name: string;
          authority_name: string;
          company_id: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          sort_order: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          activity_code?: string;
          activity_name?: string;
          authority_name?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'company_registered_activities_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'company_registered_activities_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'company_registered_activities_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      company_shareholders: {
        Row: {
          company_id: string;
          country_of_incorporation: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          kind: Database['public']['Enums']['company_shareholder_kind'];
          legal_name: string | null;
          nationality_code: string | null;
          ownership_percent: number;
          passport_no_encrypted: string | null;
          passport_no_hash: string | null;
          passport_no_last4: string | null;
          registration_no_encrypted: string | null;
          registration_no_hash: string | null;
          registration_no_last4: string | null;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          country_of_incorporation?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          kind: Database['public']['Enums']['company_shareholder_kind'];
          legal_name?: string | null;
          nationality_code?: string | null;
          ownership_percent: number;
          passport_no_encrypted?: string | null;
          passport_no_hash?: string | null;
          passport_no_last4?: string | null;
          registration_no_encrypted?: string | null;
          registration_no_hash?: string | null;
          registration_no_last4?: string | null;
          sort_order: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          country_of_incorporation?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['company_shareholder_kind'];
          legal_name?: string | null;
          nationality_code?: string | null;
          ownership_percent?: number;
          passport_no_encrypted?: string | null;
          passport_no_hash?: string | null;
          passport_no_last4?: string | null;
          registration_no_encrypted?: string | null;
          registration_no_hash?: string | null;
          registration_no_last4?: string | null;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'company_shareholders_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'company_shareholders_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'company_shareholders_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      consent_opt_outs: {
        Row: {
          channel: string;
          created_at: string;
          id: string;
          last_inbound_message_id: string | null;
          opted_in_at: string | null;
          opted_out_at: string;
          phone_e164: string;
          source: string;
          updated_at: string;
        };
        Insert: {
          channel: string;
          created_at?: string;
          id?: string;
          last_inbound_message_id?: string | null;
          opted_in_at?: string | null;
          opted_out_at?: string;
          phone_e164: string;
          source?: string;
          updated_at?: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          id?: string;
          last_inbound_message_id?: string | null;
          opted_in_at?: string | null;
          opted_out_at?: string;
          phone_e164?: string;
          source?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cost_data: {
        Row: {
          active: boolean;
          activity_key: string | null;
          amount_minor: number;
          authority: string;
          created_at: string;
          currency: string;
          emirate: string | null;
          estimate_grade: boolean;
          fee_type: string;
          id: string;
          jurisdiction: string;
          label: string;
          max_shareholders: number;
          max_visas: number;
          min_shareholders: number;
          min_visas: number;
          recurrence: string;
          required_document_keys: string[];
          timeline_max_days: number;
          timeline_min_days: number;
          updated_at: string;
          valid_from: string;
          valid_to: string | null;
        };
        Insert: {
          active?: boolean;
          activity_key?: string | null;
          amount_minor: number;
          authority: string;
          created_at?: string;
          currency?: string;
          emirate?: string | null;
          estimate_grade?: boolean;
          fee_type: string;
          id?: string;
          jurisdiction: string;
          label: string;
          max_shareholders?: number;
          max_visas?: number;
          min_shareholders?: number;
          min_visas?: number;
          recurrence: string;
          required_document_keys?: string[];
          timeline_max_days?: number;
          timeline_min_days?: number;
          updated_at?: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Update: {
          active?: boolean;
          activity_key?: string | null;
          amount_minor?: number;
          authority?: string;
          created_at?: string;
          currency?: string;
          emirate?: string | null;
          estimate_grade?: boolean;
          fee_type?: string;
          id?: string;
          jurisdiction?: string;
          label?: string;
          max_shareholders?: number;
          max_visas?: number;
          min_shareholders?: number;
          min_visas?: number;
          recurrence?: string;
          required_document_keys?: string[];
          timeline_max_days?: number;
          timeline_min_days?: number;
          updated_at?: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Relationships: [];
      };
      customer_profiles: {
        Row: {
          created_at: string;
          linked_company_id: string | null;
          nationality: string | null;
          passport_no_encrypted: string | null;
          profile_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          linked_company_id?: string | null;
          nationality?: string | null;
          passport_no_encrypted?: string | null;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          linked_company_id?: string | null;
          nationality?: string | null;
          passport_no_encrypted?: string | null;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_profiles_linked_company_id_fkey';
            columns: ['linked_company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
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
      document_requests: {
        Row: {
          company_id: string;
          created_at: string;
          doc_type: string;
          due_at: string | null;
          employee_id: string | null;
          id: string;
          label: string;
          notes: string | null;
          requested_by: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          doc_type: string;
          due_at?: string | null;
          employee_id?: string | null;
          id?: string;
          label: string;
          notes?: string | null;
          requested_by?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          doc_type?: string;
          due_at?: string | null;
          employee_id?: string | null;
          id?: string;
          label?: string;
          notes?: string | null;
          requested_by?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_requests_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_requests_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'document_requests_employee_id_fkey';
            columns: ['employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_requests_employee_ownership_fk';
            columns: ['tenant_id', 'company_id', 'employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'document_requests_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_requests_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      document_versions: {
        Row: {
          created_at: string;
          document_id: string;
          id: string;
          mime_type: string;
          review_note: string | null;
          review_status: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          tenant_id: string;
          uploaded_by: string | null;
        };
        Insert: {
          created_at?: string;
          document_id: string;
          id?: string;
          mime_type: string;
          review_note?: string | null;
          review_status?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          tenant_id: string;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          id?: string;
          mime_type?: string;
          review_note?: string | null;
          review_status?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          sha256?: string;
          size_bytes?: number;
          storage_path?: string;
          tenant_id?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'document_versions_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_versions_document_tenant_fk';
            columns: ['tenant_id', 'document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'document_versions_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_versions_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      documents: {
        Row: {
          company_id: string;
          created_at: string;
          current_version_id: string | null;
          doc_type: string;
          employee_id: string | null;
          expires_on: string | null;
          id: string;
          label: string | null;
          request_id: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          current_version_id?: string | null;
          doc_type: string;
          employee_id?: string | null;
          expires_on?: string | null;
          id?: string;
          label?: string | null;
          request_id?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          current_version_id?: string | null;
          doc_type?: string;
          employee_id?: string | null;
          expires_on?: string | null;
          id?: string;
          label?: string | null;
          request_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'documents_current_version_fk';
            columns: ['current_version_id'];
            isOneToOne: false;
            referencedRelation: 'document_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_current_version_ownership_fk';
            columns: ['tenant_id', 'id', 'current_version_id'];
            isOneToOne: false;
            referencedRelation: 'document_versions';
            referencedColumns: ['tenant_id', 'document_id', 'id'];
          },
          {
            foreignKeyName: 'documents_employee_id_fkey';
            columns: ['employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_employee_ownership_fk';
            columns: ['tenant_id', 'company_id', 'employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'documents_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'document_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_request_ownership_fk';
            columns: ['tenant_id', 'company_id', 'request_id'];
            isOneToOne: false;
            referencedRelation: 'document_requests';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'documents_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      employee_notification_preferences: {
        Row: {
          created_at: string;
          employee_id: string;
          id: string;
          profile_id: string;
          renewal_reminders_enabled: boolean;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          employee_id: string;
          id?: string;
          profile_id: string;
          renewal_reminders_enabled?: boolean;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          employee_id?: string;
          id?: string;
          profile_id?: string;
          renewal_reminders_enabled?: boolean;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'employee_notification_preferences_employee_id_fkey';
            columns: ['employee_id'];
            isOneToOne: true;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'employee_notification_preferences_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'employee_notification_preferences_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      employees: {
        Row: {
          company_id: string;
          created_at: string;
          eid_expiry: string | null;
          email: string | null;
          emirates_id_encrypted: string | null;
          id: string;
          name: string;
          nationality: string | null;
          passport_no_encrypted: string | null;
          passport_no_hash: string | null;
          phone: string | null;
          profile_id: string | null;
          status: Database['public']['Enums']['employee_status'];
          tenant_id: string;
          updated_at: string;
          visa_expiry: string | null;
          visa_no_encrypted: string | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          eid_expiry?: string | null;
          email?: string | null;
          emirates_id_encrypted?: string | null;
          id?: string;
          name: string;
          nationality?: string | null;
          passport_no_encrypted?: string | null;
          passport_no_hash?: string | null;
          phone?: string | null;
          profile_id?: string | null;
          status?: Database['public']['Enums']['employee_status'];
          tenant_id: string;
          updated_at?: string;
          visa_expiry?: string | null;
          visa_no_encrypted?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          eid_expiry?: string | null;
          email?: string | null;
          emirates_id_encrypted?: string | null;
          id?: string;
          name?: string;
          nationality?: string | null;
          passport_no_encrypted?: string | null;
          passport_no_hash?: string | null;
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
            foreignKeyName: 'employees_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'employees_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'employees_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'employees_profile_tenant_fk';
            columns: ['tenant_id', 'profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['tenant_id', 'id'];
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
      erasure_cleanup_jobs: {
        Row: {
          anonymization_diff: Json;
          attempts: number;
          auth_anonymized_at: string | null;
          company_id: string;
          completion_notification_queued_at: string | null;
          created_at: string;
          document_ids: string[];
          last_error: string | null;
          request_id: string;
          storage_deleted_at: string | null;
          storage_paths: string[];
          subject_kind: Database['public']['Enums']['erasure_subject_kind'];
          subject_user_id: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          anonymization_diff?: Json;
          attempts?: number;
          auth_anonymized_at?: string | null;
          company_id: string;
          completion_notification_queued_at?: string | null;
          created_at?: string;
          document_ids?: string[];
          last_error?: string | null;
          request_id: string;
          storage_deleted_at?: string | null;
          storage_paths?: string[];
          subject_kind: Database['public']['Enums']['erasure_subject_kind'];
          subject_user_id: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          anonymization_diff?: Json;
          attempts?: number;
          auth_anonymized_at?: string | null;
          company_id?: string;
          completion_notification_queued_at?: string | null;
          created_at?: string;
          document_ids?: string[];
          last_error?: string | null;
          request_id?: string;
          storage_deleted_at?: string | null;
          storage_paths?: string[];
          subject_kind?: Database['public']['Enums']['erasure_subject_kind'];
          subject_user_id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'erasure_cleanup_jobs_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'erasure_cleanup_jobs_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: true;
            referencedRelation: 'erasure_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'erasure_cleanup_jobs_subject_user_id_fkey';
            columns: ['subject_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'erasure_cleanup_jobs_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      erasure_requests: {
        Row: {
          anonymization_diff: Json | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          reason: string | null;
          recovery_email: string;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database['public']['Enums']['erasure_request_status'];
          subject_kind: Database['public']['Enums']['erasure_subject_kind'];
          subject_tenant_id: string;
          subject_user_id: string;
          submitted_at: string;
          updated_at: string;
          verification_sent_at: string | null;
          verification_token_hash: string | null;
          verified_at: string | null;
        };
        Insert: {
          anonymization_diff?: Json | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          reason?: string | null;
          recovery_email: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['erasure_request_status'];
          subject_kind: Database['public']['Enums']['erasure_subject_kind'];
          subject_tenant_id: string;
          subject_user_id: string;
          submitted_at?: string;
          updated_at?: string;
          verification_sent_at?: string | null;
          verification_token_hash?: string | null;
          verified_at?: string | null;
        };
        Update: {
          anonymization_diff?: Json | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          reason?: string | null;
          recovery_email?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['erasure_request_status'];
          subject_kind?: Database['public']['Enums']['erasure_subject_kind'];
          subject_tenant_id?: string;
          subject_user_id?: string;
          submitted_at?: string;
          updated_at?: string;
          verification_sent_at?: string | null;
          verification_token_hash?: string | null;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'erasure_requests_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'erasure_requests_subject_tenant_id_fkey';
            columns: ['subject_tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'erasure_requests_subject_user_id_fkey';
            columns: ['subject_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
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
      invoices: {
        Row: {
          amount_minor: number;
          company_id: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_profile_id: string | null;
          due_at: string | null;
          id: string;
          label: string;
          linked_entity_id: string | null;
          linked_entity_type: string | null;
          paid_at: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          void_reason: string | null;
        };
        Insert: {
          amount_minor: number;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_profile_id?: string | null;
          due_at?: string | null;
          id?: string;
          label: string;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          paid_at?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          void_reason?: string | null;
        };
        Update: {
          amount_minor?: number;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_profile_id?: string | null;
          due_at?: string | null;
          id?: string;
          label?: string;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          paid_at?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          void_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'invoices_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_customer_company_fk';
            columns: ['company_id', 'customer_profile_id'];
            isOneToOne: false;
            referencedRelation: 'customer_profiles';
            referencedColumns: ['linked_company_id', 'profile_id'];
          },
          {
            foreignKeyName: 'invoices_customer_profile_id_fkey';
            columns: ['customer_profile_id'];
            isOneToOne: false;
            referencedRelation: 'customer_profiles';
            referencedColumns: ['profile_id'];
          },
          {
            foreignKeyName: 'invoices_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      lead_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          event_type: string;
          from_value: string | null;
          id: string;
          lead_id: string;
          metadata: Json;
          note: string | null;
          tenant_id: string | null;
          to_value: string | null;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          event_type: string;
          from_value?: string | null;
          id?: string;
          lead_id: string;
          metadata?: Json;
          note?: string | null;
          tenant_id?: string | null;
          to_value?: string | null;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          event_type?: string;
          from_value?: string | null;
          id?: string;
          lead_id?: string;
          metadata?: Json;
          note?: string | null;
          tenant_id?: string | null;
          to_value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'lead_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lead_events_lead_id_fkey';
            columns: ['lead_id'];
            isOneToOne: false;
            referencedRelation: 'leads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lead_events_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      leads: {
        Row: {
          assigned_team_member_id: string | null;
          converted_company_id: string | null;
          created_at: string;
          email: string | null;
          estimate_data: Json;
          form_data: Json;
          id: string;
          name: string;
          phone: string | null;
          routing_reason: string;
          score: number;
          source: string;
          stage: string;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          assigned_team_member_id?: string | null;
          converted_company_id?: string | null;
          created_at?: string;
          email?: string | null;
          estimate_data?: Json;
          form_data?: Json;
          id?: string;
          name: string;
          phone?: string | null;
          routing_reason: string;
          score?: number;
          source?: string;
          stage?: string;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          assigned_team_member_id?: string | null;
          converted_company_id?: string | null;
          created_at?: string;
          email?: string | null;
          estimate_data?: Json;
          form_data?: Json;
          id?: string;
          name?: string;
          phone?: string | null;
          routing_reason?: string;
          score?: number;
          source?: string;
          stage?: string;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'leads_assigned_team_member_id_fkey';
            columns: ['assigned_team_member_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leads_converted_company_id_fkey';
            columns: ['converted_company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leads_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      meeting_ai_summaries: {
        Row: {
          action_items: Json;
          attempts: number;
          completed_at: string | null;
          created_at: string;
          customer_visible: boolean;
          decisions: Json;
          error: string | null;
          error_code: string | null;
          id: string;
          language: string | null;
          meeting_id: string;
          model: string | null;
          provider: string | null;
          risks_or_followups: Json;
          status: string;
          summary_text: string | null;
          tenant_id: string;
          transcript_text: string | null;
          updated_at: string;
        };
        Insert: {
          action_items?: Json;
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          customer_visible?: boolean;
          decisions?: Json;
          error?: string | null;
          error_code?: string | null;
          id?: string;
          language?: string | null;
          meeting_id: string;
          model?: string | null;
          provider?: string | null;
          risks_or_followups?: Json;
          status?: string;
          summary_text?: string | null;
          tenant_id: string;
          transcript_text?: string | null;
          updated_at?: string;
        };
        Update: {
          action_items?: Json;
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          customer_visible?: boolean;
          decisions?: Json;
          error?: string | null;
          error_code?: string | null;
          id?: string;
          language?: string | null;
          meeting_id?: string;
          model?: string | null;
          provider?: string | null;
          risks_or_followups?: Json;
          status?: string;
          summary_text?: string | null;
          tenant_id?: string;
          transcript_text?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meeting_ai_summaries_meeting_id_fkey';
            columns: ['meeting_id'];
            isOneToOne: true;
            referencedRelation: 'meetings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meeting_ai_summaries_meeting_tenant_fk';
            columns: ['tenant_id', 'meeting_id'];
            isOneToOne: true;
            referencedRelation: 'meetings';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'meeting_ai_summaries_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      meeting_slots: {
        Row: {
          created_at: string;
          created_by: string | null;
          ends_at: string;
          id: string;
          starts_at: string;
          status: Database['public']['Enums']['meeting_slot_status'];
          tenant_id: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          ends_at: string;
          id?: string;
          starts_at: string;
          status?: Database['public']['Enums']['meeting_slot_status'];
          tenant_id: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          ends_at?: string;
          id?: string;
          starts_at?: string;
          status?: Database['public']['Enums']['meeting_slot_status'];
          tenant_id?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meeting_slots_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meeting_slots_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      meetings: {
        Row: {
          company_id: string | null;
          consent_notice_shown_at: string | null;
          created_at: string;
          created_by: string | null;
          customer_profile_id: string | null;
          duration_minutes: number;
          id: string;
          lead_id: string | null;
          meeting_url: string | null;
          notes: string | null;
          provider: string;
          provider_event_id: string | null;
          provider_room_name: string | null;
          recording_ready_at: string | null;
          recording_storage_path: string | null;
          recording_url: string | null;
          scheduled_at: string;
          status: Database['public']['Enums']['meeting_status'];
          tenant_id: string;
          timezone: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          company_id?: string | null;
          consent_notice_shown_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_profile_id?: string | null;
          duration_minutes?: number;
          id?: string;
          lead_id?: string | null;
          meeting_url?: string | null;
          notes?: string | null;
          provider?: string;
          provider_event_id?: string | null;
          provider_room_name?: string | null;
          recording_ready_at?: string | null;
          recording_storage_path?: string | null;
          recording_url?: string | null;
          scheduled_at: string;
          status?: Database['public']['Enums']['meeting_status'];
          tenant_id: string;
          timezone?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string | null;
          consent_notice_shown_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_profile_id?: string | null;
          duration_minutes?: number;
          id?: string;
          lead_id?: string | null;
          meeting_url?: string | null;
          notes?: string | null;
          provider?: string;
          provider_event_id?: string | null;
          provider_room_name?: string | null;
          recording_ready_at?: string | null;
          recording_storage_path?: string | null;
          recording_url?: string | null;
          scheduled_at?: string;
          status?: Database['public']['Enums']['meeting_status'];
          tenant_id?: string;
          timezone?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meetings_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meetings_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'meetings_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meetings_customer_company_fk';
            columns: ['company_id', 'customer_profile_id'];
            isOneToOne: false;
            referencedRelation: 'customer_profiles';
            referencedColumns: ['linked_company_id', 'profile_id'];
          },
          {
            foreignKeyName: 'meetings_customer_profile_id_fkey';
            columns: ['customer_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meetings_lead_id_fkey';
            columns: ['lead_id'];
            isOneToOne: false;
            referencedRelation: 'leads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meetings_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      outbound_emails: {
        Row: {
          attempts: number;
          body_html: string;
          body_text: string | null;
          created_at: string;
          from_address: string;
          id: number;
          last_error: string | null;
          linked_entity_id: string | null;
          linked_entity_type: string | null;
          provider_id: string | null;
          reply_to: string | null;
          scheduled_for: string;
          sent_at: string | null;
          status: string;
          subject: string;
          template_id: string;
          tenant_id: string | null;
          to_address: string;
        };
        Insert: {
          attempts?: number;
          body_html: string;
          body_text?: string | null;
          created_at?: string;
          from_address: string;
          id?: number;
          last_error?: string | null;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          provider_id?: string | null;
          reply_to?: string | null;
          scheduled_for?: string;
          sent_at?: string | null;
          status: string;
          subject: string;
          template_id: string;
          tenant_id?: string | null;
          to_address: string;
        };
        Update: {
          attempts?: number;
          body_html?: string;
          body_text?: string | null;
          created_at?: string;
          from_address?: string;
          id?: number;
          last_error?: string | null;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          provider_id?: string | null;
          reply_to?: string | null;
          scheduled_for?: string;
          sent_at?: string | null;
          status?: string;
          subject?: string;
          template_id?: string;
          tenant_id?: string | null;
          to_address?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'outbound_emails_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      outbound_sms: {
        Row: {
          attempts: number;
          body: string;
          created_at: string;
          delivered_at: string | null;
          id: number;
          last_error: string | null;
          linked_entity_id: string | null;
          linked_entity_type: string | null;
          provider: string;
          provider_message_id: string | null;
          scheduled_for: string;
          sender_id: string;
          sent_at: string | null;
          status: string;
          template_id: string;
          tenant_id: string;
          to_phone: string;
        };
        Insert: {
          attempts?: number;
          body: string;
          created_at?: string;
          delivered_at?: string | null;
          id?: number;
          last_error?: string | null;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          provider: string;
          provider_message_id?: string | null;
          scheduled_for?: string;
          sender_id: string;
          sent_at?: string | null;
          status: string;
          template_id: string;
          tenant_id: string;
          to_phone: string;
        };
        Update: {
          attempts?: number;
          body?: string;
          created_at?: string;
          delivered_at?: string | null;
          id?: number;
          last_error?: string | null;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          provider?: string;
          provider_message_id?: string | null;
          scheduled_for?: string;
          sender_id?: string;
          sent_at?: string | null;
          status?: string;
          template_id?: string;
          tenant_id?: string;
          to_phone?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'outbound_sms_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      outbound_whatsapp: {
        Row: {
          attempts: number;
          components: Json;
          created_at: string;
          delivered_at: string | null;
          id: number;
          last_error: string | null;
          linked_entity_id: string | null;
          linked_entity_type: string | null;
          meta_template_lang: string;
          meta_template_name: string;
          provider_message_id: string | null;
          read_at: string | null;
          scheduled_for: string;
          sent_at: string | null;
          status: string;
          template_id: string;
          tenant_id: string;
          to_phone: string;
        };
        Insert: {
          attempts?: number;
          components: Json;
          created_at?: string;
          delivered_at?: string | null;
          id?: number;
          last_error?: string | null;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          meta_template_lang?: string;
          meta_template_name: string;
          provider_message_id?: string | null;
          read_at?: string | null;
          scheduled_for?: string;
          sent_at?: string | null;
          status?: string;
          template_id: string;
          tenant_id: string;
          to_phone: string;
        };
        Update: {
          attempts?: number;
          components?: Json;
          created_at?: string;
          delivered_at?: string | null;
          id?: number;
          last_error?: string | null;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          meta_template_lang?: string;
          meta_template_name?: string;
          provider_message_id?: string | null;
          read_at?: string | null;
          scheduled_for?: string;
          sent_at?: string | null;
          status?: string;
          template_id?: string;
          tenant_id?: string;
          to_phone?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'outbound_whatsapp_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount_minor: number;
          created_at: string;
          currency: string;
          failure_reason: string | null;
          id: string;
          invoice_id: string;
          method: string | null;
          provider: string;
          provider_charge_id: string | null;
          provider_event_payload: Json | null;
          received_at: string | null;
          status: string;
          tenant_id: string;
        };
        Insert: {
          amount_minor: number;
          created_at?: string;
          currency?: string;
          failure_reason?: string | null;
          id?: string;
          invoice_id: string;
          method?: string | null;
          provider: string;
          provider_charge_id?: string | null;
          provider_event_payload?: Json | null;
          received_at?: string | null;
          status?: string;
          tenant_id: string;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          currency?: string;
          failure_reason?: string | null;
          id?: string;
          invoice_id?: string;
          method?: string | null;
          provider?: string;
          provider_charge_id?: string | null;
          provider_event_payload?: Json | null;
          received_at?: string | null;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_invoice_tenant_fk';
            columns: ['tenant_id', 'invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'payments_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      pro_assignment_term_links: {
        Row: {
          assignment_id: string;
          compensation_term_id: string;
          linked_at: string;
          linked_by: string;
          pricing_term_id: string;
        };
        Insert: {
          assignment_id: string;
          compensation_term_id: string;
          linked_at?: string;
          linked_by: string;
          pricing_term_id: string;
        };
        Update: {
          assignment_id?: string;
          compensation_term_id?: string;
          linked_at?: string;
          linked_by?: string;
          pricing_term_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pro_assignment_term_links_assignment_id_fkey';
            columns: ['assignment_id'];
            isOneToOne: true;
            referencedRelation: 'pro_company_assignments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_assignment_term_links_compensation_term_id_fkey';
            columns: ['compensation_term_id'];
            isOneToOne: false;
            referencedRelation: 'pro_commercial_terms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_assignment_term_links_linked_by_fkey';
            columns: ['linked_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_assignment_term_links_pricing_term_id_fkey';
            columns: ['pricing_term_id'];
            isOneToOne: false;
            referencedRelation: 'pro_commercial_terms';
            referencedColumns: ['id'];
          },
        ];
      };
      pro_commercial_term_events: {
        Row: {
          actor_profile_id: string;
          commercial_term_id: string;
          created_at: string;
          event: Database['public']['Enums']['pro_term_event'];
          from_status: Database['public']['Enums']['pro_term_status'] | null;
          id: string;
          pro_profile_id: string;
          term_version: number;
          to_status: Database['public']['Enums']['pro_term_status'];
        };
        Insert: {
          actor_profile_id: string;
          commercial_term_id: string;
          created_at?: string;
          event: Database['public']['Enums']['pro_term_event'];
          from_status?: Database['public']['Enums']['pro_term_status'] | null;
          id?: string;
          pro_profile_id: string;
          term_version: number;
          to_status: Database['public']['Enums']['pro_term_status'];
        };
        Update: {
          actor_profile_id?: string;
          commercial_term_id?: string;
          created_at?: string;
          event?: Database['public']['Enums']['pro_term_event'];
          from_status?: Database['public']['Enums']['pro_term_status'] | null;
          id?: string;
          pro_profile_id?: string;
          term_version?: number;
          to_status?: Database['public']['Enums']['pro_term_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'pro_commercial_term_events_actor_profile_id_fkey';
            columns: ['actor_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_commercial_term_events_term_fk';
            columns: ['pro_profile_id', 'commercial_term_id'];
            isOneToOne: false;
            referencedRelation: 'pro_commercial_terms';
            referencedColumns: ['pro_profile_id', 'id'];
          },
        ];
      };
      pro_commercial_terms: {
        Row: {
          amount_minor: number;
          created_at: string;
          created_by: string;
          currency: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          model: Database['public']['Enums']['pro_term_model'];
          pro_profile_id: string;
          retainer_interval: Database['public']['Enums']['pro_term_interval'] | null;
          scope: string;
          status: Database['public']['Enums']['pro_term_status'];
          term_kind: Database['public']['Enums']['pro_term_kind'];
          updated_at: string;
          version: number;
        };
        Insert: {
          amount_minor: number;
          created_at?: string;
          created_by: string;
          currency?: string;
          effective_from: string;
          effective_to?: string | null;
          id?: string;
          model: Database['public']['Enums']['pro_term_model'];
          pro_profile_id: string;
          retainer_interval?: Database['public']['Enums']['pro_term_interval'] | null;
          scope?: string;
          status?: Database['public']['Enums']['pro_term_status'];
          term_kind: Database['public']['Enums']['pro_term_kind'];
          updated_at?: string;
          version: number;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          created_by?: string;
          currency?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          model?: Database['public']['Enums']['pro_term_model'];
          pro_profile_id?: string;
          retainer_interval?: Database['public']['Enums']['pro_term_interval'] | null;
          scope?: string;
          status?: Database['public']['Enums']['pro_term_status'];
          term_kind?: Database['public']['Enums']['pro_term_kind'];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'pro_commercial_terms_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_commercial_terms_pro_profile_id_fkey';
            columns: ['pro_profile_id'];
            isOneToOne: false;
            referencedRelation: 'pro_profiles';
            referencedColumns: ['profile_id'];
          },
        ];
      };
      pro_company_assignments: {
        Row: {
          assigned_at: string;
          assigned_by: string;
          company_id: string;
          created_at: string;
          id: string;
          pro_profile_id: string;
          release_reason: string | null;
          released_at: string | null;
          released_by: string | null;
          status: Database['public']['Enums']['pro_company_assignment_status'];
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by: string;
          company_id: string;
          created_at?: string;
          id?: string;
          pro_profile_id: string;
          release_reason?: string | null;
          released_at?: string | null;
          released_by?: string | null;
          status?: Database['public']['Enums']['pro_company_assignment_status'];
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          pro_profile_id?: string;
          release_reason?: string | null;
          released_at?: string | null;
          released_by?: string | null;
          status?: Database['public']['Enums']['pro_company_assignment_status'];
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assignment_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'pro_company_assignments_assigned_by_fkey';
            columns: ['assigned_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_company_assignments_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_company_assignments_pro_profile_id_fkey';
            columns: ['pro_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_company_assignments_released_by_fkey';
            columns: ['released_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_company_assignments_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      pro_credential_decisions: {
        Row: {
          actor_profile_id: string | null;
          created_at: string;
          credential_id: string;
          credential_version: number;
          event: Database['public']['Enums']['pro_credential_event'];
          from_state: Database['public']['Enums']['pro_credential_state'];
          id: string;
          pro_profile_id: string;
          reason: string | null;
          reason_code: string | null;
          to_state: Database['public']['Enums']['pro_credential_state'];
        };
        Insert: {
          actor_profile_id?: string | null;
          created_at?: string;
          credential_id: string;
          credential_version: number;
          event: Database['public']['Enums']['pro_credential_event'];
          from_state: Database['public']['Enums']['pro_credential_state'];
          id?: string;
          pro_profile_id: string;
          reason?: string | null;
          reason_code?: string | null;
          to_state: Database['public']['Enums']['pro_credential_state'];
        };
        Update: {
          actor_profile_id?: string | null;
          created_at?: string;
          credential_id?: string;
          credential_version?: number;
          event?: Database['public']['Enums']['pro_credential_event'];
          from_state?: Database['public']['Enums']['pro_credential_state'];
          id?: string;
          pro_profile_id?: string;
          reason?: string | null;
          reason_code?: string | null;
          to_state?: Database['public']['Enums']['pro_credential_state'];
        };
        Relationships: [
          {
            foreignKeyName: 'pro_credential_decisions_actor_profile_id_fkey';
            columns: ['actor_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_credential_decisions_credential_fk';
            columns: ['pro_profile_id', 'credential_id'];
            isOneToOne: false;
            referencedRelation: 'pro_credentials';
            referencedColumns: ['pro_profile_id', 'id'];
          },
        ];
      };
      pro_credential_evidence: {
        Row: {
          created_at: string;
          credential_id: string;
          id: string;
          mime_type: string;
          original_name_safe: string;
          pro_profile_id: string;
          scan_completed_at: string;
          scan_provider: string;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          updated_at: string;
          uploaded_by: string;
        };
        Insert: {
          created_at?: string;
          credential_id: string;
          id?: string;
          mime_type: string;
          original_name_safe: string;
          pro_profile_id: string;
          scan_completed_at: string;
          scan_provider: string;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          updated_at?: string;
          uploaded_by: string;
        };
        Update: {
          created_at?: string;
          credential_id?: string;
          id?: string;
          mime_type?: string;
          original_name_safe?: string;
          pro_profile_id?: string;
          scan_completed_at?: string;
          scan_provider?: string;
          sha256?: string;
          size_bytes?: number;
          storage_path?: string;
          updated_at?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pro_credential_evidence_credential_fk';
            columns: ['pro_profile_id', 'credential_id'];
            isOneToOne: false;
            referencedRelation: 'pro_credentials';
            referencedColumns: ['pro_profile_id', 'id'];
          },
          {
            foreignKeyName: 'pro_credential_evidence_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      pro_credential_evidence_upload_reservations: {
        Row: {
          actor_id: string;
          cleanup_after: string | null;
          cleanup_passes: number;
          created_at: string;
          credential_id: string;
          evidence_id: string;
          expected_version: number;
          finalized_at: string | null;
          id: string;
          lease_expires_at: string | null;
          mime_type: string;
          operation_id: string;
          original_name_safe: string;
          payload_hash: string;
          pro_profile_id: string;
          recovery_lease_expires_at: string | null;
          recovery_operation_id: string | null;
          scan_completed_at: string;
          scan_provider: string;
          sha256: string;
          size_bytes: number;
          status: string;
          storage_path: string;
          updated_at: string;
        };
        Insert: {
          actor_id: string;
          cleanup_after?: string | null;
          cleanup_passes?: number;
          created_at?: string;
          credential_id: string;
          evidence_id: string;
          expected_version: number;
          finalized_at?: string | null;
          id?: string;
          lease_expires_at?: string | null;
          mime_type: string;
          operation_id: string;
          original_name_safe: string;
          payload_hash: string;
          pro_profile_id: string;
          recovery_lease_expires_at?: string | null;
          recovery_operation_id?: string | null;
          scan_completed_at: string;
          scan_provider: string;
          sha256: string;
          size_bytes: number;
          status?: string;
          storage_path: string;
          updated_at?: string;
        };
        Update: {
          actor_id?: string;
          cleanup_after?: string | null;
          cleanup_passes?: number;
          created_at?: string;
          credential_id?: string;
          evidence_id?: string;
          expected_version?: number;
          finalized_at?: string | null;
          id?: string;
          lease_expires_at?: string | null;
          mime_type?: string;
          operation_id?: string;
          original_name_safe?: string;
          payload_hash?: string;
          pro_profile_id?: string;
          recovery_lease_expires_at?: string | null;
          recovery_operation_id?: string | null;
          scan_completed_at?: string;
          scan_provider?: string;
          sha256?: string;
          size_bytes?: number;
          status?: string;
          storage_path?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pro_credential_evidence_upload_reservations_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_credential_evidence_upload_reservations_credential_fk';
            columns: ['pro_profile_id', 'credential_id'];
            isOneToOne: false;
            referencedRelation: 'pro_credentials';
            referencedColumns: ['pro_profile_id', 'id'];
          },
        ];
      };
      pro_credentials: {
        Row: {
          created_at: string;
          created_by: string | null;
          credential_type: Database['public']['Enums']['pro_credential_type'];
          expiry_date: string | null;
          id: string;
          identifier_ciphertext: string | null;
          identifier_hash: string | null;
          identifier_last4: string | null;
          issue_date: string | null;
          issuing_authority: string | null;
          legacy_unmasked: boolean;
          pro_profile_id: string;
          state: Database['public']['Enums']['pro_credential_state'];
          submitted_at: string | null;
          supersedes_credential_id: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          credential_type?: Database['public']['Enums']['pro_credential_type'];
          expiry_date?: string | null;
          id?: string;
          identifier_ciphertext?: string | null;
          identifier_hash?: string | null;
          identifier_last4?: string | null;
          issue_date?: string | null;
          issuing_authority?: string | null;
          legacy_unmasked?: boolean;
          pro_profile_id: string;
          state?: Database['public']['Enums']['pro_credential_state'];
          submitted_at?: string | null;
          supersedes_credential_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          credential_type?: Database['public']['Enums']['pro_credential_type'];
          expiry_date?: string | null;
          id?: string;
          identifier_ciphertext?: string | null;
          identifier_hash?: string | null;
          identifier_last4?: string | null;
          issue_date?: string | null;
          issuing_authority?: string | null;
          legacy_unmasked?: boolean;
          pro_profile_id?: string;
          state?: Database['public']['Enums']['pro_credential_state'];
          submitted_at?: string | null;
          supersedes_credential_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'pro_credentials_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_credentials_pro_profile_id_fkey';
            columns: ['pro_profile_id'];
            isOneToOne: false;
            referencedRelation: 'pro_profiles';
            referencedColumns: ['profile_id'];
          },
          {
            foreignKeyName: 'pro_credentials_supersedes_credential_id_fkey';
            columns: ['supersedes_credential_id'];
            isOneToOne: false;
            referencedRelation: 'pro_credentials';
            referencedColumns: ['id'];
          },
        ];
      };
      pro_lifecycle_operation_receipts: {
        Row: {
          created_at: string;
          entity_id: string;
          entity_kind: Database['public']['Enums']['pro_lifecycle_operation_kind'];
          operation_id: string;
          payload_hash: string;
          sanitized_result: Json;
        };
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_kind: Database['public']['Enums']['pro_lifecycle_operation_kind'];
          operation_id: string;
          payload_hash: string;
          sanitized_result: Json;
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_kind?: Database['public']['Enums']['pro_lifecycle_operation_kind'];
          operation_id?: string;
          payload_hash?: string;
          sanitized_result?: Json;
        };
        Relationships: [];
      };
      pro_profiles: {
        Row: {
          bio: string | null;
          created_at: string;
          department: string | null;
          designation: string | null;
          profile_id: string;
          service_areas: Json;
          updated_at: string;
        };
        Insert: {
          bio?: string | null;
          created_at?: string;
          department?: string | null;
          designation?: string | null;
          profile_id: string;
          service_areas?: Json;
          updated_at?: string;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          department?: string | null;
          designation?: string | null;
          profile_id?: string;
          service_areas?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pro_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          consent_accepted_at: string | null;
          created_at: string;
          date_format: string;
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
          timezone: string;
          title: string | null;
          updated_at: string;
          username: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          consent_accepted_at?: string | null;
          created_at?: string;
          date_format?: string;
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
          timezone?: string;
          title?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          consent_accepted_at?: string | null;
          created_at?: string;
          date_format?: string;
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
          timezone?: string;
          title?: string | null;
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
      refund_reconciliation_state: {
        Row: {
          cursor_created_at: string | null;
          cursor_id: string | null;
          updated_at: string;
          worker_name: string;
        };
        Insert: {
          cursor_created_at?: string | null;
          cursor_id?: string | null;
          updated_at?: string;
          worker_name: string;
        };
        Update: {
          cursor_created_at?: string | null;
          cursor_id?: string | null;
          updated_at?: string;
          worker_name?: string;
        };
        Relationships: [];
      };
      refunds: {
        Row: {
          amount_minor: number;
          created_at: string;
          id: string;
          idempotency_key: string | null;
          payment_id: string;
          provider_idempotency_key: string | null;
          provider_refund_id: string | null;
          reason: string | null;
          status: string;
          tenant_id: string;
        };
        Insert: {
          amount_minor: number;
          created_at?: string;
          id?: string;
          idempotency_key?: string | null;
          payment_id: string;
          provider_idempotency_key?: string | null;
          provider_refund_id?: string | null;
          reason?: string | null;
          status?: string;
          tenant_id: string;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          id?: string;
          idempotency_key?: string | null;
          payment_id?: string;
          provider_idempotency_key?: string | null;
          provider_refund_id?: string | null;
          reason?: string | null;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'refunds_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refunds_payment_tenant_fk';
            columns: ['tenant_id', 'payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'refunds_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      renewals: {
        Row: {
          company_id: string;
          completed_at: string | null;
          created_at: string;
          due_date: string;
          employee_id: string | null;
          id: string;
          label: string;
          last_notified_at: string | null;
          notify_at: string[];
          source: string;
          status: string;
          tenant_id: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          due_date: string;
          employee_id?: string | null;
          id?: string;
          label: string;
          last_notified_at?: string | null;
          notify_at?: string[];
          source: string;
          status?: string;
          tenant_id: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          due_date?: string;
          employee_id?: string | null;
          id?: string;
          label?: string;
          last_notified_at?: string | null;
          notify_at?: string[];
          source?: string;
          status?: string;
          tenant_id?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'renewals_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'renewals_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'renewals_employee_id_fkey';
            columns: ['employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'renewals_employee_ownership_fk';
            columns: ['tenant_id', 'company_id', 'employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'renewals_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      service_cases: {
        Row: {
          assigned_to: string | null;
          blocked_reason: string | null;
          company_id: string;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          due_at: string | null;
          id: string;
          priority: string;
          service_type: string;
          sla_due_at: string | null;
          status: string;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          blocked_reason?: string | null;
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_at?: string | null;
          id?: string;
          priority?: string;
          service_type: string;
          sla_due_at?: string | null;
          status?: string;
          tenant_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          blocked_reason?: string | null;
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_at?: string | null;
          id?: string;
          priority?: string;
          service_type?: string;
          sla_due_at?: string | null;
          status?: string;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_cases_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_cases_assigned_to_tenant_fk';
            columns: ['tenant_id', 'assigned_to'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'service_cases_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'service_cases_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_cases_created_by_tenant_fk';
            columns: ['tenant_id', 'created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'service_cases_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      sms_inbox: {
        Row: {
          body: string | null;
          created_at: string;
          from_phone: string;
          id: number;
          provider_message_id: string;
          received_at: string;
          tenant_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          from_phone: string;
          id?: number;
          provider_message_id: string;
          received_at?: string;
          tenant_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          from_phone?: string;
          id?: number;
          provider_message_id?: string;
          received_at?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sms_inbox_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          created_at: string;
          currency: string;
          current_period_end: string | null;
          current_period_start: string | null;
          id: string;
          interval: string;
          plan: string;
          status: string;
          stripe_customer_id: string;
          stripe_price_id: string;
          stripe_subscription_id: string;
          tenant_id: string;
          unit_amount_minor: number;
          updated_at: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          currency?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          interval: string;
          plan: string;
          status: string;
          stripe_customer_id: string;
          stripe_price_id: string;
          stripe_subscription_id: string;
          tenant_id: string;
          unit_amount_minor: number;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          currency?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          interval?: string;
          plan?: string;
          status?: string;
          stripe_customer_id?: string;
          stripe_price_id?: string;
          stripe_subscription_id?: string;
          tenant_id?: string;
          unit_amount_minor?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: true;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      tenant_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: Json;
          id: number;
          source: string;
          tenant_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: never;
          source: string;
          tenant_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: never;
          source?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tenant_audit_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tenant_audit_log_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      tenant_payment_config: {
        Row: {
          created_at: string;
          enabled: boolean;
          merchant_id: string;
          provider: string;
          secret_encrypted: string;
          tenant_id: string;
          updated_at: string;
          webhook_secret_encrypted: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          merchant_id: string;
          provider: string;
          secret_encrypted: string;
          tenant_id: string;
          updated_at?: string;
          webhook_secret_encrypted: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          merchant_id?: string;
          provider?: string;
          secret_encrypted?: string;
          tenant_id?: string;
          updated_at?: string;
          webhook_secret_encrypted?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tenant_payment_config_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
      whatsapp_inbox: {
        Row: {
          body: string | null;
          from_phone: string;
          id: number;
          received_at: string;
          tenant_id: string;
          wamid: string | null;
        };
        Insert: {
          body?: string | null;
          from_phone: string;
          id?: number;
          received_at?: string;
          tenant_id: string;
          wamid?: string | null;
        };
        Update: {
          body?: string | null;
          from_phone?: string;
          id?: number;
          received_at?: string;
          tenant_id?: string;
          wamid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'whatsapp_inbox_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      whatsapp_template_approvals: {
        Row: {
          category: string;
          created_at: string;
          created_by: string | null;
          id: string;
          language: string;
          last_checked_at: string | null;
          meta_template_name: string;
          notes: string | null;
          rejection_reason: string | null;
          status: string;
          submitted_at: string | null;
          template_id: string;
          tenant_id: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          category: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          language?: string;
          last_checked_at?: string | null;
          meta_template_name: string;
          notes?: string | null;
          rejection_reason?: string | null;
          status: string;
          submitted_at?: string | null;
          template_id: string;
          tenant_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          language?: string;
          last_checked_at?: string | null;
          meta_template_name?: string;
          notes?: string | null;
          rejection_reason?: string | null;
          status?: string;
          submitted_at?: string | null;
          template_id?: string;
          tenant_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'whatsapp_template_approvals_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'whatsapp_template_approvals_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'whatsapp_template_approvals_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      admin_active_sessions: {
        Row: {
          created_at: string | null;
          id: string | null;
          ip: unknown;
          not_after: string | null;
          refreshed_at: string | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string | null;
          ip?: unknown;
          not_after?: string | null;
          refreshed_at?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string | null;
          ip?: unknown;
          not_after?: string | null;
          refreshed_at?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      service_cases_ranked: {
        Row: {
          assigned_to: string | null;
          blocked_reason: string | null;
          company_id: string | null;
          completed_at: string | null;
          created_at: string | null;
          due_at: string | null;
          id: string | null;
          priority: string | null;
          priority_rank: number | null;
          service_type: string | null;
          sla_breach_rank: number | null;
          sla_due_at: string | null;
          status: string | null;
          tenant_id: string | null;
          title: string | null;
          updated_at: string | null;
        };
        Insert: {
          assigned_to?: string | null;
          blocked_reason?: string | null;
          company_id?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          due_at?: string | null;
          id?: string | null;
          priority?: string | null;
          priority_rank?: never;
          service_type?: string | null;
          sla_breach_rank?: never;
          sla_due_at?: string | null;
          status?: string | null;
          tenant_id?: string | null;
          title?: string | null;
          updated_at?: string | null;
        };
        Update: {
          assigned_to?: string | null;
          blocked_reason?: string | null;
          company_id?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          due_at?: string | null;
          id?: string | null;
          priority?: string | null;
          priority_rank?: never;
          service_type?: string | null;
          sla_breach_rank?: never;
          sla_due_at?: string | null;
          status?: string | null;
          tenant_id?: string | null;
          title?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'service_cases_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_cases_assigned_to_tenant_fk';
            columns: ['tenant_id', 'assigned_to'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'service_cases_company_tenant_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'service_cases_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      activate_company_onboarding: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_onboarding_version: number;
          p_operation_id: string;
          p_payload: Json;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      activate_pro_commercial_term: {
        Args: {
          p_actor_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_term_id: string;
        };
        Returns: Json;
      };
      admin_change_role_atomic: {
        Args: {
          p_actor_id: string;
          p_expected_role: string;
          p_expected_tenant_id: string;
          p_new_role: string;
          p_new_tenant_id: string;
          p_reason?: string;
          p_role_data: Json;
          p_target_id: string;
        };
        Returns: Json;
      };
      assert_pro_lifecycle_actor: {
        Args: {
          p_actor_id: string;
          p_operator_only?: boolean;
          p_target_pro_profile_id: string;
        };
        Returns: string;
      };
      assert_safe_pro_decision_reason: {
        Args: { p_reason: string; p_reason_code: string };
        Returns: undefined;
      };
      assign_pro_to_company: {
        Args: {
          p_actor_profile_id: string;
          p_company_id: string;
          p_pro_profile_id: string;
        };
        Returns: Json;
      };
      authorize_pro_company_access: {
        Args: { p_actor_id: string; p_company_id?: string; p_tenant_id: string };
        Returns: boolean;
      };
      authorize_pro_lifecycle_actor: {
        Args: {
          p_actor_id: string;
          p_operator_only?: boolean;
          p_target_pro_profile_id: string;
        };
        Returns: string;
      };
      begin_pro_credential_review: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
        };
        Returns: Json;
      };
      cleanup_company_onboarding_operations: { Args: never; Returns: number };
      cleanup_pro_lifecycle_operation_receipts: { Args: never; Returns: number };
      clear_company_bank_identifier: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_onboarding_version: number;
          p_operation_id: string;
          p_payload: Json;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      complete_erasure_cleanup: {
        Args: { p_actor_id: string; p_request_id: string; p_tenant_id: string };
        Returns: Json;
      };
      compute_notify_at: {
        Args: { due: string; renewal_type: string };
        Returns: string[];
      };
      create_company_invoice: {
        Args: {
          p_amount_minor: number;
          p_company_id: string;
          p_created_by: string;
          p_currency: string;
          p_customer_profile_id: string;
          p_due_at: string;
          p_label: string;
          p_linked_entity_id: string;
          p_linked_entity_type: string;
          p_tenant_id: string;
        };
        Returns: string;
      };
      create_pro_commercial_term_draft: {
        Args: {
          p_actor_id: string;
          p_amount_minor: number;
          p_effective_from: string;
          p_effective_to?: string;
          p_model: Database['public']['Enums']['pro_term_model'];
          p_operation_id: string;
          p_payload_hash: string;
          p_pro_profile_id: string;
          p_retainer_interval: Database['public']['Enums']['pro_term_interval'];
          p_term_kind: Database['public']['Enums']['pro_term_kind'];
        };
        Returns: Json;
      };
      create_pro_credential_draft: {
        Args: {
          p_actor_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_pro_profile_id: string;
        };
        Returns: Json;
      };
      create_pro_credential_replacement: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
        };
        Returns: Json;
      };
      create_service_case_with_audit: {
        Args: {
          p_actor_id: string;
          p_assigned_to: string;
          p_blocked_reason: string;
          p_changed_keys: string[];
          p_company_id: string;
          p_due_at: string;
          p_priority: string;
          p_service_type: string;
          p_sla_due_at: string;
          p_tenant_id: string;
          p_title: string;
        };
        Returns: string;
      };
      end_pro_commercial_term: {
        Args: {
          p_actor_id: string;
          p_effective_to: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_term_id: string;
        };
        Returns: Json;
      };
      evaluate_company_activation_readiness: {
        Args: { p_company_id: string };
        Returns: {
          code: string;
          section: string;
          state: string;
        }[];
      };
      evaluate_pro_assignment_eligibility: {
        Args: { p_company_id?: string; p_pro_profile_id: string };
        Returns: Json;
      };
      get_pro_document_version_history: {
        Args: { p_document_id: string; p_tenant_id: string };
        Returns: Json;
      };
      has_company_access: { Args: { p_tenant_id: string }; Returns: boolean };
      has_company_storage_access: {
        Args: { p_object_name: string };
        Returns: boolean;
      };
      has_current_pro_credential: {
        Args: { p_pro_profile_id: string };
        Returns: boolean;
      };
      list_company_payment_invoices: {
        Args: {
          p_company_id: string;
          p_date?: string;
          p_page?: number;
          p_page_size?: number;
          p_period?: string;
          p_tenant_id: string;
          p_today?: string;
          p_view: string;
        };
        Returns: Json;
      };
      list_eligible_pros_for_company: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_limit?: number;
          p_query?: string;
        };
        Returns: Json;
      };
      list_pro_document_center: {
        Args: {
          p_company_id?: string;
          p_doc_type?: string;
          p_due_from?: string;
          p_due_to?: string;
          p_expiry_from?: string;
          p_expiry_to?: string;
          p_focus_id?: string;
          p_focus_kind?: string;
          p_page?: number;
          p_page_size?: number;
          p_search?: string;
          p_sort?: string;
          p_tenant_id: string;
          p_view?: string;
        };
        Returns: {
          company_id: string;
          company_name: string;
          company_status: string;
          created_at: string;
          current_version_created_at: string;
          current_version_id: string;
          current_version_mime_type: string;
          current_version_size_bytes: number;
          doc_type: string;
          document_id: string;
          due_at: string;
          effective_expires_on: string;
          effective_page: number;
          employee_id: string;
          employee_name: string;
          entity_id: string;
          entity_kind: string;
          expiry_source: string;
          label: string;
          request_id: string;
          request_status: string;
          requested_by: string;
          requested_by_name: string;
          review_note: string;
          review_status: string;
          reviewed_at: string;
          reviewed_by: string;
          reviewed_by_name: string;
          tenant_id: string;
          total_count: number;
        }[];
      };
      list_signal_payment_invoices: {
        Args: {
          p_date?: string;
          p_page?: number;
          p_page_size?: number;
          p_period?: string;
          p_tenant_id: string;
          p_today?: string;
          p_view: string;
        };
        Returns: Json;
      };
      lock_company_assignment_resources: {
        Args: { p_company_id: string; p_pro_profile_ids: string[] };
        Returns: undefined;
      };
      mandoob_access_token_hook: { Args: { event: Json }; Returns: Json };
      mark_company_invoice_paid: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_invoice_id: string;
          p_ip: string;
          p_method: string;
          p_note: string;
          p_tenant_id: string;
        };
        Returns: string;
      };
      mark_erasure_cleanup_step: {
        Args: { p_request_id: string; p_step: string; p_tenant_id: string };
        Returns: undefined;
      };
      materialize_expired_pro_credentials: { Args: never; Returns: number };
      open_pro_credential_evidence_metadata: {
        Args: { p_actor_id: string; p_evidence_id: string };
        Returns: {
          credential_id: string;
          evidence_id: string;
          mime_type: string;
          original_name_safe: string;
          pro_profile_id: string;
          size_bytes: number;
          storage_path: string;
        }[];
      };
      prepare_company_onboarding_operation: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_onboarding_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      prepare_company_refund: {
        Args: {
          p_actor_id: string;
          p_amount_minor: number;
          p_company_id: string;
          p_idempotency_key: string;
          p_invoice_id: string;
          p_reason: string;
          p_tenant_id: string;
        };
        Returns: {
          currency: string;
          payment_id: string;
          provider: string;
          provider_charge_id: string;
          provider_idempotency_key: string;
          refund_id: string;
          refund_status: string;
        }[];
      };
      prepare_erasure_cleanup: {
        Args: {
          p_actor_id: string;
          p_request_id: string;
          p_subject_user_id: string;
          p_tenant_id: string;
        };
        Returns: {
          anonymization_diff: Json;
          auth_anonymized_at: string;
          company_id: string;
          completion_notification_queued_at: string;
          document_ids: string[];
          request_id: string;
          storage_deleted_at: string;
          storage_paths: string[];
          subject_kind: string;
        }[];
      };
      pro_credential_masked_result: {
        Args: { p_credential_id: string };
        Returns: Json;
      };
      pro_lifecycle_replay_result: {
        Args: {
          p_entity_id: string;
          p_entity_kind: Database['public']['Enums']['pro_lifecycle_operation_kind'];
          p_operation_id: string;
          p_payload_hash: string;
        };
        Returns: Json;
      };
      provision_company_workspace_atomic: {
        Args: {
          p_actor_id: string;
          p_company_name: string;
          p_plan: string;
          p_slug: string;
        };
        Returns: Json;
      };
      raise_pro_assignment_eligibility_error: {
        Args: { p_result: Json };
        Returns: undefined;
      };
      rate_limit_consume: {
        Args: {
          p_capacity: number;
          p_cost?: number;
          p_key: string;
          p_refill_per_sec: number;
        };
        Returns: boolean;
      };
      read_authoritative_pro_tenant: {
        Args: { p_actor_id: string };
        Returns: string;
      };
      read_company_onboarding: {
        Args: { p_actor_id: string; p_company_id: string; p_tenant_id: string };
        Returns: Json;
      };
      read_pro_commercial_terms: {
        Args: { p_actor_id: string; p_pro_profile_id: string };
        Returns: Json;
      };
      read_pro_credential_snapshot: {
        Args: { p_actor_id: string; p_pro_profile_id: string };
        Returns: Json;
      };
      read_pro_lifecycle_timeline: {
        Args: {
          p_actor_id: string;
          p_cursor_event_at?: string;
          p_cursor_event_id?: string;
          p_limit?: number;
          p_pro_profile_id: string;
        };
        Returns: Json;
      };
      reassign_company_pro: {
        Args: {
          p_actor_profile_id: string;
          p_company_id: string;
          p_expected_assignment_id: string;
          p_reason: string;
          p_replacement_pro_profile_id: string;
        };
        Returns: Json;
      };
      recompute_renewal_status: { Args: never; Returns: undefined };
      reconcile_company_refund: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_ip: string;
          p_provider_refund_id: string;
          p_refund_id: string;
          p_status: string;
          p_tenant_id: string;
        };
        Returns: {
          partial: boolean;
          refund_id: string;
          refund_status: string;
        }[];
      };
      record_company_onboarding_operation: {
        Args: {
          p_committed_version: number;
          p_company_id: string;
          p_operation_id: string;
          p_operation_kind: string;
          p_payload_hash: string;
          p_result: Json;
          p_tenant_id: string;
        };
        Returns: undefined;
      };
      register_pro_credential_evidence: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_evidence_id: string;
          p_expected_version: number;
          p_mime_type: string;
          p_operation_id: string;
          p_original_name_safe: string;
          p_payload_hash: string;
          p_scan_completed_at: string;
          p_scan_provider: string;
          p_sha256: string;
          p_size_bytes: number;
          p_storage_path: string;
        };
        Returns: Json;
      };
      prepare_pro_credential_evidence_upload: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_evidence_id: string;
          p_expected_version: number;
          p_mime_type: string;
          p_operation_id: string;
          p_original_name_safe: string;
          p_payload_hash: string;
          p_scan_completed_at: string;
          p_scan_provider: string;
          p_sha256: string;
          p_size_bytes: number;
          p_storage_path: string;
        };
        Returns: Json;
      };
      claim_pro_credential_evidence_upload_cleanup: {
        Args: {
          p_limit: number;
          p_recovery_operation_id: string;
        };
        Returns: Json;
      };
      finalize_pro_credential_evidence_upload_cleanup: {
        Args: {
          p_recovery_operation_id: string;
          p_reservation_id: string;
        };
        Returns: Json;
      };
      cleanup_finalized_pro_credential_evidence_upload_reservations: {
        Args: never;
        Returns: number;
      };
      finalize_pro_credential_evidence_upload: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_evidence_id: string;
          p_expected_version: number;
          p_mime_type: string;
          p_operation_id: string;
          p_original_name_safe: string;
          p_payload_hash: string;
          p_scan_completed_at: string;
          p_scan_provider: string;
          p_sha256: string;
          p_size_bytes: number;
          p_storage_path: string;
        };
        Returns: Json;
      };
      reject_pro_credential: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_reason: string;
          p_reason_code: string;
        };
        Returns: Json;
      };
      release_company_pro: {
        Args: {
          p_actor_profile_id: string;
          p_company_id: string;
          p_expected_assignment_id: string;
          p_reason: string;
        };
        Returns: string;
      };
      remove_pro_credential_evidence: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_evidence_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
        };
        Returns: Json;
      };
      reopen_company_onboarding_section: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_onboarding_version: number;
          p_operation_id: string;
          p_payload: Json;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      review_document_version: {
        Args: {
          p_actor_id: string;
          p_note: string;
          p_reviewed_at: string;
          p_status: string;
          p_tenant_id: string;
          p_version_id: string;
        };
        Returns: {
          company_id: string;
          document_id: string;
          fulfilled_request_id: string;
          review_status: string;
        }[];
      };
      revoke_pro_credential: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_reason: string;
          p_reason_code: string;
        };
        Returns: Json;
      };
      save_company_activities_section: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_onboarding_version: number;
          p_operation_id: string;
          p_payload: Json;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      save_company_bank_section: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_onboarding_version: number;
          p_operation_id: string;
          p_payload: Json;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      save_company_establishment_section: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_onboarding_version: number;
          p_operation_id: string;
          p_payload: Json;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      save_company_legal_section: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_onboarding_version: number;
          p_operation_id: string;
          p_payload: Json;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      save_company_office_section: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_onboarding_version: number;
          p_operation_id: string;
          p_payload: Json;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      save_company_onboarding_section_internal: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_onboarding_version: number;
          p_operation_id: string;
          p_payload: Json;
          p_payload_hash: string;
          p_section: Database['public']['Enums']['company_onboarding_section_key'];
          p_tenant_id: string;
        };
        Returns: Json;
      };
      save_company_shareholders_section: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_onboarding_version: number;
          p_operation_id: string;
          p_payload: Json;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      save_pro_credential_draft: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_expected_version: number;
          p_expiry_date: string;
          p_identifier_ciphertext: string | null;
          p_identifier_hash: string | null;
          p_identifier_last4: string | null;
          p_issue_date: string;
          p_issuing_authority: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_preserve_identifier: boolean;
        };
        Returns: Json;
      };
      set_pro_document_expiry: {
        Args: {
          p_actor_id: string;
          p_document_id: string;
          p_expires_on: string;
          p_tenant_id: string;
        };
        Returns: {
          company_id: string;
          document_id: string;
          expires_on: string;
        }[];
      };
      store_pro_lifecycle_receipt: {
        Args: {
          p_entity_id: string;
          p_entity_kind: Database['public']['Enums']['pro_lifecycle_operation_kind'];
          p_operation_id: string;
          p_payload_hash: string;
          p_sanitized_result: Json;
        };
        Returns: undefined;
      };
      submit_company_onboarding_for_activation: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_onboarding_version: number;
          p_operation_id: string;
          p_payload: Json;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      submit_pro_credential: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
        };
        Returns: Json;
      };
      update_assigned_company_profile: {
        Args: {
          p_actor_profile_id: string;
          p_company_id: string;
          p_company_name: string;
          p_expected_updated_at: string;
          p_jurisdiction: string;
          p_license_expiry: string;
          p_tenant_id: string;
          p_trade_license_no: string;
        };
        Returns: Json;
      };
      update_company_service_case_with_audit: {
        Args: {
          p_actor_id: string;
          p_case_id: string;
          p_changed_keys: string[];
          p_company_id: string;
          p_patch: Json;
          p_tenant_id: string;
        };
        Returns: string;
      };
      update_employee_self_passport: {
        Args: {
          p_actor_profile_id: string;
          p_expected_company_id: string;
          p_expected_tenant_id: string;
          p_passport_no_encrypted: string;
          p_passport_no_hash: string;
        };
        Returns: string;
      };
      update_service_case_with_audit: {
        Args: {
          p_actor_id: string;
          p_case_id: string;
          p_changed_keys: string[];
          p_patch: Json;
          p_tenant_id: string;
        };
        Returns: string;
      };
      verify_pro_credential: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
        };
        Returns: Json;
      };
      void_company_invoice: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_invoice_id: string;
          p_ip: string;
          p_reason: string;
          p_tenant_id: string;
        };
        Returns: string;
      };
      write_pro_lifecycle_audit: {
        Args: {
          p_action: string;
          p_actor_id: string;
          p_entity_id: string;
          p_target_pro_profile_id: string;
          p_version: number;
        };
        Returns: undefined;
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
        | 'admin_user_status_changed'
        | 'tenant_provisioned'
        | 'tenant_self_serve_submitted'
        | 'tenant_approved'
        | 'tenant_rejected'
        | 'tenant_suspended'
        | 'tenant_reactivated'
        | 'tenant_self_updated'
        | 'pro_lifecycle_changed';
      bulk_import_kind: 'employees';
      bulk_import_status:
        | 'uploaded'
        | 'validating'
        | 'validated'
        | 'importing'
        | 'completed'
        | 'failed'
        | 'cancelled';
      company_jurisdiction_type: 'mainland' | 'free_zone' | 'offshore';
      company_office_type: 'physical' | 'flexi_desk' | 'virtual';
      company_onboarding_section_key:
        | 'legal'
        | 'shareholders'
        | 'activities'
        | 'office'
        | 'establishment'
        | 'bank';
      company_onboarding_section_status: 'incomplete' | 'complete';
      company_onboarding_status:
        | 'not_started'
        | 'in_progress'
        | 'ready_for_activation'
        | 'completed';
      company_shareholder_kind: 'individual' | 'company';
      company_status:
        | 'onboarding'
        | 'active'
        | 'renewal_due'
        | 'renewal_overdue'
        | 'suspended'
        | 'churned';
      employee_status: 'active' | 'inactive' | 'terminated';
      erasure_request_status:
        | 'pending_verification'
        | 'submitted'
        | 'under_review'
        | 'approved'
        | 'rejected'
        | 'completed'
        | 'cancelled';
      erasure_subject_kind: 'customer' | 'employee';
      meeting_slot_status: 'open' | 'booked' | 'cancelled';
      meeting_status: 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'recording_ready';
      pro_company_assignment_status: 'active' | 'released';
      pro_credential_event:
        | 'submitted'
        | 'review_started'
        | 'verified'
        | 'rejected'
        | 'expired'
        | 'revoked'
        | 'superseded';
      pro_credential_state:
        | 'draft'
        | 'submitted'
        | 'under_review'
        | 'verified'
        | 'rejected'
        | 'expired'
        | 'revoked';
      pro_credential_type: 'pro_license';
      pro_lifecycle_operation_kind: 'credential' | 'commercial_term';
      pro_term_event: 'created' | 'activated' | 'ended';
      pro_term_interval: 'monthly' | 'annual';
      pro_term_kind: 'pricing' | 'compensation';
      pro_term_model: 'per_registration' | 'retainer';
      pro_term_status: 'draft' | 'active' | 'ended';
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
  graphql_public: {
    Enums: {},
  },
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
        'tenant_provisioned',
        'tenant_self_serve_submitted',
        'tenant_approved',
        'tenant_rejected',
        'tenant_suspended',
        'tenant_reactivated',
        'tenant_self_updated',
        'pro_lifecycle_changed',
      ],
      bulk_import_kind: ['employees'],
      bulk_import_status: [
        'uploaded',
        'validating',
        'validated',
        'importing',
        'completed',
        'failed',
        'cancelled',
      ],
      company_jurisdiction_type: ['mainland', 'free_zone', 'offshore'],
      company_office_type: ['physical', 'flexi_desk', 'virtual'],
      company_onboarding_section_key: [
        'legal',
        'shareholders',
        'activities',
        'office',
        'establishment',
        'bank',
      ],
      company_onboarding_section_status: ['incomplete', 'complete'],
      company_onboarding_status: [
        'not_started',
        'in_progress',
        'ready_for_activation',
        'completed',
      ],
      company_shareholder_kind: ['individual', 'company'],
      company_status: [
        'onboarding',
        'active',
        'renewal_due',
        'renewal_overdue',
        'suspended',
        'churned',
      ],
      employee_status: ['active', 'inactive', 'terminated'],
      erasure_request_status: [
        'pending_verification',
        'submitted',
        'under_review',
        'approved',
        'rejected',
        'completed',
        'cancelled',
      ],
      erasure_subject_kind: ['customer', 'employee'],
      meeting_slot_status: ['open', 'booked', 'cancelled'],
      meeting_status: ['scheduled', 'completed', 'cancelled', 'no_show', 'recording_ready'],
      pro_company_assignment_status: ['active', 'released'],
      pro_credential_event: [
        'submitted',
        'review_started',
        'verified',
        'rejected',
        'expired',
        'revoked',
        'superseded',
      ],
      pro_credential_state: [
        'draft',
        'submitted',
        'under_review',
        'verified',
        'rejected',
        'expired',
        'revoked',
      ],
      pro_credential_type: ['pro_license'],
      pro_lifecycle_operation_kind: ['credential', 'commercial_term'],
      pro_term_event: ['created', 'activated', 'ended'],
      pro_term_interval: ['monthly', 'annual'],
      pro_term_kind: ['pricing', 'compensation'],
      pro_term_model: ['per_registration', 'retainer'],
      pro_term_status: ['draft', 'active', 'ended'],
      profile_status: ['active', 'invited', 'disabled', 'suspended'],
    },
  },
} as const;
