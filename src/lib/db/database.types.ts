export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
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
        ComputedFields: never;
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
          details: NonNullable<Json>;
          id: number;
          ip: unknown;
          kind: Database['public']['Enums']['auth_event_kind'];
          occurred_at: string;
          tenant_id: string | null;
          user_agent: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_user_id?: string | null;
          details?: NonNullable<Json>;
          id?: number;
          ip?: unknown;
          kind: Database['public']['Enums']['auth_event_kind'];
          occurred_at?: string;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          actor_user_id?: string | null;
          details?: NonNullable<Json>;
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
        ComputedFields: never;
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
      bank_evidence_operation_receipts: {
        Row: {
          actor_id: string;
          committed_at: string;
          committed_version: number;
          company_id: string;
          expected_version: number;
          id: string;
          operation_id: string;
          payload_hash: string;
          sanitized_result: NonNullable<Json>;
          submission_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          committed_at?: string;
          committed_version: number;
          company_id: string;
          expected_version: number;
          id?: string;
          operation_id: string;
          payload_hash: string;
          sanitized_result: NonNullable<Json>;
          submission_id: string;
          tenant_id: string;
        };
        Update: {
          actor_id?: string;
          committed_at?: string;
          committed_version?: number;
          company_id?: string;
          expected_version?: number;
          id?: string;
          operation_id?: string;
          payload_hash?: string;
          sanitized_result?: NonNullable<Json>;
          submission_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bank_evidence_operation_receipts_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bank_evidence_receipt_submission_fk';
            columns: ['tenant_id', 'company_id', 'submission_id'];
            isOneToOne: false;
            referencedRelation: 'bank_transfer_submissions';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
        ];
      };
      bank_evidence_retention_policies: {
        Row: {
          active: boolean;
          policy_key: string;
          reviewed_at: string;
          reviewed_by: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          policy_key: string;
          reviewed_at: string;
          reviewed_by: string;
        };
        Update: {
          active?: boolean;
          policy_key?: string;
          reviewed_at?: string;
          reviewed_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bank_evidence_retention_policies_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      bank_transfer_submissions: {
        Row: {
          actor_id: string;
          company_id: string;
          created_at: string;
          customer_profile_id: string;
          document_id: string | null;
          expires_at: string | null;
          finalized_at: string | null;
          id: string;
          investigation_hold: boolean;
          invoice_id: string;
          legal_hold: boolean;
          operation_id: string;
          policy_key: string | null;
          review_note: string | null;
          review_state: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          tenant_id: string;
          tombstoned_at: string | null;
          version: number;
          version_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          company_id: string;
          created_at?: string;
          customer_profile_id: string;
          document_id?: string | null;
          expires_at?: string | null;
          finalized_at?: string | null;
          id?: string;
          investigation_hold?: boolean;
          invoice_id: string;
          legal_hold?: boolean;
          operation_id: string;
          policy_key?: string | null;
          review_note?: string | null;
          review_state?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          tenant_id: string;
          tombstoned_at?: string | null;
          version?: number;
          version_id?: string | null;
        };
        Update: {
          actor_id?: string;
          company_id?: string;
          created_at?: string;
          customer_profile_id?: string;
          document_id?: string | null;
          expires_at?: string | null;
          finalized_at?: string | null;
          id?: string;
          investigation_hold?: boolean;
          invoice_id?: string;
          legal_hold?: boolean;
          operation_id?: string;
          policy_key?: string | null;
          review_note?: string | null;
          review_state?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          tenant_id?: string;
          tombstoned_at?: string | null;
          version?: number;
          version_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bank_transfer_submissions_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bank_transfer_submissions_company_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'bank_transfer_submissions_customer_fk';
            columns: ['company_id', 'customer_profile_id'];
            isOneToOne: false;
            referencedRelation: 'customer_profiles';
            referencedColumns: ['linked_company_id', 'profile_id'];
          },
          {
            foreignKeyName: 'bank_transfer_submissions_document_fk';
            columns: ['tenant_id', 'company_id', 'document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'bank_transfer_submissions_invoice_fk';
            columns: ['tenant_id', 'company_id', 'invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'bank_transfer_submissions_policy_key_fkey';
            columns: ['policy_key'];
            isOneToOne: false;
            referencedRelation: 'bank_evidence_retention_policies';
            referencedColumns: ['policy_key'];
          },
          {
            foreignKeyName: 'bank_transfer_submissions_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bank_transfer_submissions_version_fk';
            columns: ['tenant_id', 'document_id', 'version_id'];
            isOneToOne: false;
            referencedRelation: 'document_versions';
            referencedColumns: ['tenant_id', 'document_id', 'id'];
          },
        ];
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
          row_version: number;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          updated_at: string;
          uploaded_by: string | null;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          alt_text?: string | null;
          caption?: string | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          mime_type: string;
          original_name: string;
          public_url: string;
          row_version?: number;
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
          row_version?: number;
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
        ComputedFields: never;
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
          content_json: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          excerpt: string | null;
          id: string;
          post_id: string;
          revision_note: string | null;
          status: string;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          content_html?: string;
          content_json?: NonNullable<Json>;
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
          content_json?: NonNullable<Json>;
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
        ComputedFields: never;
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
          content_json: NonNullable<Json>;
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
          row_version: number;
          scheduled_for: string | null;
          slug: string;
          status: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          author_id?: string | null;
          canonical_url?: string | null;
          content_html?: string;
          content_json?: NonNullable<Json>;
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
          row_version?: number;
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
          content_json?: NonNullable<Json>;
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
          row_version?: number;
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
          row_version: number;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          kind: string;
          name: string;
          parent_id?: string | null;
          row_version?: number;
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
          row_version?: number;
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
      bulk_import_artifact_access: {
        Row: {
          accessed_at: string;
          actor_id: string | null;
          artifact_sha256: string;
          company_id: string;
          id: string;
          job_id: string;
          purpose: string;
          tenant_id: string;
          worker_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          accessed_at?: string;
          actor_id?: string | null;
          artifact_sha256: string;
          company_id: string;
          id?: string;
          job_id: string;
          purpose: string;
          tenant_id: string;
          worker_id?: string | null;
        };
        Update: {
          accessed_at?: string;
          actor_id?: string | null;
          artifact_sha256?: string;
          company_id?: string;
          id?: string;
          job_id?: string;
          purpose?: string;
          tenant_id?: string;
          worker_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bulk_import_artifact_access_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bulk_import_artifact_access_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'bulk_import_jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      bulk_import_jobs: {
        Row: {
          artifact_bytes: number | null;
          artifact_deleted_at: string | null;
          artifact_encryption: string | null;
          artifact_sha256: string | null;
          cancel_requested_at: string | null;
          company_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          dedupe_key: string | null;
          error_rows: number | null;
          errors: Json | null;
          execution_event_id: string | null;
          failure_code: string | null;
          id: string;
          inserted_rows: number;
          kind: Database['public']['Enums']['bulk_import_kind'];
          next_batch: number;
          next_row: number;
          operation_id: string | null;
          processed_rows: number | null;
          requested_by: string | null;
          retention_expires_at: string | null;
          skipped_rows: number;
          started_at: string | null;
          status: Database['public']['Enums']['bulk_import_status'];
          storage_path: string;
          tenant_id: string;
          total_rows: number | null;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          artifact_bytes?: number | null;
          artifact_deleted_at?: string | null;
          artifact_encryption?: string | null;
          artifact_sha256?: string | null;
          cancel_requested_at?: string | null;
          company_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          dedupe_key?: string | null;
          error_rows?: number | null;
          errors?: Json | null;
          execution_event_id?: string | null;
          failure_code?: string | null;
          id?: string;
          inserted_rows?: number;
          kind: Database['public']['Enums']['bulk_import_kind'];
          next_batch?: number;
          next_row?: number;
          operation_id?: string | null;
          processed_rows?: number | null;
          requested_by?: string | null;
          retention_expires_at?: string | null;
          skipped_rows?: number;
          started_at?: string | null;
          status?: Database['public']['Enums']['bulk_import_status'];
          storage_path: string;
          tenant_id: string;
          total_rows?: number | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          artifact_bytes?: number | null;
          artifact_deleted_at?: string | null;
          artifact_encryption?: string | null;
          artifact_sha256?: string | null;
          cancel_requested_at?: string | null;
          company_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          dedupe_key?: string | null;
          error_rows?: number | null;
          errors?: Json | null;
          execution_event_id?: string | null;
          failure_code?: string | null;
          id?: string;
          inserted_rows?: number;
          kind?: Database['public']['Enums']['bulk_import_kind'];
          next_batch?: number;
          next_row?: number;
          operation_id?: string | null;
          processed_rows?: number | null;
          requested_by?: string | null;
          retention_expires_at?: string | null;
          skipped_rows?: number;
          started_at?: string | null;
          status?: Database['public']['Enums']['bulk_import_status'];
          storage_path?: string;
          tenant_id?: string;
          total_rows?: number | null;
          updated_at?: string;
          version?: number;
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
            foreignKeyName: 'bulk_import_jobs_execution_event_id_fkey';
            columns: ['execution_event_id'];
            isOneToOne: false;
            referencedRelation: 'domain_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bulk_import_jobs_requested_by_fkey';
            columns: ['requested_by'];
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
      bulk_import_row_outcomes: {
        Row: {
          batch_no: number;
          created_at: string;
          employee_id: string | null;
          error_code: string | null;
          job_id: string;
          outcome: string;
          row_number: number;
        };
        ComputedFields: never;
        Insert: {
          batch_no: number;
          created_at?: string;
          employee_id?: string | null;
          error_code?: string | null;
          job_id: string;
          outcome: string;
          row_number: number;
        };
        Update: {
          batch_no?: number;
          created_at?: string;
          employee_id?: string | null;
          error_code?: string | null;
          job_id?: string;
          outcome?: string;
          row_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'bulk_import_row_outcomes_employee_id_fkey';
            columns: ['employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bulk_import_row_outcomes_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'bulk_import_jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_provider_connections: {
        Row: {
          disconnected_at: string | null;
          encrypted_access_token: string | null;
          encrypted_refresh_token: string | null;
          id: string;
          owner_profile_id: string;
          provider: string;
          scopes: string[];
          state: string;
          tenant_id: string;
          token_expires_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          disconnected_at?: string | null;
          encrypted_access_token?: string | null;
          encrypted_refresh_token?: string | null;
          id?: string;
          owner_profile_id: string;
          provider: string;
          scopes?: string[];
          state?: string;
          tenant_id: string;
          token_expires_at?: string | null;
        };
        Update: {
          disconnected_at?: string | null;
          encrypted_access_token?: string | null;
          encrypted_refresh_token?: string | null;
          id?: string;
          owner_profile_id?: string;
          provider?: string;
          scopes?: string[];
          state?: string;
          tenant_id?: string;
          token_expires_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_provider_connections_owner_profile_id_fkey';
            columns: ['owner_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_provider_connections_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      catalog_activities: {
        Row: {
          availability: string;
          catalog_version_id: string;
          category: string | null;
          code: string | null;
          created_at: string;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          availability?: string;
          catalog_version_id: string;
          category?: string | null;
          code?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          availability?: string;
          catalog_version_id?: string;
          category?: string | null;
          code?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_activities_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      catalog_authorities: {
        Row: {
          availability: string;
          catalog_version_id: string;
          created_at: string;
          emirate: string | null;
          id: string;
          jurisdiction: string;
          name: string;
          official_url: string | null;
          slug: string;
          sort_order: number;
          summary: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          availability?: string;
          catalog_version_id: string;
          created_at?: string;
          emirate?: string | null;
          id?: string;
          jurisdiction: string;
          name: string;
          official_url?: string | null;
          slug: string;
          sort_order?: number;
          summary?: string | null;
          updated_at?: string;
        };
        Update: {
          availability?: string;
          catalog_version_id?: string;
          created_at?: string;
          emirate?: string | null;
          id?: string;
          jurisdiction?: string;
          name?: string;
          official_url?: string | null;
          slug?: string;
          sort_order?: number;
          summary?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_authorities_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      catalog_authority_activities: {
        Row: {
          activity_id: string;
          authority_id: string;
          catalog_version_id: string;
          created_at: string;
          eligibility_note: string | null;
          eligibility_state: string;
          id: string;
          licence_type_id: string | null;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          authority_id: string;
          catalog_version_id: string;
          created_at?: string;
          eligibility_note?: string | null;
          eligibility_state: string;
          id?: string;
          licence_type_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          activity_id?: string;
          authority_id?: string;
          catalog_version_id?: string;
          created_at?: string;
          eligibility_note?: string | null;
          eligibility_state?: string;
          id?: string;
          licence_type_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_authority_activities_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_authority_activities_authority_id_fkey';
            columns: ['authority_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_authorities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_authority_activities_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_authority_activities_licence_type_id_fkey';
            columns: ['licence_type_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_licence_types';
            referencedColumns: ['id'];
          },
        ];
      };
      catalog_licence_types: {
        Row: {
          availability: string;
          catalog_version_id: string;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          availability?: string;
          catalog_version_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          availability?: string;
          catalog_version_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_licence_types_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      catalog_package_prices: {
        Row: {
          amount_minor: number | null;
          catalog_version_id: string;
          created_at: string;
          currency: string;
          effective_from: string;
          effective_to: string | null;
          exclusions: string[];
          id: string;
          inclusions: string[];
          package_id: string;
          price_state: string;
          recurrence: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor?: number | null;
          catalog_version_id: string;
          created_at?: string;
          currency?: string;
          effective_from: string;
          effective_to?: string | null;
          exclusions?: string[];
          id?: string;
          inclusions?: string[];
          package_id: string;
          price_state: string;
          recurrence: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          amount_minor?: number | null;
          catalog_version_id?: string;
          created_at?: string;
          currency?: string;
          effective_from?: string;
          effective_to?: string | null;
          exclusions?: string[];
          id?: string;
          inclusions?: string[];
          package_id?: string;
          price_state?: string;
          recurrence?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_package_prices_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_package_prices_package_id_fkey';
            columns: ['package_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_packages';
            referencedColumns: ['id'];
          },
        ];
      };
      catalog_packages: {
        Row: {
          authority_id: string;
          availability: string;
          catalog_version_id: string;
          created_at: string;
          id: string;
          licence_type_id: string | null;
          name: string;
          slug: string;
          sort_order: number;
          summary: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          authority_id: string;
          availability?: string;
          catalog_version_id: string;
          created_at?: string;
          id?: string;
          licence_type_id?: string | null;
          name: string;
          slug: string;
          sort_order?: number;
          summary?: string | null;
          updated_at?: string;
        };
        Update: {
          authority_id?: string;
          availability?: string;
          catalog_version_id?: string;
          created_at?: string;
          id?: string;
          licence_type_id?: string | null;
          name?: string;
          slug?: string;
          sort_order?: number;
          summary?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_packages_authority_id_fkey';
            columns: ['authority_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_authorities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_packages_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_packages_licence_type_id_fkey';
            columns: ['licence_type_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_licence_types';
            referencedColumns: ['id'];
          },
        ];
      };
      catalog_sources: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          code: string;
          created_at: string;
          id: string;
          name: string;
          source_owner: string;
          source_url: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          code: string;
          created_at?: string;
          id?: string;
          name: string;
          source_owner: string;
          source_url?: string | null;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          code?: string;
          created_at?: string;
          id?: string;
          name?: string;
          source_owner?: string;
          source_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_sources_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      catalog_versions: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          created_by: string | null;
          effective_from: string;
          effective_to: string | null;
          id: string;
          published_at: string | null;
          source_id: string;
          status: string;
          supersedes_id: string | null;
          updated_at: string;
          version_key: string;
          version_number: number;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          effective_from: string;
          effective_to?: string | null;
          id?: string;
          published_at?: string | null;
          source_id: string;
          status?: string;
          supersedes_id?: string | null;
          updated_at?: string;
          version_key: string;
          version_number: number;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          published_at?: string | null;
          source_id?: string;
          status?: string;
          supersedes_id?: string | null;
          updated_at?: string;
          version_key?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_versions_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_versions_source_id_fkey';
            columns: ['source_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_versions_supersedes_id_fkey';
            columns: ['supersedes_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      cms_pages: {
        Row: {
          background_image_media_id: string | null;
          canonical_url: string | null;
          content_html: string;
          content_json: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          excerpt: string | null;
          hero_settings: NonNullable<Json>;
          id: string;
          meta_description: string | null;
          meta_title: string | null;
          noindex: boolean;
          published_at: string | null;
          row_version: number;
          scheduled_for: string | null;
          schema_markup: NonNullable<Json>;
          script_body_end: string | null;
          script_body_start: string | null;
          script_head: string | null;
          slug: string;
          status: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          background_image_media_id?: string | null;
          canonical_url?: string | null;
          content_html?: string;
          content_json?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          excerpt?: string | null;
          hero_settings?: NonNullable<Json>;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          noindex?: boolean;
          published_at?: string | null;
          row_version?: number;
          scheduled_for?: string | null;
          schema_markup?: NonNullable<Json>;
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
          content_json?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          excerpt?: string | null;
          hero_settings?: NonNullable<Json>;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          noindex?: boolean;
          published_at?: string | null;
          row_version?: number;
          scheduled_for?: string | null;
          schema_markup?: NonNullable<Json>;
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
        ComputedFields: never;
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
      company_message_template_overrides: {
        Row: {
          body_template: string | null;
          channel: string;
          company_id: string;
          created_at: string;
          enabled: boolean;
          subject_template: string | null;
          template_key: string;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          body_template?: string | null;
          channel: string;
          company_id: string;
          created_at?: string;
          enabled?: boolean;
          subject_template?: string | null;
          template_key: string;
          tenant_id: string;
          updated_at?: string;
          version: number;
        };
        Update: {
          body_template?: string | null;
          channel?: string;
          company_id?: string;
          created_at?: string;
          enabled?: boolean;
          subject_template?: string | null;
          template_key?: string;
          tenant_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'company_message_template_overrides_company_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'company_message_template_overrides_template_fkey';
            columns: ['template_key', 'version', 'channel'];
            isOneToOne: false;
            referencedRelation: 'message_template_versions';
            referencedColumns: ['template_key', 'version', 'channel'];
          },
          {
            foreignKeyName: 'company_message_template_overrides_tenant_id_fkey';
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
        ComputedFields: never;
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
          result: NonNullable<Json>;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          committed_version: number;
          company_id: string;
          created_at?: string;
          operation_id: string;
          operation_kind: string;
          payload_hash: string;
          result: NonNullable<Json>;
          tenant_id: string;
        };
        Update: {
          committed_version?: number;
          company_id?: string;
          created_at?: string;
          operation_id?: string;
          operation_kind?: string;
          payload_hash?: string;
          result?: NonNullable<Json>;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
      company_registrations: {
        Row: {
          company_id: string;
          completed_at: string | null;
          created_at: string;
          current_stage: Database['public']['Enums']['registration_stage_code'];
          id: string;
          service_case_id: string;
          started_at: string | null;
          status: Database['public']['Enums']['registration_status'];
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          current_stage?: Database['public']['Enums']['registration_stage_code'];
          id?: string;
          service_case_id: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['registration_status'];
          tenant_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          current_stage?: Database['public']['Enums']['registration_stage_code'];
          id?: string;
          service_case_id?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['registration_status'];
          tenant_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'company_registrations_company_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'company_registrations_service_case_fk';
            columns: ['tenant_id', 'company_id', 'service_case_id'];
            isOneToOne: false;
            referencedRelation: 'service_cases';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'company_registrations_service_case_fk';
            columns: ['tenant_id', 'company_id', 'service_case_id'];
            isOneToOne: false;
            referencedRelation: 'service_cases_ranked';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
        ];
      };
      company_settings_operations: {
        Row: {
          created_at: string;
          operation_id: string;
          payload_digest: string;
          result: NonNullable<Json>;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          operation_id: string;
          payload_digest: string;
          result: NonNullable<Json>;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          operation_id?: string;
          payload_digest?: string;
          result?: NonNullable<Json>;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'company_settings_operations_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      company_settings_versions: {
        Row: {
          section: string;
          tenant_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          section: string;
          tenant_id: string;
          version?: number;
        };
        Update: {
          section?: string;
          tenant_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'company_settings_versions_tenant_id_fkey';
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
        ComputedFields: never;
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
        ComputedFields: never;
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
      content_audit_events: {
        Row: {
          action: string;
          actor_id: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          metadata: NonNullable<Json>;
          next_version: number | null;
          operation_id: string;
          previous_version: number | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          metadata?: NonNullable<Json>;
          next_version?: number | null;
          operation_id: string;
          previous_version?: number | null;
        };
        Update: {
          action?: string;
          actor_id?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          next_version?: number | null;
          operation_id?: string;
          previous_version?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'content_audit_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      content_operation_receipts: {
        Row: {
          actor_id: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          operation_id: string;
          operation_kind: string;
          request_hash: string;
          result: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          operation_id: string;
          operation_kind: string;
          request_hash: string;
          result?: NonNullable<Json>;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          operation_id?: string;
          operation_kind?: string;
          request_hash?: string;
          result?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'content_operation_receipts_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      cost_data: {
        Row: {
          active: boolean;
          activity_key: string | null;
          amount_minor: number;
          authority: string;
          catalog_authority_id: string | null;
          catalog_version_id: string | null;
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
          row_version: number;
          source_id: string | null;
          timeline_max_days: number;
          timeline_min_days: number;
          updated_at: string;
          valid_from: string;
          valid_to: string | null;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          activity_key?: string | null;
          amount_minor: number;
          authority: string;
          catalog_authority_id?: string | null;
          catalog_version_id?: string | null;
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
          row_version?: number;
          source_id?: string | null;
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
          catalog_authority_id?: string | null;
          catalog_version_id?: string | null;
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
          row_version?: number;
          source_id?: string | null;
          timeline_max_days?: number;
          timeline_min_days?: number;
          updated_at?: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cost_data_catalog_authority_id_fkey';
            columns: ['catalog_authority_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_authorities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cost_data_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cost_data_source_id_fkey';
            columns: ['source_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_sources';
            referencedColumns: ['id'];
          },
        ];
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
        ComputedFields: never;
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
      data_access_events: {
        Row: {
          actor_id: string | null;
          company_id: string | null;
          correlation_id: string;
          created_at: string;
          event_name: string;
          event_version: number;
          id: string;
          operation_id: string;
          outcome: string;
          reason_code: string;
          resource_type: string;
          safe_metadata: NonNullable<Json>;
          source_class: string;
          target_opaque_id: string | null;
          tenant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          company_id?: string | null;
          correlation_id: string;
          created_at?: string;
          event_name: string;
          event_version?: number;
          id?: string;
          operation_id: string;
          outcome: string;
          reason_code: string;
          resource_type: string;
          safe_metadata?: NonNullable<Json>;
          source_class: string;
          target_opaque_id?: string | null;
          tenant_id?: string | null;
        };
        Update: {
          actor_id?: string | null;
          company_id?: string | null;
          correlation_id?: string;
          created_at?: string;
          event_name?: string;
          event_version?: number;
          id?: string;
          operation_id?: string;
          outcome?: string;
          reason_code?: string;
          resource_type?: string;
          safe_metadata?: NonNullable<Json>;
          source_class?: string;
          target_opaque_id?: string | null;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'data_access_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'data_access_events_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'data_access_events_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      document_access_audit: {
        Row: {
          actor_id: string | null;
          classification: string;
          company_id: string | null;
          document_id: string | null;
          event: string;
          expires_at: string | null;
          id: string;
          occurred_at: string;
          operation_id: string | null;
          phase: string;
          request_id: string | null;
          sha256: string | null;
          signing_lifetime_seconds: number | null;
          tenant_id: string | null;
          version_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          classification: string;
          company_id?: string | null;
          document_id?: string | null;
          event: string;
          expires_at?: string | null;
          id?: string;
          occurred_at?: string;
          operation_id?: string | null;
          phase: string;
          request_id?: string | null;
          sha256?: string | null;
          signing_lifetime_seconds?: number | null;
          tenant_id?: string | null;
          version_id?: string | null;
        };
        Update: {
          actor_id?: string | null;
          classification?: string;
          company_id?: string | null;
          document_id?: string | null;
          event?: string;
          expires_at?: string | null;
          id?: string;
          occurred_at?: string;
          operation_id?: string | null;
          phase?: string;
          request_id?: string | null;
          sha256?: string | null;
          signing_lifetime_seconds?: number | null;
          tenant_id?: string | null;
          version_id?: string | null;
        };
        Relationships: [];
      };
      document_lifecycle_audit: {
        Row: {
          actor_id: string | null;
          actor_kind: string;
          classification: string;
          cleanup_fence: string | null;
          company_id: string;
          document_id: string;
          event: string;
          id: string;
          occurred_at: string;
          operation_id: string;
          request_id: string | null;
          sha256: string;
          tenant_id: string;
          version_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          actor_kind?: string;
          classification: string;
          cleanup_fence?: string | null;
          company_id: string;
          document_id: string;
          event: string;
          id?: string;
          occurred_at?: string;
          operation_id: string;
          request_id?: string | null;
          sha256: string;
          tenant_id: string;
          version_id: string;
        };
        Update: {
          actor_id?: string | null;
          actor_kind?: string;
          classification?: string;
          cleanup_fence?: string | null;
          company_id?: string;
          document_id?: string;
          event?: string;
          id?: string;
          occurred_at?: string;
          operation_id?: string;
          request_id?: string | null;
          sha256?: string;
          tenant_id?: string;
          version_id?: string;
        };
        Relationships: [];
      };
      document_request_batch_operations: {
        Row: {
          actor_id: string;
          company_id: string;
          created_at: string;
          operation_id: string;
          request_fingerprint: string;
          request_ids: NonNullable<Json>;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          company_id: string;
          created_at?: string;
          operation_id: string;
          request_fingerprint: string;
          request_ids: NonNullable<Json>;
          tenant_id: string;
        };
        Update: {
          actor_id?: string;
          company_id?: string;
          created_at?: string;
          operation_id?: string;
          request_fingerprint?: string;
          request_ids?: NonNullable<Json>;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_request_batch_operations_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_request_batch_operations_company_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'document_request_batch_operations_tenant_fk';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      document_requests: {
        Row: {
          company_id: string;
          created_at: string;
          custom_type_label: string | null;
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
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          custom_type_label?: string | null;
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
          custom_type_label?: string | null;
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
      document_upload_operations: {
        Row: {
          actor_id: string;
          cleanup_authorized: boolean;
          cleanup_completed_at: string | null;
          cleanup_fence: string | null;
          cleanup_hold: boolean;
          cleanup_lease_until: string | null;
          committed_receipt: Json | null;
          company_id: string;
          deadline_at: string;
          doc_type: string;
          document_id: string;
          employee_id: string | null;
          expected_head: string | null;
          extension: string;
          finalized_at: string | null;
          input_document_id: string | null;
          label: string | null;
          mime_type: string;
          object_id: string;
          operation_id: string;
          payload_fingerprint: string;
          prepared_at: string;
          request_id: string | null;
          reserved_version_id: string;
          safe_filename: string;
          scan_completed_at: string | null;
          scan_provider: string | null;
          sha256: string;
          size_bytes: number;
          state: string;
          storage_path: string;
          tenant_id: string;
          _document_upload_cleanup_unreferenced: undefined | null;
          _document_upload_provider_identity: Json | null;
        };
        ComputedFields:
          | '_document_upload_cleanup_unreferenced'
          | '_document_upload_provider_identity';
        Insert: {
          actor_id: string;
          cleanup_authorized?: boolean;
          cleanup_completed_at?: string | null;
          cleanup_fence?: string | null;
          cleanup_hold?: boolean;
          cleanup_lease_until?: string | null;
          committed_receipt?: Json | null;
          company_id: string;
          deadline_at: string;
          doc_type: string;
          document_id: string;
          employee_id?: string | null;
          expected_head?: string | null;
          extension: string;
          finalized_at?: string | null;
          input_document_id?: string | null;
          label?: string | null;
          mime_type: string;
          object_id: string;
          operation_id: string;
          payload_fingerprint: string;
          prepared_at?: string;
          request_id?: string | null;
          reserved_version_id: string;
          safe_filename: string;
          scan_completed_at?: string | null;
          scan_provider?: string | null;
          sha256: string;
          size_bytes: number;
          state?: string;
          storage_path: string;
          tenant_id: string;
        };
        Update: {
          actor_id?: string;
          cleanup_authorized?: boolean;
          cleanup_completed_at?: string | null;
          cleanup_fence?: string | null;
          cleanup_hold?: boolean;
          cleanup_lease_until?: string | null;
          committed_receipt?: Json | null;
          company_id?: string;
          deadline_at?: string;
          doc_type?: string;
          document_id?: string;
          employee_id?: string | null;
          expected_head?: string | null;
          extension?: string;
          finalized_at?: string | null;
          input_document_id?: string | null;
          label?: string | null;
          mime_type?: string;
          object_id?: string;
          operation_id?: string;
          payload_fingerprint?: string;
          prepared_at?: string;
          request_id?: string | null;
          reserved_version_id?: string;
          safe_filename?: string;
          scan_completed_at?: string | null;
          scan_provider?: string | null;
          sha256?: string;
          size_bytes?: number;
          state?: string;
          storage_path?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_upload_company_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'document_upload_employee_fk';
            columns: ['tenant_id', 'company_id', 'employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'document_upload_operations_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_upload_request_fk';
            columns: ['tenant_id', 'company_id', 'request_id'];
            isOneToOne: false;
            referencedRelation: 'document_requests';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
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
          upload_operation_id: string | null;
          uploaded_by: string | null;
        };
        ComputedFields: never;
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
          upload_operation_id?: string | null;
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
          upload_operation_id?: string | null;
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
            foreignKeyName: 'document_versions_upload_operation_fk';
            columns: ['upload_operation_id', 'tenant_id', 'document_id', 'id'];
            isOneToOne: false;
            referencedRelation: 'document_upload_operations';
            referencedColumns: ['operation_id', 'tenant_id', 'document_id', 'reserved_version_id'];
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
        ComputedFields: never;
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
      domain_events: {
        Row: {
          actor_id: string | null;
          causation_id: string | null;
          company_id: string | null;
          correlation_id: string;
          created_at: string;
          dedupe_key: string;
          event_type: string;
          event_version: number;
          id: string;
          occurred_at: string;
          payload: NonNullable<Json>;
          privacy_class: string;
          tenant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          causation_id?: string | null;
          company_id?: string | null;
          correlation_id: string;
          created_at?: string;
          dedupe_key: string;
          event_type: string;
          event_version: number;
          id: string;
          occurred_at: string;
          payload: NonNullable<Json>;
          privacy_class: string;
          tenant_id?: string | null;
        };
        Update: {
          actor_id?: string | null;
          causation_id?: string | null;
          company_id?: string | null;
          correlation_id?: string;
          created_at?: string;
          dedupe_key?: string;
          event_type?: string;
          event_version?: number;
          id?: string;
          occurred_at?: string;
          payload?: NonNullable<Json>;
          privacy_class?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'domain_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'domain_events_tenant_company_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'domain_events_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      employee_audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          changed_fields: string[];
          company_id: string;
          created_at: string;
          employee_id: string;
          id: string;
          import_job_id: string | null;
          operation_id: string | null;
          tenant_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          changed_fields?: string[];
          company_id: string;
          created_at?: string;
          employee_id: string;
          id?: string;
          import_job_id?: string | null;
          operation_id?: string | null;
          tenant_id: string;
          version: number;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          changed_fields?: string[];
          company_id?: string;
          created_at?: string;
          employee_id?: string;
          id?: string;
          import_job_id?: string | null;
          operation_id?: string | null;
          tenant_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'employee_audit_employee_fk';
            columns: ['tenant_id', 'company_id', 'employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'employee_audit_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
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
          version: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          employee_id: string;
          id?: string;
          profile_id: string;
          renewal_reminders_enabled?: boolean;
          tenant_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          employee_id?: string;
          id?: string;
          profile_id?: string;
          renewal_reminders_enabled?: boolean;
          tenant_id?: string;
          updated_at?: string;
          version?: number;
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
          deactivated_at: string | null;
          eid_expiry: string | null;
          email: string | null;
          emirates_id_encrypted: string | null;
          emirates_id_last4: string | null;
          emirates_id_last4_source: string | null;
          id: string;
          job_title: string | null;
          name: string;
          nationality: string | null;
          passport_no_encrypted: string | null;
          passport_no_hash: string | null;
          passport_no_last4: string | null;
          passport_no_last4_source: string | null;
          phone: string | null;
          profile_id: string | null;
          status: Database['public']['Enums']['employee_status'];
          tenant_id: string;
          updated_at: string;
          version: number;
          visa_expiry: string | null;
          visa_no_encrypted: string | null;
          visa_no_last4: string | null;
          visa_no_last4_source: string | null;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          deactivated_at?: string | null;
          eid_expiry?: string | null;
          email?: string | null;
          emirates_id_encrypted?: string | null;
          emirates_id_last4?: string | null;
          emirates_id_last4_source?: string | null;
          id?: string;
          job_title?: string | null;
          name: string;
          nationality?: string | null;
          passport_no_encrypted?: string | null;
          passport_no_hash?: string | null;
          passport_no_last4?: string | null;
          passport_no_last4_source?: string | null;
          phone?: string | null;
          profile_id?: string | null;
          status?: Database['public']['Enums']['employee_status'];
          tenant_id: string;
          updated_at?: string;
          version?: number;
          visa_expiry?: string | null;
          visa_no_encrypted?: string | null;
          visa_no_last4?: string | null;
          visa_no_last4_source?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          deactivated_at?: string | null;
          eid_expiry?: string | null;
          email?: string | null;
          emirates_id_encrypted?: string | null;
          emirates_id_last4?: string | null;
          emirates_id_last4_source?: string | null;
          id?: string;
          job_title?: string | null;
          name?: string;
          nationality?: string | null;
          passport_no_encrypted?: string | null;
          passport_no_hash?: string | null;
          passport_no_last4?: string | null;
          passport_no_last4_source?: string | null;
          phone?: string | null;
          profile_id?: string | null;
          status?: Database['public']['Enums']['employee_status'];
          tenant_id?: string;
          updated_at?: string;
          version?: number;
          visa_expiry?: string | null;
          visa_no_encrypted?: string | null;
          visa_no_last4?: string | null;
          visa_no_last4_source?: string | null;
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
          anonymization_diff: NonNullable<Json>;
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
        ComputedFields: never;
        Insert: {
          anonymization_diff?: NonNullable<Json>;
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
          anonymization_diff?: NonNullable<Json>;
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
      erasure_legal_holds: {
        Row: {
          active: boolean;
          id: string;
          placed_at: string;
          placed_by: string;
          reason_code: string;
          released_at: string | null;
          released_by: string | null;
          request_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          id?: string;
          placed_at?: string;
          placed_by: string;
          reason_code: string;
          released_at?: string | null;
          released_by?: string | null;
          request_id: string;
        };
        Update: {
          active?: boolean;
          id?: string;
          placed_at?: string;
          placed_by?: string;
          reason_code?: string;
          released_at?: string | null;
          released_by?: string | null;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'erasure_legal_holds_placed_by_fkey';
            columns: ['placed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'erasure_legal_holds_released_by_fkey';
            columns: ['released_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'erasure_legal_holds_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'erasure_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      erasure_requests: {
        Row: {
          anonymization_diff: Json | null;
          completed_at: string | null;
          created_at: string;
          decision_operation_id: string | null;
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
          verification_expires_at: string | null;
          verification_sent_at: string | null;
          verification_token_hash: string | null;
          verified_at: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          anonymization_diff?: Json | null;
          completed_at?: string | null;
          created_at?: string;
          decision_operation_id?: string | null;
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
          verification_expires_at?: string | null;
          verification_sent_at?: string | null;
          verification_token_hash?: string | null;
          verified_at?: string | null;
          version?: number;
        };
        Update: {
          anonymization_diff?: Json | null;
          completed_at?: string | null;
          created_at?: string;
          decision_operation_id?: string | null;
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
          verification_expires_at?: string | null;
          verification_sent_at?: string | null;
          verification_token_hash?: string | null;
          verified_at?: string | null;
          version?: number;
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
      event_consumer_registrations: {
        Row: {
          consumer_name: string;
          created_at: string;
          default_lease_seconds: number;
          enabled: boolean;
          event_type: string;
          event_version: number;
          max_attempts: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          consumer_name: string;
          created_at?: string;
          default_lease_seconds?: number;
          enabled?: boolean;
          event_type: string;
          event_version: number;
          max_attempts?: number;
          updated_at?: string;
        };
        Update: {
          consumer_name?: string;
          created_at?: string;
          default_lease_seconds?: number;
          enabled?: boolean;
          event_type?: string;
          event_version?: number;
          max_attempts?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_consumer_contract_fkey';
            columns: ['event_type', 'event_version'];
            isOneToOne: false;
            referencedRelation: 'event_contract_registrations';
            referencedColumns: ['event_type', 'event_version'];
          },
        ];
      };
      event_contract_registrations: {
        Row: {
          created_at: string;
          event_type: string;
          event_version: number;
          payload_schema: NonNullable<Json>;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_type: string;
          event_version: number;
          payload_schema: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          event_version?: number;
          payload_schema?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [];
      };
      event_job_attempts: {
        Row: {
          attempt_number: number;
          effect_reference_hash: string | null;
          error_category: string | null;
          error_code: string | null;
          id: number;
          job_id: string;
          lease_token: string | null;
          occurred_at: string;
          transition: string;
          worker_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          attempt_number: number;
          effect_reference_hash?: string | null;
          error_category?: string | null;
          error_code?: string | null;
          id?: never;
          job_id: string;
          lease_token?: string | null;
          occurred_at?: string;
          transition: string;
          worker_id?: string | null;
        };
        Update: {
          attempt_number?: number;
          effect_reference_hash?: string | null;
          error_category?: string | null;
          error_code?: string | null;
          id?: never;
          job_id?: string;
          lease_token?: string | null;
          occurred_at?: string;
          transition?: string;
          worker_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'event_job_attempts_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'event_jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      event_jobs: {
        Row: {
          attempts: number;
          available_at: string;
          cancelled_at: string | null;
          consumer_name: string;
          created_at: string;
          dead_at: string | null;
          effect_key: string | null;
          effect_reference_hash: string | null;
          event_id: string;
          id: string;
          last_error_category: string | null;
          last_error_code: string | null;
          lease_expires_at: string | null;
          lease_owner: string | null;
          lease_token: string | null;
          max_attempts: number;
          replay_of_job_id: string | null;
          replay_request_id: string | null;
          state: string;
          succeeded_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          available_at?: string;
          cancelled_at?: string | null;
          consumer_name: string;
          created_at?: string;
          dead_at?: string | null;
          effect_key?: never;
          effect_reference_hash?: string | null;
          event_id: string;
          id?: string;
          last_error_category?: string | null;
          last_error_code?: string | null;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          lease_token?: string | null;
          max_attempts: number;
          replay_of_job_id?: string | null;
          replay_request_id?: string | null;
          state?: string;
          succeeded_at?: string | null;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          available_at?: string;
          cancelled_at?: string | null;
          consumer_name?: string;
          created_at?: string;
          dead_at?: string | null;
          effect_key?: never;
          effect_reference_hash?: string | null;
          event_id?: string;
          id?: string;
          last_error_category?: string | null;
          last_error_code?: string | null;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          lease_token?: string | null;
          max_attempts?: number;
          replay_of_job_id?: string | null;
          replay_request_id?: string | null;
          state?: string;
          succeeded_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_jobs_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'domain_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_jobs_replay_of_job_id_fkey';
            columns: ['replay_of_job_id'];
            isOneToOne: false;
            referencedRelation: 'event_jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_jobs_replay_request_fkey';
            columns: ['replay_request_id'];
            isOneToOne: false;
            referencedRelation: 'event_replay_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      event_replay_requests: {
        Row: {
          id: string;
          operation_id: string;
          reason: string;
          replay_job_id: string;
          requested_at: string;
          requested_by: string;
          source_job_id: string;
        };
        ComputedFields: never;
        Insert: {
          id: string;
          operation_id: string;
          reason: string;
          replay_job_id: string;
          requested_at?: string;
          requested_by: string;
          source_job_id: string;
        };
        Update: {
          id?: string;
          operation_id?: string;
          reason?: string;
          replay_job_id?: string;
          requested_at?: string;
          requested_by?: string;
          source_job_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_replay_requests_replay_job_fkey';
            columns: ['replay_job_id'];
            isOneToOne: true;
            referencedRelation: 'event_jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_replay_requests_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_replay_requests_source_job_id_fkey';
            columns: ['source_job_id'];
            isOneToOne: false;
            referencedRelation: 'event_jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      event_worker_heartbeats: {
        Row: {
          consumer_name: string;
          created_at: string;
          heartbeat_at: string;
          release_version: string;
          scheduler_owner: string;
          started_at: string;
          updated_at: string;
          worker_id: string;
          worker_name: string;
        };
        ComputedFields: never;
        Insert: {
          consumer_name: string;
          created_at?: string;
          heartbeat_at: string;
          release_version: string;
          scheduler_owner: string;
          started_at: string;
          updated_at?: string;
          worker_id: string;
          worker_name: string;
        };
        Update: {
          consumer_name?: string;
          created_at?: string;
          heartbeat_at?: string;
          release_version?: string;
          scheduler_owner?: string;
          started_at?: string;
          updated_at?: string;
          worker_id?: string;
          worker_name?: string;
        };
        Relationships: [];
      };
      finance_audit_log: {
        Row: {
          action: string;
          actor_id: string;
          company_id: string;
          created_at: string;
          details: NonNullable<Json>;
          id: string;
          operation_receipt_id: string;
          resource_id: string;
          resource_kind: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id: string;
          company_id: string;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: string;
          operation_receipt_id: string;
          resource_id: string;
          resource_kind: string;
          tenant_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string;
          company_id?: string;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: string;
          operation_receipt_id?: string;
          resource_id?: string;
          resource_kind?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_audit_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_audit_log_company_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'finance_audit_log_receipt_fk';
            columns: ['tenant_id', 'company_id', 'operation_receipt_id'];
            isOneToOne: false;
            referencedRelation: 'finance_operation_receipts';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
        ];
      };
      finance_credit_notes: {
        Row: {
          amount_minor: number;
          company_id: string;
          currency: string;
          id: string;
          invoice_id: string;
          issued_at: string;
          operation_receipt_id: string;
          reason: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          company_id: string;
          currency: string;
          id?: string;
          invoice_id: string;
          issued_at?: string;
          operation_receipt_id: string;
          reason: string;
          tenant_id: string;
        };
        Update: {
          amount_minor?: number;
          company_id?: string;
          currency?: string;
          id?: string;
          invoice_id?: string;
          issued_at?: string;
          operation_receipt_id?: string;
          reason?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_credit_notes_currency_fkey';
            columns: ['currency'];
            isOneToOne: false;
            referencedRelation: 'finance_currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'finance_credit_notes_invoice_fk';
            columns: ['tenant_id', 'company_id', 'invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'finance_credit_notes_receipt_fk';
            columns: ['tenant_id', 'company_id', 'operation_receipt_id'];
            isOneToOne: false;
            referencedRelation: 'finance_operation_receipts';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
        ];
      };
      finance_currencies: {
        Row: {
          code: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
        };
        Update: {
          code?: string;
        };
        Relationships: [];
      };
      finance_expenses: {
        Row: {
          amount_minor: number;
          company_id: string;
          created_at: string;
          created_by: string;
          currency: string;
          description: string;
          id: string;
          operation_receipt_id: string;
          posted_journal_id: string | null;
          source_reference: string;
          state: string;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          company_id: string;
          created_at?: string;
          created_by: string;
          currency: string;
          description: string;
          id?: string;
          operation_receipt_id: string;
          posted_journal_id?: string | null;
          source_reference: string;
          state?: string;
          tenant_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          amount_minor?: number;
          company_id?: string;
          created_at?: string;
          created_by?: string;
          currency?: string;
          description?: string;
          id?: string;
          operation_receipt_id?: string;
          posted_journal_id?: string | null;
          source_reference?: string;
          state?: string;
          tenant_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_expenses_company_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'finance_expenses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_expenses_currency_fkey';
            columns: ['currency'];
            isOneToOne: false;
            referencedRelation: 'finance_currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'finance_expenses_posted_journal_fk';
            columns: ['tenant_id', 'company_id', 'currency', 'posted_journal_id'];
            isOneToOne: false;
            referencedRelation: 'finance_journals';
            referencedColumns: ['tenant_id', 'company_id', 'currency', 'id'];
          },
          {
            foreignKeyName: 'finance_expenses_receipt_fk';
            columns: ['tenant_id', 'company_id', 'operation_receipt_id'];
            isOneToOne: false;
            referencedRelation: 'finance_operation_receipts';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
        ];
      };
      finance_journal_entries: {
        Row: {
          account_code: string;
          created_at: string;
          credit_minor: number;
          currency: string;
          debit_minor: number;
          id: string;
          journal_id: string;
          line_number: number;
        };
        ComputedFields: never;
        Insert: {
          account_code: string;
          created_at?: string;
          credit_minor?: number;
          currency: string;
          debit_minor?: number;
          id?: string;
          journal_id: string;
          line_number: number;
        };
        Update: {
          account_code?: string;
          created_at?: string;
          credit_minor?: number;
          currency?: string;
          debit_minor?: number;
          id?: string;
          journal_id?: string;
          line_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_journal_entries_currency_fkey';
            columns: ['currency'];
            isOneToOne: false;
            referencedRelation: 'finance_currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'finance_journal_entries_journal_currency_fk';
            columns: ['journal_id', 'currency'];
            isOneToOne: false;
            referencedRelation: 'finance_journals';
            referencedColumns: ['id', 'currency'];
          },
        ];
      };
      finance_journals: {
        Row: {
          accounting_at: string;
          company_id: string;
          created_at: string;
          currency: string;
          id: string;
          operation_receipt_id: string;
          posted_at: string | null;
          source_category: string | null;
          source_id: string;
          source_kind: string;
          state: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          accounting_at: string;
          company_id: string;
          created_at?: string;
          currency: string;
          id?: string;
          operation_receipt_id: string;
          posted_at?: string | null;
          source_category?: never;
          source_id: string;
          source_kind: string;
          state?: string;
          tenant_id: string;
        };
        Update: {
          accounting_at?: string;
          company_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          operation_receipt_id?: string;
          posted_at?: string | null;
          source_category?: never;
          source_id?: string;
          source_kind?: string;
          state?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_journals_company_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'finance_journals_currency_fkey';
            columns: ['currency'];
            isOneToOne: false;
            referencedRelation: 'finance_currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'finance_journals_receipt_fk';
            columns: ['tenant_id', 'company_id', 'operation_receipt_id'];
            isOneToOne: false;
            referencedRelation: 'finance_operation_receipts';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
        ];
      };
      finance_operation_receipts: {
        Row: {
          actor_id: string;
          aggregate_id: string;
          aggregate_kind: string;
          committed_at: string;
          committed_version: number;
          company_id: string;
          expected_version: number;
          id: string;
          operation_id: string;
          payload_hash: string;
          sanitized_result: NonNullable<Json>;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          aggregate_id: string;
          aggregate_kind: string;
          committed_at?: string;
          committed_version: number;
          company_id: string;
          expected_version: number;
          id?: string;
          operation_id: string;
          payload_hash: string;
          sanitized_result: NonNullable<Json>;
          tenant_id: string;
        };
        Update: {
          actor_id?: string;
          aggregate_id?: string;
          aggregate_kind?: string;
          committed_at?: string;
          committed_version?: number;
          company_id?: string;
          expected_version?: number;
          id?: string;
          operation_id?: string;
          payload_hash?: string;
          sanitized_result?: NonNullable<Json>;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_operation_receipts_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_operation_receipts_company_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
        ];
      };
      finance_receipt_snapshots: {
        Row: {
          captured_at: string;
          company_id: string;
          invoice_id: string;
          operation_receipt_id: string;
          receipt_id: string;
          receipt_kind: string;
          snapshot: NonNullable<Json>;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          captured_at?: string;
          company_id: string;
          invoice_id: string;
          operation_receipt_id: string;
          receipt_id: string;
          receipt_kind: string;
          snapshot: NonNullable<Json>;
          tenant_id: string;
        };
        Update: {
          captured_at?: string;
          company_id?: string;
          invoice_id?: string;
          operation_receipt_id?: string;
          receipt_id?: string;
          receipt_kind?: string;
          snapshot?: NonNullable<Json>;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_receipt_snapshots_tenant_id_company_id_invoice_id_fkey';
            columns: ['tenant_id', 'company_id', 'invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'finance_receipt_snapshots_tenant_id_company_id_operation_r_fkey';
            columns: ['tenant_id', 'company_id', 'operation_receipt_id'];
            isOneToOne: false;
            referencedRelation: 'finance_operation_receipts';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
        ];
      };
      inbound_destination_provisioning_receipts: {
        Row: {
          created_at: string;
          destination_id: string;
          enabled: boolean;
          operation_id: string;
          request_hash: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          destination_id: string;
          enabled: boolean;
          operation_id: string;
          request_hash: string;
        };
        Update: {
          created_at?: string;
          destination_id?: string;
          enabled?: boolean;
          operation_id?: string;
          request_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inbound_destination_provisioning_receipts_destination_id_fkey';
            columns: ['destination_id'];
            isOneToOne: false;
            referencedRelation: 'inbound_destinations';
            referencedColumns: ['id'];
          },
        ];
      };
      inbound_destinations: {
        Row: {
          company_id: string | null;
          created_at: string;
          destination_key_hash: string;
          enabled: boolean;
          id: string;
          provider: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          company_id?: string | null;
          created_at?: string;
          destination_key_hash: string;
          enabled?: boolean;
          id?: string;
          provider: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          destination_key_hash?: string;
          enabled?: boolean;
          id?: string;
          provider?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inbound_destinations_tenant_company_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'inbound_destinations_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      inbound_webhook_receipts: {
        Row: {
          channel: string | null;
          destination_id: string;
          error_category: string | null;
          error_code: string | null;
          id: string;
          inbox_id: number | null;
          inbox_received_at: string | null;
          occurred_at: string;
          payload_hash: string;
          processed_at: string | null;
          provider: string;
          provider_event_id_hash: string;
          received_at: string;
          status: string;
          tenant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          channel?: string | null;
          destination_id: string;
          error_category?: string | null;
          error_code?: string | null;
          id?: string;
          inbox_id?: number | null;
          inbox_received_at?: string | null;
          occurred_at: string;
          payload_hash: string;
          processed_at?: string | null;
          provider: string;
          provider_event_id_hash: string;
          received_at?: string;
          status?: string;
          tenant_id?: string | null;
        };
        Update: {
          channel?: string | null;
          destination_id?: string;
          error_category?: string | null;
          error_code?: string | null;
          id?: string;
          inbox_id?: number | null;
          inbox_received_at?: string | null;
          occurred_at?: string;
          payload_hash?: string;
          processed_at?: string | null;
          provider?: string;
          provider_event_id_hash?: string;
          received_at?: string;
          status?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inbound_webhook_receipts_destination_id_fkey';
            columns: ['destination_id'];
            isOneToOne: false;
            referencedRelation: 'inbound_destinations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inbound_webhook_receipts_tenant_id_fkey';
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
        ComputedFields: never;
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
      invoice_lines: {
        Row: {
          company_id: string;
          created_at: string;
          currency: string;
          description: string;
          discount_minor: number;
          id: string;
          invoice_id: string;
          line_number: number;
          net_minor: number;
          quantity: number;
          tax_basis: string;
          tax_category: string;
          tenant_id: string;
          total_minor: number;
          unit_amount_minor: number;
          vat_basis_points: number;
          vat_minor: number;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          currency: string;
          description: string;
          discount_minor?: number;
          id?: string;
          invoice_id: string;
          line_number: number;
          net_minor: number;
          quantity: number;
          tax_basis: string;
          tax_category: string;
          tenant_id: string;
          total_minor: number;
          unit_amount_minor: number;
          vat_basis_points: number;
          vat_minor: number;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          currency?: string;
          description?: string;
          discount_minor?: number;
          id?: string;
          invoice_id?: string;
          line_number?: number;
          net_minor?: number;
          quantity?: number;
          tax_basis?: string;
          tax_category?: string;
          tenant_id?: string;
          total_minor?: number;
          unit_amount_minor?: number;
          vat_basis_points?: number;
          vat_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_lines_currency_fkey';
            columns: ['currency'];
            isOneToOne: false;
            referencedRelation: 'finance_currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'invoice_lines_invoice_fk';
            columns: ['tenant_id', 'company_id', 'invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
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
          finalized_at: string | null;
          id: string;
          label: string;
          ledger_eligible: boolean;
          linked_entity_id: string | null;
          linked_entity_type: string | null;
          paid_at: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          version: number;
          void_reason: string | null;
          voided_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_profile_id?: string | null;
          due_at?: string | null;
          finalized_at?: string | null;
          id?: string;
          label: string;
          ledger_eligible?: boolean;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          paid_at?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          version?: number;
          void_reason?: string | null;
          voided_at?: string | null;
        };
        Update: {
          amount_minor?: number;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_profile_id?: string | null;
          due_at?: string | null;
          finalized_at?: string | null;
          id?: string;
          label?: string;
          ledger_eligible?: boolean;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          paid_at?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          version?: number;
          void_reason?: string | null;
          voided_at?: string | null;
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
          metadata: NonNullable<Json>;
          note: string | null;
          tenant_id: string | null;
          to_value: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          event_type: string;
          from_value?: string | null;
          id?: string;
          lead_id: string;
          metadata?: NonNullable<Json>;
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
          metadata?: NonNullable<Json>;
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
          consent_provenance: NonNullable<Json>;
          converted_company_id: string | null;
          created_at: string;
          email: string | null;
          estimate_data: NonNullable<Json>;
          form_data: NonNullable<Json>;
          id: string;
          intake_operation_id: string | null;
          lead_score_factors: NonNullable<Json>;
          lead_score_version: number;
          name: string;
          phone: string | null;
          routing_reason: string;
          row_version: number;
          score: number;
          source: string;
          stage: string;
          tenant_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          assigned_team_member_id?: string | null;
          consent_provenance?: NonNullable<Json>;
          converted_company_id?: string | null;
          created_at?: string;
          email?: string | null;
          estimate_data?: NonNullable<Json>;
          form_data?: NonNullable<Json>;
          id?: string;
          intake_operation_id?: string | null;
          lead_score_factors?: NonNullable<Json>;
          lead_score_version?: number;
          name: string;
          phone?: string | null;
          routing_reason: string;
          row_version?: number;
          score?: number;
          source?: string;
          stage?: string;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          assigned_team_member_id?: string | null;
          consent_provenance?: NonNullable<Json>;
          converted_company_id?: string | null;
          created_at?: string;
          email?: string | null;
          estimate_data?: NonNullable<Json>;
          form_data?: NonNullable<Json>;
          id?: string;
          intake_operation_id?: string | null;
          lead_score_factors?: NonNullable<Json>;
          lead_score_version?: number;
          name?: string;
          phone?: string | null;
          routing_reason?: string;
          row_version?: number;
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
      meeting_action_items: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          due_date: string | null;
          id: string;
          meeting_id: string;
          owner_label: string | null;
          priority: string;
          proposed_by_summary_id: string | null;
          source_quote: string | null;
          state: string;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          due_date?: string | null;
          id?: string;
          meeting_id: string;
          owner_label?: string | null;
          priority?: string;
          proposed_by_summary_id?: string | null;
          source_quote?: string | null;
          state?: string;
          title: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          due_date?: string | null;
          id?: string;
          meeting_id?: string;
          owner_label?: string | null;
          priority?: string;
          proposed_by_summary_id?: string | null;
          source_quote?: string | null;
          state?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meeting_action_items_accepted_by_fkey';
            columns: ['accepted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meeting_action_items_meeting_id_fkey';
            columns: ['meeting_id'];
            isOneToOne: false;
            referencedRelation: 'meetings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meeting_action_items_proposed_by_summary_id_fkey';
            columns: ['proposed_by_summary_id'];
            isOneToOne: false;
            referencedRelation: 'meeting_ai_summaries';
            referencedColumns: ['id'];
          },
        ];
      };
      meeting_ai_summaries: {
        Row: {
          action_items: NonNullable<Json>;
          attempts: number;
          completed_at: string | null;
          created_at: string;
          customer_visible: boolean;
          decisions: NonNullable<Json>;
          error: string | null;
          error_code: string | null;
          id: string;
          language: string | null;
          meeting_id: string;
          model: string | null;
          provider: string | null;
          risks_or_followups: NonNullable<Json>;
          status: string;
          summary_text: string | null;
          tenant_id: string;
          transcript_deleted_at: string | null;
          transcript_retain_until: string | null;
          transcript_text: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          action_items?: NonNullable<Json>;
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          customer_visible?: boolean;
          decisions?: NonNullable<Json>;
          error?: string | null;
          error_code?: string | null;
          id?: string;
          language?: string | null;
          meeting_id: string;
          model?: string | null;
          provider?: string | null;
          risks_or_followups?: NonNullable<Json>;
          status?: string;
          summary_text?: string | null;
          tenant_id: string;
          transcript_deleted_at?: string | null;
          transcript_retain_until?: string | null;
          transcript_text?: string | null;
          updated_at?: string;
        };
        Update: {
          action_items?: NonNullable<Json>;
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          customer_visible?: boolean;
          decisions?: NonNullable<Json>;
          error?: string | null;
          error_code?: string | null;
          id?: string;
          language?: string | null;
          meeting_id?: string;
          model?: string | null;
          provider?: string | null;
          risks_or_followups?: NonNullable<Json>;
          status?: string;
          summary_text?: string | null;
          tenant_id?: string;
          transcript_deleted_at?: string | null;
          transcript_retain_until?: string | null;
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
      meeting_consents: {
        Row: {
          captured_at: string;
          granted: boolean;
          meeting_id: string;
          participant_profile_id: string;
          policy_version: string;
          purpose: string;
          source: string;
          withdrawn_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          captured_at?: string;
          granted: boolean;
          meeting_id: string;
          participant_profile_id: string;
          policy_version: string;
          purpose: string;
          source: string;
          withdrawn_at?: string | null;
        };
        Update: {
          captured_at?: string;
          granted?: boolean;
          meeting_id?: string;
          participant_profile_id?: string;
          policy_version?: string;
          purpose?: string;
          source?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'meeting_consents_meeting_id_fkey';
            columns: ['meeting_id'];
            isOneToOne: false;
            referencedRelation: 'meetings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meeting_consents_participant_profile_id_fkey';
            columns: ['participant_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      meeting_notes: {
        Row: {
          author_profile_id: string;
          body: string;
          created_at: string;
          id: string;
          meeting_id: string;
          visibility: string;
        };
        ComputedFields: never;
        Insert: {
          author_profile_id: string;
          body: string;
          created_at?: string;
          id?: string;
          meeting_id: string;
          visibility: string;
        };
        Update: {
          author_profile_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          meeting_id?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meeting_notes_author_profile_id_fkey';
            columns: ['author_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meeting_notes_meeting_id_fkey';
            columns: ['meeting_id'];
            isOneToOne: false;
            referencedRelation: 'meetings';
            referencedColumns: ['id'];
          },
        ];
      };
      meeting_participants: {
        Row: {
          active: boolean;
          company_id: string;
          created_at: string;
          ends_at: string;
          meeting_id: string;
          participant_role: string;
          profile_id: string;
          starts_at: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          company_id: string;
          created_at?: string;
          ends_at: string;
          meeting_id: string;
          participant_role: string;
          profile_id: string;
          starts_at: string;
          tenant_id: string;
        };
        Update: {
          active?: boolean;
          company_id?: string;
          created_at?: string;
          ends_at?: string;
          meeting_id?: string;
          participant_role?: string;
          profile_id?: string;
          starts_at?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meeting_participants_meeting_id_fkey';
            columns: ['meeting_id'];
            isOneToOne: false;
            referencedRelation: 'meetings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meeting_participants_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meeting_participants_tenant_id_company_id_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'meeting_participants_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      meeting_provider_callback_receipts: {
        Row: {
          destination_id: string | null;
          id: string;
          occurred_at: string;
          payload_hash: string;
          provider: string;
          provider_event_id_hash: string;
          received_at: string;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          destination_id?: string | null;
          id?: string;
          occurred_at: string;
          payload_hash: string;
          provider: string;
          provider_event_id_hash: string;
          received_at?: string;
          state?: string;
        };
        Update: {
          destination_id?: string | null;
          id?: string;
          occurred_at?: string;
          payload_hash?: string;
          provider?: string;
          provider_event_id_hash?: string;
          received_at?: string;
          state?: string;
        };
        Relationships: [];
      };
      meeting_recording_versions: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          meeting_id: string;
          mime_type: string;
          provider_recording_id_hash: string;
          scan_completed_at: string;
          scan_provider: string;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          meeting_id: string;
          mime_type: string;
          provider_recording_id_hash: string;
          scan_completed_at: string;
          scan_provider: string;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          tenant_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          meeting_id?: string;
          mime_type?: string;
          provider_recording_id_hash?: string;
          scan_completed_at?: string;
          scan_provider?: string;
          sha256?: string;
          size_bytes?: number;
          storage_path?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meeting_recording_versions_meeting_id_fkey';
            columns: ['meeting_id'];
            isOneToOne: false;
            referencedRelation: 'meetings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meeting_recording_versions_tenant_id_company_id_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'meeting_recording_versions_tenant_id_fkey';
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
          operation_id: string | null;
          starts_at: string;
          status: Database['public']['Enums']['meeting_slot_status'];
          tenant_id: string;
          timezone: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          ends_at: string;
          id?: string;
          operation_id?: string | null;
          starts_at: string;
          status?: Database['public']['Enums']['meeting_slot_status'];
          tenant_id: string;
          timezone?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          ends_at?: string;
          id?: string;
          operation_id?: string | null;
          starts_at?: string;
          status?: Database['public']['Enums']['meeting_slot_status'];
          tenant_id?: string;
          timezone?: string;
          updated_at?: string;
          version?: number;
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
          cancelled_at: string | null;
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
          room_state: string;
          scheduled_at: string;
          slot_id: string | null;
          status: Database['public']['Enums']['meeting_status'];
          tenant_id: string;
          timezone: string;
          title: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          cancelled_at?: string | null;
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
          room_state?: string;
          scheduled_at: string;
          slot_id?: string | null;
          status?: Database['public']['Enums']['meeting_status'];
          tenant_id: string;
          timezone?: string;
          title: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          cancelled_at?: string | null;
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
          room_state?: string;
          scheduled_at?: string;
          slot_id?: string | null;
          status?: Database['public']['Enums']['meeting_status'];
          tenant_id?: string;
          timezone?: string;
          title?: string;
          updated_at?: string;
          version?: number;
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
            foreignKeyName: 'meetings_slot_id_fkey';
            columns: ['slot_id'];
            isOneToOne: false;
            referencedRelation: 'meeting_slots';
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
      message_template_versions: {
        Row: {
          body_template: string;
          channel: string;
          created_at: string;
          enabled: boolean;
          subject_template: string | null;
          template_key: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          body_template: string;
          channel: string;
          created_at?: string;
          enabled?: boolean;
          subject_template?: string | null;
          template_key: string;
          version: number;
        };
        Update: {
          body_template?: string;
          channel?: string;
          created_at?: string;
          enabled?: boolean;
          subject_template?: string | null;
          template_key?: string;
          version?: number;
        };
        Relationships: [];
      };
      mfa_factor_removal_reservations: {
        Row: {
          created_at: string;
          factor_id: string;
          operation_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          factor_id: string;
          operation_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          factor_id?: string;
          operation_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      operational_activity: {
        Row: {
          activity_code: string;
          actor_profile_id: string | null;
          company_id: string;
          created_at: string;
          id: string;
          projection_key: string;
          safe_metadata: NonNullable<Json>;
          source_event_id: string;
          source_job_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_code: string;
          actor_profile_id?: string | null;
          company_id: string;
          created_at?: string;
          id?: string;
          projection_key: string;
          safe_metadata?: NonNullable<Json>;
          source_event_id: string;
          source_job_id: string;
          tenant_id: string;
        };
        Update: {
          activity_code?: string;
          actor_profile_id?: string | null;
          company_id?: string;
          created_at?: string;
          id?: string;
          projection_key?: string;
          safe_metadata?: NonNullable<Json>;
          source_event_id?: string;
          source_job_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'operational_activity_actor_profile_id_fkey';
            columns: ['actor_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operational_activity_company_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'operational_activity_job_event_fkey';
            columns: ['source_job_id', 'source_event_id'];
            isOneToOne: false;
            referencedRelation: 'event_jobs';
            referencedColumns: ['id', 'event_id'];
          },
          {
            foreignKeyName: 'operational_activity_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      operational_notifications: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          notification_code: string;
          projection_key: string;
          read_at: string | null;
          recipient_profile_id: string;
          safe_metadata: NonNullable<Json>;
          severity: string;
          source_event_id: string;
          source_job_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          notification_code: string;
          projection_key: string;
          read_at?: string | null;
          recipient_profile_id: string;
          safe_metadata?: NonNullable<Json>;
          severity?: string;
          source_event_id: string;
          source_job_id: string;
          tenant_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          notification_code?: string;
          projection_key?: string;
          read_at?: string | null;
          recipient_profile_id?: string;
          safe_metadata?: NonNullable<Json>;
          severity?: string;
          source_event_id?: string;
          source_job_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'operational_notifications_company_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'operational_notifications_job_event_fkey';
            columns: ['source_job_id', 'source_event_id'];
            isOneToOne: false;
            referencedRelation: 'event_jobs';
            referencedColumns: ['id', 'event_id'];
          },
          {
            foreignKeyName: 'operational_notifications_recipient_profile_id_fkey';
            columns: ['recipient_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operational_notifications_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      operational_runtime_audit: {
        Row: {
          action_code: string;
          actor_profile_id: string | null;
          company_id: string;
          id: number;
          occurred_at: string;
          operation_id: string;
          outcome: string;
          request_hash: string;
          resource_id: string;
          resource_type: string;
          source_event_id: string | null;
          source_job_id: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          action_code: string;
          actor_profile_id?: string | null;
          company_id: string;
          id?: never;
          occurred_at?: string;
          operation_id: string;
          outcome?: string;
          request_hash: string;
          resource_id: string;
          resource_type: string;
          source_event_id?: string | null;
          source_job_id?: string | null;
          tenant_id: string;
        };
        Update: {
          action_code?: string;
          actor_profile_id?: string | null;
          company_id?: string;
          id?: never;
          occurred_at?: string;
          operation_id?: string;
          outcome?: string;
          request_hash?: string;
          resource_id?: string;
          resource_type?: string;
          source_event_id?: string | null;
          source_job_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'operational_runtime_audit_actor_profile_id_fkey';
            columns: ['actor_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operational_runtime_audit_company_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'operational_runtime_audit_job_event_fkey';
            columns: ['source_job_id', 'source_event_id'];
            isOneToOne: false;
            referencedRelation: 'event_jobs';
            referencedColumns: ['id', 'event_id'];
          },
          {
            foreignKeyName: 'operational_runtime_audit_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      operational_tasks: {
        Row: {
          assigned_profile_id: string | null;
          company_id: string;
          created_at: string;
          due_at: string | null;
          id: string;
          priority: string;
          projection_key: string;
          safe_metadata: NonNullable<Json>;
          source_event_id: string;
          source_job_id: string;
          state: string;
          task_code: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          assigned_profile_id?: string | null;
          company_id: string;
          created_at?: string;
          due_at?: string | null;
          id?: string;
          priority?: string;
          projection_key: string;
          safe_metadata?: NonNullable<Json>;
          source_event_id: string;
          source_job_id: string;
          state?: string;
          task_code: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          assigned_profile_id?: string | null;
          company_id?: string;
          created_at?: string;
          due_at?: string | null;
          id?: string;
          priority?: string;
          projection_key?: string;
          safe_metadata?: NonNullable<Json>;
          source_event_id?: string;
          source_job_id?: string;
          state?: string;
          task_code?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'operational_tasks_assigned_profile_id_fkey';
            columns: ['assigned_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operational_tasks_company_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'operational_tasks_job_event_fkey';
            columns: ['source_job_id', 'source_event_id'];
            isOneToOne: false;
            referencedRelation: 'event_jobs';
            referencedColumns: ['id', 'event_id'];
          },
          {
            foreignKeyName: 'operational_tasks_tenant_id_fkey';
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
        ComputedFields: never;
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
        ComputedFields: never;
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
          components: NonNullable<Json>;
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
        ComputedFields: never;
        Insert: {
          attempts?: number;
          components: NonNullable<Json>;
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
          components?: NonNullable<Json>;
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
      p308_operation_receipts: {
        Row: {
          actor_id: string;
          created_at: string;
          kind: string;
          operation_id: string;
          payload_hash: string;
          result: NonNullable<Json>;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          created_at?: string;
          kind: string;
          operation_id: string;
          payload_hash: string;
          result: NonNullable<Json>;
          tenant_id: string;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          kind?: string;
          operation_id?: string;
          payload_hash?: string;
          result?: NonNullable<Json>;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'p308_operation_receipts_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'p308_operation_receipts_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      p311_operation_receipts: {
        Row: {
          actor_id: string;
          created_at: string;
          operation_id: string;
          operation_type: string;
          payload_hash: string;
          response: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          created_at?: string;
          operation_id: string;
          operation_type: string;
          payload_hash: string;
          response: NonNullable<Json>;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          operation_id?: string;
          operation_type?: string;
          payload_hash?: string;
          response?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'p311_operation_receipts_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_allocations: {
        Row: {
          allocated_at: string;
          amount_minor: number;
          company_id: string;
          currency: string;
          id: string;
          invoice_id: string;
          operation_receipt_id: string;
          payment_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          allocated_at?: string;
          amount_minor: number;
          company_id: string;
          currency: string;
          id?: string;
          invoice_id: string;
          operation_receipt_id: string;
          payment_id: string;
          tenant_id: string;
        };
        Update: {
          allocated_at?: string;
          amount_minor?: number;
          company_id?: string;
          currency?: string;
          id?: string;
          invoice_id?: string;
          operation_receipt_id?: string;
          payment_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_allocations_currency_fkey';
            columns: ['currency'];
            isOneToOne: false;
            referencedRelation: 'finance_currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'payment_allocations_invoice_fk';
            columns: ['tenant_id', 'company_id', 'invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'payment_allocations_payment_fk';
            columns: ['tenant_id', 'invoice_id', 'payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['tenant_id', 'invoice_id', 'id'];
          },
          {
            foreignKeyName: 'payment_allocations_receipt_fk';
            columns: ['tenant_id', 'company_id', 'operation_receipt_id'];
            isOneToOne: false;
            referencedRelation: 'finance_operation_receipts';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
        ];
      };
      payment_provider_attempts: {
        Row: {
          amount_minor: number;
          company_id: string;
          compensation_effect_key: string | null;
          compensation_reference: string | null;
          created_at: string;
          currency: string;
          customer_profile_id: string;
          destination_id: string;
          effect_lease_expires_at: string;
          effect_lease_token: string;
          expected_invoice_version: number;
          failure_code: string | null;
          id: string;
          invoice_id: string;
          last_provider_body_hash: string | null;
          last_provider_event_id: string | null;
          last_provider_occurred_at: string | null;
          lease_expires_at: string | null;
          lease_owner: string | null;
          lease_token: string | null;
          operation_id: string;
          payload_hash: string;
          payment_id: string;
          provider: string;
          provider_effect_hash: string;
          provider_effect_key: string;
          provider_reference: string | null;
          redirect_url: string | null;
          state: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          company_id: string;
          compensation_effect_key?: string | null;
          compensation_reference?: string | null;
          created_at?: string;
          currency: string;
          customer_profile_id: string;
          destination_id: string;
          effect_lease_expires_at?: string;
          effect_lease_token?: string;
          expected_invoice_version: number;
          failure_code?: string | null;
          id?: string;
          invoice_id: string;
          last_provider_body_hash?: string | null;
          last_provider_event_id?: string | null;
          last_provider_occurred_at?: string | null;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          lease_token?: string | null;
          operation_id: string;
          payload_hash: string;
          payment_id: string;
          provider?: string;
          provider_effect_hash: string;
          provider_effect_key: string;
          provider_reference?: string | null;
          redirect_url?: string | null;
          state?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount_minor?: number;
          company_id?: string;
          compensation_effect_key?: string | null;
          compensation_reference?: string | null;
          created_at?: string;
          currency?: string;
          customer_profile_id?: string;
          destination_id?: string;
          effect_lease_expires_at?: string;
          effect_lease_token?: string;
          expected_invoice_version?: number;
          failure_code?: string | null;
          id?: string;
          invoice_id?: string;
          last_provider_body_hash?: string | null;
          last_provider_event_id?: string | null;
          last_provider_occurred_at?: string | null;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          lease_token?: string | null;
          operation_id?: string;
          payload_hash?: string;
          payment_id?: string;
          provider?: string;
          provider_effect_hash?: string;
          provider_effect_key?: string;
          provider_reference?: string | null;
          redirect_url?: string | null;
          state?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_provider_attempts_company_id_customer_profile_id_fkey';
            columns: ['company_id', 'customer_profile_id'];
            isOneToOne: false;
            referencedRelation: 'customer_profiles';
            referencedColumns: ['linked_company_id', 'profile_id'];
          },
          {
            foreignKeyName: 'payment_provider_attempts_currency_fkey';
            columns: ['currency'];
            isOneToOne: false;
            referencedRelation: 'finance_currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'payment_provider_attempts_tenant_id_company_id_destination_fkey';
            columns: ['tenant_id', 'company_id', 'destination_id'];
            isOneToOne: false;
            referencedRelation: 'tap_provider_destinations';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'payment_provider_attempts_tenant_id_company_id_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'payment_provider_attempts_tenant_id_company_id_invoice_id_fkey';
            columns: ['tenant_id', 'company_id', 'invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'payment_provider_attempts_tenant_id_invoice_id_payment_id_fkey';
            columns: ['tenant_id', 'invoice_id', 'payment_id'];
            isOneToOne: true;
            referencedRelation: 'payments';
            referencedColumns: ['tenant_id', 'invoice_id', 'id'];
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
        ComputedFields: never;
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
      platform_audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          correlation_id: string;
          created_at: string;
          event_name: string;
          event_version: number;
          id: string;
          operation_id: string;
          outcome: string;
          reason_code: string;
          safe_metadata: NonNullable<Json>;
          source_class: string;
          target_opaque_id: string | null;
          target_type: string;
          tenant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          correlation_id: string;
          created_at?: string;
          event_name: string;
          event_version?: number;
          id?: string;
          operation_id: string;
          outcome: string;
          reason_code: string;
          safe_metadata?: NonNullable<Json>;
          source_class: string;
          target_opaque_id?: string | null;
          target_type: string;
          tenant_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          correlation_id?: string;
          created_at?: string;
          event_name?: string;
          event_version?: number;
          id?: string;
          operation_id?: string;
          outcome?: string;
          reason_code?: string;
          safe_metadata?: NonNullable<Json>;
          source_class?: string;
          target_opaque_id?: string | null;
          target_type?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_audit_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'platform_audit_events_tenant_id_fkey';
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
      pro_compensations: {
        Row: {
          amount_minor: number;
          commercial_term_amount_minor: number;
          commercial_term_effective_from: string;
          commercial_term_id: string;
          commercial_term_model: Database['public']['Enums']['pro_term_model'];
          commercial_term_scope: string;
          commercial_term_version: number;
          company_assignment_assigned_at: string;
          company_assignment_id: string;
          company_id: string;
          created_at: string;
          created_by: string;
          currency: string;
          id: string;
          operation_receipt_id: string;
          posted_journal_id: string | null;
          pro_profile_id: string;
          source_reference: string;
          source_reference_normalized: string | null;
          state: string;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          commercial_term_amount_minor: number;
          commercial_term_effective_from: string;
          commercial_term_id: string;
          commercial_term_model: Database['public']['Enums']['pro_term_model'];
          commercial_term_scope: string;
          commercial_term_version: number;
          company_assignment_assigned_at: string;
          company_assignment_id: string;
          company_id: string;
          created_at?: string;
          created_by: string;
          currency: string;
          id?: string;
          operation_receipt_id: string;
          posted_journal_id?: string | null;
          pro_profile_id: string;
          source_reference: string;
          source_reference_normalized?: never;
          state?: string;
          tenant_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          amount_minor?: number;
          commercial_term_amount_minor?: number;
          commercial_term_effective_from?: string;
          commercial_term_id?: string;
          commercial_term_model?: Database['public']['Enums']['pro_term_model'];
          commercial_term_scope?: string;
          commercial_term_version?: number;
          company_assignment_assigned_at?: string;
          company_assignment_id?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string;
          currency?: string;
          id?: string;
          operation_receipt_id?: string;
          posted_journal_id?: string | null;
          pro_profile_id?: string;
          source_reference?: string;
          source_reference_normalized?: never;
          state?: string;
          tenant_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'pro_compensations_commercial_term_fk';
            columns: ['pro_profile_id', 'commercial_term_id'];
            isOneToOne: false;
            referencedRelation: 'pro_commercial_terms';
            referencedColumns: ['pro_profile_id', 'id'];
          },
          {
            foreignKeyName: 'pro_compensations_company_assignment_fk';
            columns: [
              'tenant_id',
              'company_id',
              'pro_profile_id',
              'company_assignment_id',
              'company_assignment_assigned_at',
            ];
            isOneToOne: false;
            referencedRelation: 'pro_company_assignments';
            referencedColumns: ['tenant_id', 'company_id', 'pro_profile_id', 'id', 'assigned_at'];
          },
          {
            foreignKeyName: 'pro_compensations_company_fk';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'pro_compensations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_compensations_currency_fkey';
            columns: ['currency'];
            isOneToOne: false;
            referencedRelation: 'finance_currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'pro_compensations_posted_journal_fk';
            columns: ['tenant_id', 'company_id', 'currency', 'posted_journal_id'];
            isOneToOne: false;
            referencedRelation: 'finance_journals';
            referencedColumns: ['tenant_id', 'company_id', 'currency', 'id'];
          },
          {
            foreignKeyName: 'pro_compensations_pro_profile_id_fkey';
            columns: ['pro_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_compensations_receipt_fk';
            columns: ['tenant_id', 'company_id', 'operation_receipt_id'];
            isOneToOne: false;
            referencedRelation: 'finance_operation_receipts';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
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
        ComputedFields: never;
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
        ComputedFields: never;
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
      pro_credential_evidence_removals: {
        Row: {
          actor_id: string;
          cancelled_at: string | null;
          completed_at: string | null;
          created_at: string;
          credential_id: string;
          evidence_id: string;
          expected_version: number;
          id: string;
          lease_expires_at: string;
          operation_id: string;
          payload_hash: string;
          pro_profile_id: string;
          recovery_actor_id: string | null;
          recovery_operation_id: string | null;
          sanitized_result: Json | null;
          status: string;
          storage_path: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          cancelled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          credential_id: string;
          evidence_id: string;
          expected_version: number;
          id?: string;
          lease_expires_at?: string;
          operation_id: string;
          payload_hash: string;
          pro_profile_id: string;
          recovery_actor_id?: string | null;
          recovery_operation_id?: string | null;
          sanitized_result?: Json | null;
          status?: string;
          storage_path?: string | null;
        };
        Update: {
          actor_id?: string;
          cancelled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          credential_id?: string;
          evidence_id?: string;
          expected_version?: number;
          id?: string;
          lease_expires_at?: string;
          operation_id?: string;
          payload_hash?: string;
          pro_profile_id?: string;
          recovery_actor_id?: string | null;
          recovery_operation_id?: string | null;
          sanitized_result?: Json | null;
          status?: string;
          storage_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pro_credential_evidence_removals_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_credential_evidence_removals_credential_id_fkey';
            columns: ['credential_id'];
            isOneToOne: false;
            referencedRelation: 'pro_credentials';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_credential_evidence_removals_pro_profile_id_fkey';
            columns: ['pro_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_credential_evidence_removals_recovery_actor_id_fkey';
            columns: ['recovery_actor_id'];
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
        ComputedFields: never;
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
        ComputedFields: never;
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
          sanitized_result: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_kind: Database['public']['Enums']['pro_lifecycle_operation_kind'];
          operation_id: string;
          payload_hash: string;
          sanitized_result: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_kind?: Database['public']['Enums']['pro_lifecycle_operation_kind'];
          operation_id?: string;
          payload_hash?: string;
          sanitized_result?: NonNullable<Json>;
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
          service_areas: NonNullable<Json>;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bio?: string | null;
          created_at?: string;
          department?: string | null;
          designation?: string | null;
          profile_id: string;
          service_areas?: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          department?: string | null;
          designation?: string | null;
          profile_id?: string;
          service_areas?: NonNullable<Json>;
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
        ComputedFields: never;
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
      public_application_attachments: {
        Row: {
          application_id: string | null;
          content_sha256: string;
          created_at: string;
          document_upload_id: string | null;
          draft_id: string;
          field_id: string;
          id: string;
          immutable: boolean;
          scan_state: string;
          storage_path: string | null;
        };
        ComputedFields: never;
        Insert: {
          application_id?: string | null;
          content_sha256: string;
          created_at?: string;
          document_upload_id?: string | null;
          draft_id: string;
          field_id: string;
          id?: string;
          immutable?: boolean;
          scan_state: string;
          storage_path?: string | null;
        };
        Update: {
          application_id?: string | null;
          content_sha256?: string;
          created_at?: string;
          document_upload_id?: string | null;
          draft_id?: string;
          field_id?: string;
          id?: string;
          immutable?: boolean;
          scan_state?: string;
          storage_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'public_application_attachments_application_id_fkey';
            columns: ['application_id'];
            isOneToOne: false;
            referencedRelation: 'public_applications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_application_attachments_draft_id_fkey';
            columns: ['draft_id'];
            isOneToOne: false;
            referencedRelation: 'public_application_drafts';
            referencedColumns: ['id'];
          },
        ];
      };
      public_application_drafts: {
        Row: {
          answers: NonNullable<Json>;
          created_at: string;
          definition_id: string;
          definition_version: number;
          estimator_result_id: string | null;
          expires_at: string;
          id: string;
          resume_secret_hash: string;
          row_version: number;
          state: string;
          submitted_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          answers?: NonNullable<Json>;
          created_at?: string;
          definition_id: string;
          definition_version: number;
          estimator_result_id?: string | null;
          expires_at: string;
          id?: string;
          resume_secret_hash: string;
          row_version?: number;
          state?: string;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          answers?: NonNullable<Json>;
          created_at?: string;
          definition_id?: string;
          definition_version?: number;
          estimator_result_id?: string | null;
          expires_at?: string;
          id?: string;
          resume_secret_hash?: string;
          row_version?: number;
          state?: string;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_application_drafts_definition_id_definition_version_fkey';
            columns: ['definition_id', 'definition_version'];
            isOneToOne: false;
            referencedRelation: 'questionnaire_definition_versions';
            referencedColumns: ['definition_id', 'version'];
          },
        ];
      };
      public_applications: {
        Row: {
          accepted_at: string;
          accepted_operation_id: string;
          definition_id: string;
          definition_version: number;
          draft_id: string;
          id: string;
          lead_id: string;
          retention_until: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string;
          accepted_operation_id: string;
          definition_id: string;
          definition_version: number;
          draft_id: string;
          id?: string;
          lead_id: string;
          retention_until: string;
        };
        Update: {
          accepted_at?: string;
          accepted_operation_id?: string;
          definition_id?: string;
          definition_version?: number;
          draft_id?: string;
          id?: string;
          lead_id?: string;
          retention_until?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_applications_definition_id_definition_version_fkey';
            columns: ['definition_id', 'definition_version'];
            isOneToOne: false;
            referencedRelation: 'questionnaire_definition_versions';
            referencedColumns: ['definition_id', 'version'];
          },
          {
            foreignKeyName: 'public_applications_draft_id_fkey';
            columns: ['draft_id'];
            isOneToOne: true;
            referencedRelation: 'public_application_drafts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_applications_lead_id_fkey';
            columns: ['lead_id'];
            isOneToOne: true;
            referencedRelation: 'leads';
            referencedColumns: ['id'];
          },
        ];
      };
      public_contact_intakes: {
        Row: {
          abuse_scope_hash: string;
          accepted_at: string;
          acknowledgement_state: string;
          consent_accepted_at: string;
          consent_version: string;
          id: string;
          normalized_payload: NonNullable<Json>;
          operation_id: string;
          request_hash: string;
        };
        ComputedFields: never;
        Insert: {
          abuse_scope_hash: string;
          accepted_at?: string;
          acknowledgement_state?: string;
          consent_accepted_at: string;
          consent_version: string;
          id?: string;
          normalized_payload: NonNullable<Json>;
          operation_id: string;
          request_hash: string;
        };
        Update: {
          abuse_scope_hash?: string;
          accepted_at?: string;
          acknowledgement_state?: string;
          consent_accepted_at?: string;
          consent_version?: string;
          id?: string;
          normalized_payload?: NonNullable<Json>;
          operation_id?: string;
          request_hash?: string;
        };
        Relationships: [];
      };
      public_intake_operations: {
        Row: {
          created_at: string;
          operation_id: string;
          request_hash: string;
          sanitized_result: NonNullable<Json>;
          scope: string;
          subject_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          operation_id: string;
          request_hash: string;
          sanitized_result: NonNullable<Json>;
          scope: string;
          subject_id?: string | null;
        };
        Update: {
          created_at?: string;
          operation_id?: string;
          request_hash?: string;
          sanitized_result?: NonNullable<Json>;
          scope?: string;
          subject_id?: string | null;
        };
        Relationships: [];
      };
      questionnaire_definition_versions: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string;
          definition: NonNullable<Json>;
          definition_hash: string;
          definition_id: string;
          published_at: string | null;
          row_version: number;
          state: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by: string;
          definition: NonNullable<Json>;
          definition_hash: string;
          definition_id: string;
          published_at?: string | null;
          row_version?: number;
          state: string;
          updated_at?: string;
          version: number;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string;
          definition?: NonNullable<Json>;
          definition_hash?: string;
          definition_id?: string;
          published_at?: string | null;
          row_version?: number;
          state?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'questionnaire_definition_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'questionnaire_definition_versions_definition_id_fkey';
            columns: ['definition_id'];
            isOneToOne: false;
            referencedRelation: 'questionnaire_definitions';
            referencedColumns: ['id'];
          },
        ];
      };
      questionnaire_definitions: {
        Row: {
          created_at: string;
          current_draft_version: number;
          current_published_version: number | null;
          definition_key: string;
          id: string;
          row_version: number;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          current_draft_version?: number;
          current_published_version?: number | null;
          definition_key: string;
          id?: string;
          row_version?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          current_draft_version?: number;
          current_published_version?: number | null;
          definition_key?: string;
          id?: string;
          row_version?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          key: string;
          last_refill: string;
          tokens: number;
        };
        ComputedFields: never;
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
      refund_allocations: {
        Row: {
          allocated_at: string;
          amount_minor: number;
          company_id: string;
          currency: string;
          id: string;
          invoice_id: string;
          operation_receipt_id: string;
          payment_allocation_id: string;
          payment_id: string;
          refund_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          allocated_at?: string;
          amount_minor: number;
          company_id: string;
          currency: string;
          id?: string;
          invoice_id: string;
          operation_receipt_id: string;
          payment_allocation_id: string;
          payment_id: string;
          refund_id: string;
          tenant_id: string;
        };
        Update: {
          allocated_at?: string;
          amount_minor?: number;
          company_id?: string;
          currency?: string;
          id?: string;
          invoice_id?: string;
          operation_receipt_id?: string;
          payment_allocation_id?: string;
          payment_id?: string;
          refund_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'refund_allocations_currency_fkey';
            columns: ['currency'];
            isOneToOne: false;
            referencedRelation: 'finance_currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'refund_allocations_invoice_fk';
            columns: ['tenant_id', 'company_id', 'invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'refund_allocations_payment_allocation_fk';
            columns: ['tenant_id', 'company_id', 'invoice_id', 'payment_allocation_id'];
            isOneToOne: false;
            referencedRelation: 'payment_allocations';
            referencedColumns: ['tenant_id', 'company_id', 'invoice_id', 'id'];
          },
          {
            foreignKeyName: 'refund_allocations_payment_fk';
            columns: ['tenant_id', 'invoice_id', 'payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['tenant_id', 'invoice_id', 'id'];
          },
          {
            foreignKeyName: 'refund_allocations_receipt_fk';
            columns: ['tenant_id', 'company_id', 'operation_receipt_id'];
            isOneToOne: false;
            referencedRelation: 'finance_operation_receipts';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'refund_allocations_refund_fk';
            columns: ['tenant_id', 'payment_id', 'refund_id'];
            isOneToOne: false;
            referencedRelation: 'refunds';
            referencedColumns: ['tenant_id', 'payment_id', 'id'];
          },
        ];
      };
      refund_reconciliation_state: {
        Row: {
          cursor_created_at: string | null;
          cursor_id: string | null;
          updated_at: string;
          worker_name: string;
        };
        ComputedFields: never;
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
          currency: string | null;
          id: string;
          idempotency_key: string | null;
          ledger_eligible: boolean;
          payment_id: string;
          provider_effect_hash: string | null;
          provider_effect_key: string | null;
          provider_effect_state: string | null;
          provider_idempotency_key: string | null;
          provider_refund_id: string | null;
          quarantine_reason: string | null;
          reason: string | null;
          recovery_lease_expires_at: string | null;
          recovery_lease_owner: string | null;
          recovery_lease_token: string | null;
          status: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          created_at?: string;
          currency?: string | null;
          id?: string;
          idempotency_key?: string | null;
          ledger_eligible?: boolean;
          payment_id: string;
          provider_effect_hash?: string | null;
          provider_effect_key?: string | null;
          provider_effect_state?: string | null;
          provider_idempotency_key?: string | null;
          provider_refund_id?: string | null;
          quarantine_reason?: string | null;
          reason?: string | null;
          recovery_lease_expires_at?: string | null;
          recovery_lease_owner?: string | null;
          recovery_lease_token?: string | null;
          status?: string;
          tenant_id: string;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          currency?: string | null;
          id?: string;
          idempotency_key?: string | null;
          ledger_eligible?: boolean;
          payment_id?: string;
          provider_effect_hash?: string | null;
          provider_effect_key?: string | null;
          provider_effect_state?: string | null;
          provider_idempotency_key?: string | null;
          provider_refund_id?: string | null;
          quarantine_reason?: string | null;
          reason?: string | null;
          recovery_lease_expires_at?: string | null;
          recovery_lease_owner?: string | null;
          recovery_lease_token?: string | null;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'refunds_currency_fk';
            columns: ['currency'];
            isOneToOne: false;
            referencedRelation: 'finance_currencies';
            referencedColumns: ['code'];
          },
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
      registration_domain_events: {
        Row: {
          company_id: string;
          consumed_at: string | null;
          event_code: Database['public']['Enums']['registration_domain_event_code'];
          id: string;
          occurred_at: string;
          payload: NonNullable<Json>;
          registration_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          consumed_at?: string | null;
          event_code: Database['public']['Enums']['registration_domain_event_code'];
          id?: string;
          occurred_at?: string;
          payload: NonNullable<Json>;
          registration_id: string;
          tenant_id: string;
        };
        Update: {
          company_id?: string;
          consumed_at?: string | null;
          event_code?: Database['public']['Enums']['registration_domain_event_code'];
          id?: string;
          occurred_at?: string;
          payload?: NonNullable<Json>;
          registration_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'registration_domain_events_registration_fk';
            columns: ['tenant_id', 'company_id', 'registration_id'];
            isOneToOne: false;
            referencedRelation: 'company_registrations';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
        ];
      };
      registration_operation_receipts: {
        Row: {
          created_at: string;
          operation_id: string;
          operation_kind: Database['public']['Enums']['registration_operation_kind'];
          payload_hash: string;
          sanitized_result: NonNullable<Json>;
          scope_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          operation_id: string;
          operation_kind: Database['public']['Enums']['registration_operation_kind'];
          payload_hash: string;
          sanitized_result: NonNullable<Json>;
          scope_id: string;
        };
        Update: {
          created_at?: string;
          operation_id?: string;
          operation_kind?: Database['public']['Enums']['registration_operation_kind'];
          payload_hash?: string;
          sanitized_result?: NonNullable<Json>;
          scope_id?: string;
        };
        Relationships: [];
      };
      registration_stage_documents: {
        Row: {
          company_id: string;
          document_id: string;
          document_version_id: string;
          id: string;
          linked_at: string;
          linked_by: string;
          registration_id: string;
          role: Database['public']['Enums']['registration_document_role'];
          stage_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          document_id: string;
          document_version_id: string;
          id?: string;
          linked_at?: string;
          linked_by: string;
          registration_id: string;
          role: Database['public']['Enums']['registration_document_role'];
          stage_id: string;
          tenant_id: string;
        };
        Update: {
          company_id?: string;
          document_id?: string;
          document_version_id?: string;
          id?: string;
          linked_at?: string;
          linked_by?: string;
          registration_id?: string;
          role?: Database['public']['Enums']['registration_document_role'];
          stage_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'registration_stage_documents_document_fk';
            columns: ['tenant_id', 'company_id', 'document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'registration_stage_documents_linked_by_fkey';
            columns: ['linked_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'registration_stage_documents_stage_fk';
            columns: ['tenant_id', 'company_id', 'registration_id', 'stage_id'];
            isOneToOne: false;
            referencedRelation: 'registration_stages';
            referencedColumns: ['tenant_id', 'company_id', 'registration_id', 'id'];
          },
          {
            foreignKeyName: 'registration_stage_documents_version_fk';
            columns: ['tenant_id', 'document_id', 'document_version_id'];
            isOneToOne: false;
            referencedRelation: 'document_versions';
            referencedColumns: ['tenant_id', 'document_id', 'id'];
          },
        ];
      };
      registration_stage_events: {
        Row: {
          actor_category: string;
          actor_id: string;
          company_id: string;
          from_registration_stage: Database['public']['Enums']['registration_stage_code'] | null;
          from_stage_status: Database['public']['Enums']['registration_stage_status'] | null;
          id: string;
          occurred_at: string;
          operation_id: string;
          reason_code: string | null;
          reason_text: string | null;
          registration_id: string;
          registration_version: number;
          stage_id: string;
          stage_version: number;
          tenant_id: string;
          to_registration_stage: Database['public']['Enums']['registration_stage_code'];
          to_stage_status: Database['public']['Enums']['registration_stage_status'];
          transition_code: string;
        };
        ComputedFields: never;
        Insert: {
          actor_category: string;
          actor_id: string;
          company_id: string;
          from_registration_stage?: Database['public']['Enums']['registration_stage_code'] | null;
          from_stage_status?: Database['public']['Enums']['registration_stage_status'] | null;
          id?: string;
          occurred_at?: string;
          operation_id: string;
          reason_code?: string | null;
          reason_text?: string | null;
          registration_id: string;
          registration_version: number;
          stage_id: string;
          stage_version: number;
          tenant_id: string;
          to_registration_stage: Database['public']['Enums']['registration_stage_code'];
          to_stage_status: Database['public']['Enums']['registration_stage_status'];
          transition_code?: string;
        };
        Update: {
          actor_category?: string;
          actor_id?: string;
          company_id?: string;
          from_registration_stage?: Database['public']['Enums']['registration_stage_code'] | null;
          from_stage_status?: Database['public']['Enums']['registration_stage_status'] | null;
          id?: string;
          occurred_at?: string;
          operation_id?: string;
          reason_code?: string | null;
          reason_text?: string | null;
          registration_id?: string;
          registration_version?: number;
          stage_id?: string;
          stage_version?: number;
          tenant_id?: string;
          to_registration_stage?: Database['public']['Enums']['registration_stage_code'];
          to_stage_status?: Database['public']['Enums']['registration_stage_status'];
          transition_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'registration_stage_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'registration_stage_events_stage_fk';
            columns: ['tenant_id', 'company_id', 'registration_id', 'stage_id'];
            isOneToOne: false;
            referencedRelation: 'registration_stages';
            referencedColumns: ['tenant_id', 'company_id', 'registration_id', 'id'];
          },
        ];
      };
      registration_stages: {
        Row: {
          code: Database['public']['Enums']['registration_stage_code'];
          company_id: string;
          completed_at: string | null;
          created_at: string;
          details: NonNullable<Json>;
          id: string;
          ordinal: number;
          registration_id: string;
          started_at: string | null;
          status: Database['public']['Enums']['registration_stage_status'];
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          code: Database['public']['Enums']['registration_stage_code'];
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: string;
          ordinal: number;
          registration_id: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['registration_stage_status'];
          tenant_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          code?: Database['public']['Enums']['registration_stage_code'];
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: string;
          ordinal?: number;
          registration_id?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['registration_stage_status'];
          tenant_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'registration_stages_registration_fk';
            columns: ['tenant_id', 'company_id', 'registration_id'];
            isOneToOne: false;
            referencedRelation: 'company_registrations';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
        ];
      };
      registration_visa_events: {
        Row: {
          actor_category: string;
          actor_id: string;
          company_id: string;
          from_stage: Database['public']['Enums']['registration_visa_stage_code'] | null;
          from_status: Database['public']['Enums']['registration_visa_status'] | null;
          id: string;
          occurred_at: string;
          operation_id: string;
          reason_code: string | null;
          reason_text: string | null;
          registration_id: string;
          tenant_id: string;
          to_stage: Database['public']['Enums']['registration_visa_stage_code'];
          to_status: Database['public']['Enums']['registration_visa_status'];
          visa_person_id: string;
          visa_version: number;
        };
        ComputedFields: never;
        Insert: {
          actor_category: string;
          actor_id: string;
          company_id: string;
          from_stage?: Database['public']['Enums']['registration_visa_stage_code'] | null;
          from_status?: Database['public']['Enums']['registration_visa_status'] | null;
          id?: string;
          occurred_at?: string;
          operation_id: string;
          reason_code?: string | null;
          reason_text?: string | null;
          registration_id: string;
          tenant_id: string;
          to_stage: Database['public']['Enums']['registration_visa_stage_code'];
          to_status: Database['public']['Enums']['registration_visa_status'];
          visa_person_id: string;
          visa_version: number;
        };
        Update: {
          actor_category?: string;
          actor_id?: string;
          company_id?: string;
          from_stage?: Database['public']['Enums']['registration_visa_stage_code'] | null;
          from_status?: Database['public']['Enums']['registration_visa_status'] | null;
          id?: string;
          occurred_at?: string;
          operation_id?: string;
          reason_code?: string | null;
          reason_text?: string | null;
          registration_id?: string;
          tenant_id?: string;
          to_stage?: Database['public']['Enums']['registration_visa_stage_code'];
          to_status?: Database['public']['Enums']['registration_visa_status'];
          visa_person_id?: string;
          visa_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'registration_visa_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'registration_visa_events_person_fk';
            columns: ['tenant_id', 'company_id', 'registration_id', 'visa_person_id'];
            isOneToOne: false;
            referencedRelation: 'registration_visa_people';
            referencedColumns: ['tenant_id', 'company_id', 'registration_id', 'id'];
          },
        ];
      };
      registration_visa_people: {
        Row: {
          company_id: string;
          completed_at: string | null;
          created_at: string;
          current_stage: Database['public']['Enums']['registration_visa_stage_code'];
          display_name: string;
          employee_id: string | null;
          id: string;
          person_kind: Database['public']['Enums']['registration_person_kind'];
          registration_id: string;
          shareholder_id: string | null;
          started_at: string | null;
          status: Database['public']['Enums']['registration_visa_status'];
          tenant_id: string;
          updated_at: string;
          version: number;
          visa_kind: Database['public']['Enums']['registration_visa_kind'];
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          current_stage?: Database['public']['Enums']['registration_visa_stage_code'];
          display_name: string;
          employee_id?: string | null;
          id?: string;
          person_kind: Database['public']['Enums']['registration_person_kind'];
          registration_id: string;
          shareholder_id?: string | null;
          started_at?: string | null;
          status?: Database['public']['Enums']['registration_visa_status'];
          tenant_id: string;
          updated_at?: string;
          version?: number;
          visa_kind: Database['public']['Enums']['registration_visa_kind'];
        };
        Update: {
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          current_stage?: Database['public']['Enums']['registration_visa_stage_code'];
          display_name?: string;
          employee_id?: string | null;
          id?: string;
          person_kind?: Database['public']['Enums']['registration_person_kind'];
          registration_id?: string;
          shareholder_id?: string | null;
          started_at?: string | null;
          status?: Database['public']['Enums']['registration_visa_status'];
          tenant_id?: string;
          updated_at?: string;
          version?: number;
          visa_kind?: Database['public']['Enums']['registration_visa_kind'];
        };
        Relationships: [
          {
            foreignKeyName: 'registration_visa_people_employee_fk';
            columns: ['tenant_id', 'company_id', 'employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'registration_visa_people_registration_fk';
            columns: ['tenant_id', 'company_id', 'registration_id'];
            isOneToOne: false;
            referencedRelation: 'company_registrations';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'registration_visa_people_shareholder_fk';
            columns: ['tenant_id', 'company_id', 'shareholder_id'];
            isOneToOne: false;
            referencedRelation: 'company_shareholders';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
        ];
      };
      renewal_evidence: {
        Row: {
          company_id: string;
          document_id: string;
          linked_at: string;
          linked_by: string | null;
          operation_id: string | null;
          renewal_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          document_id: string;
          linked_at?: string;
          linked_by?: string | null;
          operation_id?: string | null;
          renewal_id: string;
          tenant_id: string;
        };
        Update: {
          company_id?: string;
          document_id?: string;
          linked_at?: string;
          linked_by?: string | null;
          operation_id?: string | null;
          renewal_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'renewal_evidence_document_fk';
            columns: ['tenant_id', 'company_id', 'document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'renewal_evidence_linked_by_fkey';
            columns: ['linked_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'renewal_evidence_renewal_fk';
            columns: ['tenant_id', 'company_id', 'renewal_id'];
            isOneToOne: false;
            referencedRelation: 'renewals';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
        ];
      };
      renewal_materialization_runs: {
        Row: {
          active_renewals: number;
          attention_events: number;
          dubai_date: string;
          escalations: number;
          finished_at: string;
          id: string;
          started_at: string;
          status_changes: number;
        };
        ComputedFields: never;
        Insert: {
          active_renewals: number;
          attention_events: number;
          dubai_date: string;
          escalations: number;
          finished_at?: string;
          id?: string;
          started_at: string;
          status_changes: number;
        };
        Update: {
          active_renewals?: number;
          attention_events?: number;
          dubai_date?: string;
          escalations?: number;
          finished_at?: string;
          id?: string;
          started_at?: string;
          status_changes?: number;
        };
        Relationships: [];
      };
      renewal_reminder_jobs: {
        Row: {
          created_at: string;
          event_id: string;
          job_id: string | null;
          remind_at: string;
          renewal_id: string;
          renewal_version: number;
          state: string;
          superseded_at: string | null;
          window_days: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          job_id?: string | null;
          remind_at: string;
          renewal_id: string;
          renewal_version: number;
          state?: string;
          superseded_at?: string | null;
          window_days: number;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          job_id?: string | null;
          remind_at?: string;
          renewal_id?: string;
          renewal_version?: number;
          state?: string;
          superseded_at?: string | null;
          window_days?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'renewal_reminder_jobs_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'domain_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'renewal_reminder_jobs_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'event_jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'renewal_reminder_jobs_renewal_id_fkey';
            columns: ['renewal_id'];
            isOneToOne: false;
            referencedRelation: 'renewals';
            referencedColumns: ['id'];
          },
        ];
      };
      renewal_stage_events: {
        Row: {
          action: string;
          actor_id: string | null;
          batch_operation_id: string | null;
          company_id: string;
          created_at: string;
          details: NonNullable<Json>;
          from_stage: string | null;
          id: string;
          operation_id: string | null;
          reason_code: string | null;
          renewal_id: string;
          tenant_id: string;
          to_stage: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          batch_operation_id?: string | null;
          company_id: string;
          created_at?: string;
          details?: NonNullable<Json>;
          from_stage?: string | null;
          id?: string;
          operation_id?: string | null;
          reason_code?: string | null;
          renewal_id: string;
          tenant_id: string;
          to_stage: string;
          version: number;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          batch_operation_id?: string | null;
          company_id?: string;
          created_at?: string;
          details?: NonNullable<Json>;
          from_stage?: string | null;
          id?: string;
          operation_id?: string | null;
          reason_code?: string | null;
          renewal_id?: string;
          tenant_id?: string;
          to_stage?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'renewal_stage_event_renewal_fk';
            columns: ['tenant_id', 'company_id', 'renewal_id'];
            isOneToOne: false;
            referencedRelation: 'renewals';
            referencedColumns: ['tenant_id', 'company_id', 'id'];
          },
          {
            foreignKeyName: 'renewal_stage_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      renewals: {
        Row: {
          blocked_at: string | null;
          blocker_code: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          company_id: string;
          completed_at: string | null;
          created_at: string;
          currency: string;
          due_date: string;
          employee_id: string | null;
          escalation_level: number;
          fine_minor: number;
          government_fee_minor: number;
          id: string;
          label: string;
          last_notified_at: string | null;
          notify_at: string[];
          pro_service_fee_minor: number;
          source: string;
          stage: string;
          status: string;
          tenant_id: string;
          type: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          blocked_at?: string | null;
          blocker_code?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          due_date: string;
          employee_id?: string | null;
          escalation_level?: number;
          fine_minor?: number;
          government_fee_minor?: number;
          id?: string;
          label: string;
          last_notified_at?: string | null;
          notify_at?: string[];
          pro_service_fee_minor?: number;
          source: string;
          stage?: string;
          status?: string;
          tenant_id: string;
          type: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          blocked_at?: string | null;
          blocker_code?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          due_date?: string;
          employee_id?: string | null;
          escalation_level?: number;
          fine_minor?: number;
          government_fee_minor?: number;
          id?: string;
          label?: string;
          last_notified_at?: string | null;
          notify_at?: string[];
          pro_service_fee_minor?: number;
          source?: string;
          stage?: string;
          status?: string;
          tenant_id?: string;
          type?: string;
          updated_at?: string;
          version?: number;
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
      report_export_jobs: {
        Row: {
          cancelled_at: string | null;
          company_id: string | null;
          correlation_id: string;
          created_at: string;
          delivery_mode: string;
          expires_at: string;
          file_size_bytes: number;
          filters: NonNullable<Json>;
          id: string;
          max_bytes: number;
          max_rows: number;
          operation_id: string;
          report_id: string;
          report_version: number;
          requested_by: string;
          row_count: number;
          snapshot_at: string;
          stable_cursor: string | null;
          state: string;
          tenant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          cancelled_at?: string | null;
          company_id?: string | null;
          correlation_id: string;
          created_at?: string;
          delivery_mode?: string;
          expires_at?: string;
          file_size_bytes?: number;
          filters?: NonNullable<Json>;
          id?: string;
          max_bytes?: number;
          max_rows?: number;
          operation_id: string;
          report_id: string;
          report_version: number;
          requested_by: string;
          row_count?: number;
          snapshot_at?: string;
          stable_cursor?: string | null;
          state?: string;
          tenant_id?: string | null;
        };
        Update: {
          cancelled_at?: string | null;
          company_id?: string | null;
          correlation_id?: string;
          created_at?: string;
          delivery_mode?: string;
          expires_at?: string;
          file_size_bytes?: number;
          filters?: NonNullable<Json>;
          id?: string;
          max_bytes?: number;
          max_rows?: number;
          operation_id?: string;
          report_id?: string;
          report_version?: number;
          requested_by?: string;
          row_count?: number;
          snapshot_at?: string;
          stable_cursor?: string | null;
          state?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'report_export_jobs_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'report_export_jobs_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'report_export_jobs_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      retention_policy_registry: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          approved_duration: string | null;
          created_at: string;
          data_class: string;
          destructive_execution_enabled: boolean;
          evidence_requirement: string;
          legal_hold_behavior: string;
          owner: string;
          policy_status: string;
          retention_action: string;
          runtime_status: string;
          trigger_event: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          approved_duration?: string | null;
          created_at?: string;
          data_class: string;
          destructive_execution_enabled?: boolean;
          evidence_requirement: string;
          legal_hold_behavior: string;
          owner: string;
          policy_status: string;
          retention_action: string;
          runtime_status: string;
          trigger_event: string;
          version: number;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          approved_duration?: string | null;
          created_at?: string;
          data_class?: string;
          destructive_execution_enabled?: boolean;
          evidence_requirement?: string;
          legal_hold_behavior?: string;
          owner?: string;
          policy_status?: string;
          retention_action?: string;
          runtime_status?: string;
          trigger_event?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'retention_policy_registry_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      runtime_delivery_preferences: {
        Row: {
          channel: string;
          company_id: string;
          enabled: boolean;
          opted_out: boolean;
          profile_id: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          channel: string;
          company_id: string;
          enabled?: boolean;
          opted_out?: boolean;
          profile_id: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          channel?: string;
          company_id?: string;
          enabled?: boolean;
          opted_out?: boolean;
          profile_id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'runtime_delivery_preferences_company_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'runtime_delivery_preferences_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'runtime_delivery_preferences_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      runtime_delivery_receipts: {
        Row: {
          attempt_number: number;
          attempted_at: string;
          channel: string;
          company_id: string;
          created_at: string;
          delivery_state: string;
          effect_reference_hash: string | null;
          event_id: string;
          id: string;
          job_id: string;
          provider_category: string;
          provider_code: string;
          reconciled_at: string | null;
          reconciliation_state: string;
          retryable: boolean;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempt_number: number;
          attempted_at: string;
          channel: string;
          company_id: string;
          created_at?: string;
          delivery_state: string;
          effect_reference_hash?: string | null;
          event_id: string;
          id?: string;
          job_id: string;
          provider_category: string;
          provider_code: string;
          reconciled_at?: string | null;
          reconciliation_state: string;
          retryable: boolean;
          tenant_id: string;
        };
        Update: {
          attempt_number?: number;
          attempted_at?: string;
          channel?: string;
          company_id?: string;
          created_at?: string;
          delivery_state?: string;
          effect_reference_hash?: string | null;
          event_id?: string;
          id?: string;
          job_id?: string;
          provider_category?: string;
          provider_code?: string;
          reconciled_at?: string | null;
          reconciliation_state?: string;
          retryable?: boolean;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'runtime_delivery_receipts_company_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'runtime_delivery_receipts_job_event_fkey';
            columns: ['job_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'event_jobs';
            referencedColumns: ['id', 'event_id'];
          },
          {
            foreignKeyName: 'runtime_delivery_receipts_tenant_id_fkey';
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
        ComputedFields: never;
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
        ComputedFields: never;
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
      stripe_customer_mappings: {
        Row: {
          created_at: string;
          destination: string;
          id: string;
          stripe_customer_id: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          destination: string;
          id?: string;
          stripe_customer_id: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          destination?: string;
          id?: string;
          stripe_customer_id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stripe_customer_mappings_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: true;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      stripe_provider_events: {
        Row: {
          applied_at: string | null;
          body_hash: string;
          destination: string;
          error_code: string | null;
          event_type: string;
          id: string;
          provider_created: number;
          provider_event_id: string;
          received_at: string;
          state: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          applied_at?: string | null;
          body_hash: string;
          destination: string;
          error_code?: string | null;
          event_type: string;
          id?: string;
          provider_created: number;
          provider_event_id: string;
          received_at?: string;
          state?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
        };
        Update: {
          applied_at?: string | null;
          body_hash?: string;
          destination?: string;
          error_code?: string | null;
          event_type?: string;
          id?: string;
          provider_created?: number;
          provider_event_id?: string;
          received_at?: string;
          state?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
        };
        Relationships: [];
      };
      stripe_subscription_audit: {
        Row: {
          action: string;
          created_at: string;
          details: NonNullable<Json>;
          id: string;
          provider_event_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: string;
          provider_event_id: string;
          tenant_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: string;
          provider_event_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stripe_subscription_audit_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      stripe_subscription_operations: {
        Row: {
          actor_id: string | null;
          cadence: string | null;
          catalog_version_id: string | null;
          created_at: string;
          destination: string;
          effect_key: string;
          effect_token: string | null;
          expected_version: number | null;
          failure_code: string | null;
          operation_id: string;
          operation_kind: string;
          payload_hash: string;
          plan_key: string | null;
          provider_price_id: string | null;
          provider_reference: string | null;
          recovery_lease_expires_at: string | null;
          recovery_lease_owner: string | null;
          recovery_lease_token: string | null;
          redirect_url: string | null;
          state: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          cadence?: string | null;
          catalog_version_id?: string | null;
          created_at?: string;
          destination: string;
          effect_key: string;
          effect_token?: string | null;
          expected_version?: number | null;
          failure_code?: string | null;
          operation_id: string;
          operation_kind: string;
          payload_hash: string;
          plan_key?: string | null;
          provider_price_id?: string | null;
          provider_reference?: string | null;
          recovery_lease_expires_at?: string | null;
          recovery_lease_owner?: string | null;
          recovery_lease_token?: string | null;
          redirect_url?: string | null;
          state?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          actor_id?: string | null;
          cadence?: string | null;
          catalog_version_id?: string | null;
          created_at?: string;
          destination?: string;
          effect_key?: string;
          effect_token?: string | null;
          expected_version?: number | null;
          failure_code?: string | null;
          operation_id?: string;
          operation_kind?: string;
          payload_hash?: string;
          plan_key?: string | null;
          provider_price_id?: string | null;
          provider_reference?: string | null;
          recovery_lease_expires_at?: string | null;
          recovery_lease_owner?: string | null;
          recovery_lease_token?: string | null;
          redirect_url?: string | null;
          state?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stripe_subscription_operations_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stripe_subscription_operations_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_catalog_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stripe_subscription_operations_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_addon_assignments: {
        Row: {
          addon_key: string;
          catalog_version_id: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          quantity: number;
          subscription_id: string;
        };
        ComputedFields: never;
        Insert: {
          addon_key: string;
          catalog_version_id: string;
          effective_from: string;
          effective_to?: string | null;
          id?: string;
          quantity: number;
          subscription_id: string;
        };
        Update: {
          addon_key?: string;
          catalog_version_id?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          quantity?: number;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_addon_assignment_catalog_version_id_addon_key_fkey';
            columns: ['catalog_version_id', 'addon_key'];
            isOneToOne: false;
            referencedRelation: 'subscription_addons';
            referencedColumns: ['catalog_version_id', 'addon_key'];
          },
          {
            foreignKeyName: 'subscription_addon_assignments_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_catalog_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_addon_assignments_subscription_id_fkey';
            columns: ['subscription_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_addons: {
        Row: {
          addon_key: string;
          allowance_delta: number;
          allowance_key: string;
          annual_amount_minor: number;
          catalog_version_id: string;
          monthly_amount_minor: number;
        };
        ComputedFields: never;
        Insert: {
          addon_key: string;
          allowance_delta: number;
          allowance_key: string;
          annual_amount_minor: number;
          catalog_version_id: string;
          monthly_amount_minor: number;
        };
        Update: {
          addon_key?: string;
          allowance_delta?: number;
          allowance_key?: string;
          annual_amount_minor?: number;
          catalog_version_id?: string;
          monthly_amount_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_addons_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_catalog_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_allowance_operations: {
        Row: {
          allowance_key: string;
          allowance_limit: number;
          amount: number;
          created_at: string;
          operation_id: string;
          snapshot_id: string | null;
          source: string;
          source_id: string | null;
          status: string;
          tenant_id: string;
          used: number;
        };
        ComputedFields: never;
        Insert: {
          allowance_key: string;
          allowance_limit?: number;
          amount: number;
          created_at?: string;
          operation_id: string;
          snapshot_id?: string | null;
          source: string;
          source_id?: string | null;
          status: string;
          tenant_id: string;
          used?: number;
        };
        Update: {
          allowance_key?: string;
          allowance_limit?: number;
          amount?: number;
          created_at?: string;
          operation_id?: string;
          snapshot_id?: string | null;
          source?: string;
          source_id?: string | null;
          status?: string;
          tenant_id?: string;
          used?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_allowance_operations_snapshot_id_fkey';
            columns: ['snapshot_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_period_snapshots';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_allowance_operations_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_catalog_commands: {
        Row: {
          actor_id: string;
          command: string;
          created_at: string;
          operation_id: string;
          payload_hash: string;
          version_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          command: string;
          created_at?: string;
          operation_id: string;
          payload_hash: string;
          version_id: string;
        };
        Update: {
          actor_id?: string;
          command?: string;
          created_at?: string;
          operation_id?: string;
          payload_hash?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_catalog_commands_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_catalog_commands_version_id_fkey';
            columns: ['version_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_catalog_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_catalog_versions: {
        Row: {
          activated_by: string | null;
          catalog_class: string;
          catalog_key: string;
          cloned_from: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          effective_from: string | null;
          effective_to: string | null;
          id: string;
          label: string;
          review_reference: string | null;
          revision: number;
          state: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          activated_by?: string | null;
          catalog_class: string;
          catalog_key: string;
          cloned_from?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency: string;
          effective_from?: string | null;
          effective_to?: string | null;
          id?: string;
          label: string;
          review_reference?: string | null;
          revision?: number;
          state?: string;
          updated_at?: string;
        };
        Update: {
          activated_by?: string | null;
          catalog_class?: string;
          catalog_key?: string;
          cloned_from?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          effective_from?: string | null;
          effective_to?: string | null;
          id?: string;
          label?: string;
          review_reference?: string | null;
          revision?: number;
          state?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_catalog_versions_activated_by_fkey';
            columns: ['activated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_catalog_versions_cloned_from_fkey';
            columns: ['cloned_from'];
            isOneToOne: false;
            referencedRelation: 'subscription_catalog_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_catalog_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_period_snapshots: {
        Row: {
          addon_deltas: NonNullable<Json>;
          allowances: NonNullable<Json>;
          cadence: string;
          catalog_version_id: string;
          created_at: string;
          grace_until: string | null;
          id: string;
          period_end: string;
          period_start: string;
          plan_key: string;
          subscription_id: string;
          subscription_status: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          addon_deltas?: NonNullable<Json>;
          allowances: NonNullable<Json>;
          cadence: string;
          catalog_version_id: string;
          created_at?: string;
          grace_until?: string | null;
          id?: string;
          period_end: string;
          period_start: string;
          plan_key: string;
          subscription_id: string;
          subscription_status: string;
          tenant_id: string;
        };
        Update: {
          addon_deltas?: NonNullable<Json>;
          allowances?: NonNullable<Json>;
          cadence?: string;
          catalog_version_id?: string;
          created_at?: string;
          grace_until?: string | null;
          id?: string;
          period_end?: string;
          period_start?: string;
          plan_key?: string;
          subscription_id?: string;
          subscription_status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_period_snapshots_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_catalog_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_period_snapshots_subscription_id_fkey';
            columns: ['subscription_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_period_snapshots_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_plan_allowances: {
        Row: {
          allowance_key: string;
          allowance_value: number;
          catalog_version_id: string;
          plan_key: string;
        };
        ComputedFields: never;
        Insert: {
          allowance_key: string;
          allowance_value: number;
          catalog_version_id: string;
          plan_key: string;
        };
        Update: {
          allowance_key?: string;
          allowance_value?: number;
          catalog_version_id?: string;
          plan_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_plan_allowances_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_catalog_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_plan_prices: {
        Row: {
          amount_minor: number;
          cadence: string;
          catalog_version_id: string;
          plan_key: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          cadence: string;
          catalog_version_id: string;
          plan_key: string;
        };
        Update: {
          amount_minor?: number;
          cadence?: string;
          catalog_version_id?: string;
          plan_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_plan_prices_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_catalog_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_provider_enablement: {
        Row: {
          catalog_version_id: string;
          destination: string;
          enabled: boolean;
          id: string;
          provider: string;
          review_reference: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          catalog_version_id: string;
          destination: string;
          enabled?: boolean;
          id?: string;
          provider: string;
          review_reference: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          catalog_version_id?: string;
          destination?: string;
          enabled?: boolean;
          id?: string;
          provider?: string;
          review_reference?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_provider_enablement_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_catalog_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_provider_enablement_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_provider_price_mappings: {
        Row: {
          amount_minor: number;
          cadence: string;
          catalog_version_id: string;
          currency: string;
          destination: string;
          id: string;
          interval: string;
          plan_key: string;
          provider: string;
          provider_price_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          cadence: string;
          catalog_version_id: string;
          currency: string;
          destination: string;
          id?: string;
          interval: string;
          plan_key: string;
          provider: string;
          provider_price_id: string;
        };
        Update: {
          amount_minor?: number;
          cadence?: string;
          catalog_version_id?: string;
          currency?: string;
          destination?: string;
          id?: string;
          interval?: string;
          plan_key?: string;
          provider?: string;
          provider_price_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_provider_price_mappings_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_catalog_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_status_history: {
        Row: {
          amount_minor: number;
          currency: string;
          id: string;
          interval: string;
          status: string;
          subscription_id: string;
          tenant_id: string;
          valid_from: string;
          valid_to: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          currency: string;
          id?: string;
          interval: string;
          status: string;
          subscription_id: string;
          tenant_id: string;
          valid_from: string;
          valid_to?: string | null;
        };
        Update: {
          amount_minor?: number;
          currency?: string;
          id?: string;
          interval?: string;
          status?: string;
          subscription_id?: string;
          tenant_id?: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_status_history_subscription_id_fkey';
            columns: ['subscription_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_status_history_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_usage: {
        Row: {
          allowance_key: string;
          amount: number;
          created_at: string;
          id: string;
          operation_id: string;
          snapshot_id: string;
          source: string;
          source_id: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          allowance_key: string;
          amount: number;
          created_at?: string;
          id?: string;
          operation_id: string;
          snapshot_id: string;
          source: string;
          source_id?: string | null;
          tenant_id: string;
        };
        Update: {
          allowance_key?: string;
          amount?: number;
          created_at?: string;
          id?: string;
          operation_id?: string;
          snapshot_id?: string;
          source?: string;
          source_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_usage_snapshot_id_fkey';
            columns: ['snapshot_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_period_snapshots';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_usage_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      subscriptions: {
        Row: {
          cadence: string | null;
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          catalog_version_id: string | null;
          created_at: string;
          currency: string;
          current_period_end: string | null;
          current_period_start: string | null;
          destination: string | null;
          grace_until: string | null;
          id: string;
          interval: string;
          last_provider_body_hash: string | null;
          last_provider_created: number | null;
          last_provider_event_id: string | null;
          pending_cadence: string | null;
          pending_effective_at: string | null;
          pending_plan: string | null;
          plan: string;
          status: string;
          stripe_customer_id: string;
          stripe_price_id: string;
          stripe_subscription_id: string;
          tenant_id: string;
          unit_amount_minor: number;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          cadence?: string | null;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          catalog_version_id?: string | null;
          created_at?: string;
          currency?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          destination?: string | null;
          grace_until?: string | null;
          id?: string;
          interval: string;
          last_provider_body_hash?: string | null;
          last_provider_created?: number | null;
          last_provider_event_id?: string | null;
          pending_cadence?: string | null;
          pending_effective_at?: string | null;
          pending_plan?: string | null;
          plan: string;
          status: string;
          stripe_customer_id: string;
          stripe_price_id: string;
          stripe_subscription_id: string;
          tenant_id: string;
          unit_amount_minor: number;
          updated_at?: string;
          version?: number;
        };
        Update: {
          cadence?: string | null;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          catalog_version_id?: string | null;
          created_at?: string;
          currency?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          destination?: string | null;
          grace_until?: string | null;
          id?: string;
          interval?: string;
          last_provider_body_hash?: string | null;
          last_provider_created?: number | null;
          last_provider_event_id?: string | null;
          pending_cadence?: string | null;
          pending_effective_at?: string | null;
          pending_plan?: string | null;
          plan?: string;
          status?: string;
          stripe_customer_id?: string;
          stripe_price_id?: string;
          stripe_subscription_id?: string;
          tenant_id?: string;
          unit_amount_minor?: number;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_catalog_version_id_fkey';
            columns: ['catalog_version_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_catalog_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscriptions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: true;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      tap_provider_destinations: {
        Row: {
          account_id: string;
          company_id: string;
          created_at: string;
          destination_hash: string;
          enabled: boolean;
          id: string;
          provider: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          account_id: string;
          company_id: string;
          created_at?: string;
          destination_hash: string;
          enabled?: boolean;
          id?: string;
          provider?: string;
          tenant_id: string;
        };
        Update: {
          account_id?: string;
          company_id?: string;
          created_at?: string;
          destination_hash?: string;
          enabled?: boolean;
          id?: string;
          provider?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tap_provider_destinations_tenant_id_company_id_fkey';
            columns: ['tenant_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'company_profiles';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'tap_provider_destinations_tenant_id_provider_fkey';
            columns: ['tenant_id', 'provider'];
            isOneToOne: false;
            referencedRelation: 'tenant_payment_config';
            referencedColumns: ['tenant_id', 'provider'];
          },
        ];
      };
      tap_provider_events: {
        Row: {
          amount_minor: number;
          body_hash: string;
          currency: string;
          destination_id: string;
          fence_token: string;
          id: string;
          lease_expires_at: string | null;
          lease_owner: string | null;
          provider_event_id: string;
          provider_occurred_at: string;
          provider_reference: string;
          provider_status: string;
          received_at: string;
          reconciled_at: string | null;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          body_hash: string;
          currency: string;
          destination_id: string;
          fence_token?: string;
          id?: string;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          provider_event_id: string;
          provider_occurred_at: string;
          provider_reference: string;
          provider_status: string;
          received_at?: string;
          reconciled_at?: string | null;
          state?: string;
        };
        Update: {
          amount_minor?: number;
          body_hash?: string;
          currency?: string;
          destination_id?: string;
          fence_token?: string;
          id?: string;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          provider_event_id?: string;
          provider_occurred_at?: string;
          provider_reference?: string;
          provider_status?: string;
          received_at?: string;
          reconciled_at?: string | null;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tap_provider_events_currency_fkey';
            columns: ['currency'];
            isOneToOne: false;
            referencedRelation: 'finance_currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'tap_provider_events_destination_id_fkey';
            columns: ['destination_id'];
            isOneToOne: false;
            referencedRelation: 'tap_provider_destinations';
            referencedColumns: ['id'];
          },
        ];
      };
      tenant_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: NonNullable<Json>;
          id: number;
          source: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: never;
          source: string;
          tenant_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
          id: string;
          ip: unknown;
          not_after: string | null;
          refreshed_at: string | null;
          user_agent: string | null;
          user_id: string;
        };
        ComputedFields: never;
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
          company_id: string;
          completed_at: string | null;
          created_at: string;
          due_at: string | null;
          id: string;
          priority: string;
          priority_rank: number | null;
          service_type: string;
          sla_breach_rank: number | null;
          sla_due_at: string | null;
          status: string;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
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
      _document_access_audit: {
        Args: {
          p_actor_id: string;
          p_classification: string;
          p_context: Json;
          p_event: string;
          p_expires_at: string;
          p_lifetime_seconds: number;
          p_phase: string;
        };
        Returns: string;
      };
      _document_access_business_date: { Args: Record<PropertyKey, never>; Returns: string };
      _document_access_context: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_document_id: string;
          p_lifetime_seconds: number;
          p_tenant_id: string;
          p_version_id: string;
        };
        Returns: Json;
      };
      _document_access_current_pro_credential: { Args: { p_actor_id: string }; Returns: boolean };
      _document_access_resolve_before_provider_identity: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_document_id: string;
          p_lifetime_seconds: number;
          p_tenant_id: string;
          p_version_id: string;
        };
        Returns: Json;
      };
      _document_upload_authorize_before_provider_identity: {
        Args: {
          p_company_id: string;
          p_fence: string;
          p_operation_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      _document_upload_business_date: { Args: Record<PropertyKey, never>; Returns: string };
      _document_upload_claim_before_provider_identity: {
        Args: {
          p_company_id: string;
          p_lease_seconds?: number;
          p_operation_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      _document_upload_cleanup_audit: {
        Args: {
          p_classification: string;
          p_event: string;
          r: Omit<
            Database['public']['Tables']['document_upload_operations']['Row'],
            Database['public']['Tables']['document_upload_operations']['ComputedFields']
          >;
        };
        Returns: undefined;
      };
      _document_upload_cleanup_lock: {
        Args: { p_company_id: string; p_operation_id: string; p_tenant_id: string };
        Returns: {
          actor_id: string;
          cleanup_authorized: boolean;
          cleanup_completed_at: string | null;
          cleanup_fence: string | null;
          cleanup_hold: boolean;
          cleanup_lease_until: string | null;
          committed_receipt: Json | null;
          company_id: string;
          deadline_at: string;
          doc_type: string;
          document_id: string;
          employee_id: string | null;
          expected_head: string | null;
          extension: string;
          finalized_at: string | null;
          input_document_id: string | null;
          label: string | null;
          mime_type: string;
          object_id: string;
          operation_id: string;
          payload_fingerprint: string;
          prepared_at: string;
          request_id: string | null;
          reserved_version_id: string;
          safe_filename: string;
          scan_completed_at: string | null;
          scan_provider: string | null;
          sha256: string;
          size_bytes: number;
          state: string;
          storage_path: string;
          tenant_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'document_upload_operations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      _document_upload_cleanup_unreferenced: {
        Args: {
          r: Omit<
            Database['public']['Tables']['document_upload_operations']['Row'],
            Database['public']['Tables']['document_upload_operations']['ComputedFields']
          >;
        };
        Returns: undefined;
      };
      _document_upload_current_pro_credential: { Args: { p_actor_id: string }; Returns: undefined };
      _document_upload_finalize_before_cleanup: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_mime_type: string;
          p_operation_id: string;
          p_scan_completed_at: string;
          p_scan_provider: string;
          p_scan_state: string;
          p_sha256: string;
          p_size_bytes: number;
          p_storage_path: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      _document_upload_finalize_before_wallclock_authority: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_mime_type: string;
          p_operation_id: string;
          p_scan_completed_at: string;
          p_scan_provider: string;
          p_scan_state: string;
          p_sha256: string;
          p_size_bytes: number;
          p_storage_path: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      _document_upload_lock_authority: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_employee_id: string;
          p_request_id: string;
          p_tenant_id: string;
        };
        Returns: undefined;
      };
      _document_upload_lock_resource: {
        Args: {
          p_allow_fulfilled: boolean;
          p_company_id: string;
          p_doc_type: string;
          p_document_id: string;
          p_employee_id: string;
          p_request_id: string;
          p_tenant_id: string;
        };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'documents';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      _document_upload_prepare_before_provider_identity: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_doc_type: string;
          p_document_id: string;
          p_employee_id: string;
          p_expected_head: string;
          p_extension: string;
          p_label: string;
          p_mime_type: string;
          p_operation_id: string;
          p_request_id: string;
          p_safe_filename: string;
          p_sha256: string;
          p_size_bytes: number;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      _document_upload_prepare_before_wallclock_authority: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_doc_type: string;
          p_document_id: string;
          p_employee_id: string;
          p_expected_head: string;
          p_extension: string;
          p_label: string;
          p_mime_type: string;
          p_operation_id: string;
          p_request_id: string;
          p_safe_filename: string;
          p_sha256: string;
          p_size_bytes: number;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      _document_upload_provider_identity: {
        Args: {
          r: Omit<
            Database['public']['Tables']['document_upload_operations']['Row'],
            Database['public']['Tables']['document_upload_operations']['ComputedFields']
          >;
        };
        Returns: Json;
      };
      _document_upload_receipt_before_wallclock_authority: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_operation_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      _document_upload_reconcile_before_provider_identity: {
        Args: { p_company_id: string; p_operation_id: string; p_tenant_id: string };
        Returns: Json;
      };
      accept_inbound_webhook: {
        Args: {
          p_body: string;
          p_channel: string;
          p_destination_key_hash: string;
          p_from_phone: string;
          p_occurred_at: string;
          p_payload_hash: string;
          p_provider: string;
          p_provider_event_id: string;
          p_provider_event_id_hash: string;
          p_signature_verified: boolean;
        };
        Returns: {
          inbox_id: number;
          outcome: string;
          received_at: string;
          routing_key: string;
          tenant_id: string;
        }[];
      };
      accept_public_contact: {
        Args: {
          p_abuse_scope_hash: string;
          p_consent_accepted_at: string;
          p_consent_version: string;
          p_normalized_payload: Json;
          p_operation_id: string;
          p_request_hash: string;
        };
        Returns: Json;
      };
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
      append_data_access_event: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_correlation_id: string;
          p_event_name: string;
          p_operation_id: string;
          p_outcome: string;
          p_reason_code: string;
          p_resource_type: string;
          p_safe_metadata: Json;
          p_source_class: string;
          p_target_opaque_id: string;
          p_tenant_id: string;
        };
        Returns: string;
      };
      append_platform_audit_event: {
        Args: {
          p_action: string;
          p_actor_id: string;
          p_correlation_id: string;
          p_event_name: string;
          p_operation_id: string;
          p_outcome: string;
          p_reason_code: string;
          p_safe_metadata: Json;
          p_source_class: string;
          p_target_opaque_id: string;
          p_target_type: string;
          p_tenant_id: string;
        };
        Returns: string;
      };
      approve_erasure_request: {
        Args: {
          p_actor_id: string;
          p_correlation_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      archive_questionnaire_version: {
        Args: { p_definition_id: string; p_expected_definition_version: number; p_version: number };
        Returns: Json;
      };
      assert_erasure_cleanup_allowed: { Args: { p_request_id: string }; Returns: undefined };
      assert_pro_lifecycle_actor: {
        Args: { p_actor_id: string; p_operator_only?: boolean; p_target_pro_profile_id: string };
        Returns: string;
      };
      assert_safe_pro_decision_reason: {
        Args: { p_reason: string; p_reason_code: string };
        Returns: undefined;
      };
      assert_safe_pro_lifecycle_result: {
        Args: {
          p_entity_kind: Database['public']['Enums']['pro_lifecycle_operation_kind'];
          p_result: Json;
        };
        Returns: undefined;
      };
      assign_pro_to_company: {
        Args: { p_actor_profile_id: string; p_company_id: string; p_pro_profile_id: string };
        Returns: Json;
      };
      assign_pro_to_company_with_context: {
        Args: { p_actor_profile_id: string; p_company_id: string; p_pro_profile_id: string };
        Returns: Json;
      };
      authorize_assigned_company_settings: {
        Args: { p_actor_profile_id: string; p_company_id: string; p_tenant_id: string };
        Returns: undefined;
      };
      authorize_document_upload_cleanup: {
        Args: {
          p_company_id: string;
          p_fence: string;
          p_operation_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      authorize_pro_company_access: {
        Args: { p_actor_id: string; p_company_id?: string; p_tenant_id: string };
        Returns: boolean;
      };
      authorize_pro_lifecycle_actor: {
        Args: { p_actor_id: string; p_operator_only?: boolean; p_target_pro_profile_id: string };
        Returns: string;
      };
      authorize_registration_mutation: {
        Args: {
          p_actor_aal: string;
          p_actor_id: string;
          p_company_id: string;
          p_tenant_id: string;
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
      can_read_document_metadata: {
        Args: {
          p_company_id: string;
          p_doc_type: string;
          p_employee_id: string;
          p_request_id: string;
          p_tenant_id: string;
        };
        Returns: boolean;
      };
      cancel_event_job: { Args: { p_error_code: string; p_job_id: string }; Returns: boolean };
      cancel_leased_event_job: {
        Args: {
          p_error_code: string;
          p_job_id: string;
          p_lease_token: string;
          p_worker_id: string;
        };
        Returns: boolean;
      };
      cancel_registration_visa_person: {
        Args: {
          p_actor_aal: string;
          p_actor_id: string;
          p_company_id: string;
          p_expected_visa_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_reason_code: string;
          p_reason_text: string;
          p_registration_id: string;
          p_tenant_id: string;
          p_visa_person_id: string;
        };
        Returns: Json;
      };
      catalog_version_is_public: { Args: { p_version_id: string }; Returns: boolean };
      claim_document_upload_cleanup: {
        Args: {
          p_company_id: string;
          p_lease_seconds?: number;
          p_operation_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      claim_event_jobs: {
        Args: {
          p_batch_size?: number;
          p_consumer_name: string;
          p_lease_seconds?: number;
          p_worker_id: string;
        };
        Returns: {
          actor_id: string;
          attempt_number: number;
          causation_id: string;
          company_id: string;
          consumer_name: string;
          correlation_id: string;
          effect_key: string;
          event_id: string;
          event_type: string;
          event_version: number;
          job_id: string;
          lease_expires_at: string;
          lease_token: string;
          max_attempts: number;
          occurred_at: string;
          payload: Json;
          privacy_class: string;
          tenant_id: string;
        }[];
      };
      claim_pro_credential_evidence_removal_recovery: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_evidence_id: string;
          p_pro_profile_id: string;
          p_recovery_operation_id: string;
        };
        Returns: Json;
      };
      claim_pro_credential_evidence_upload_cleanup: {
        Args: { p_limit: number; p_recovery_operation_id: string };
        Returns: Json;
      };
      cleanup_company_onboarding_operations: { Args: Record<PropertyKey, never>; Returns: number };
      cleanup_finalized_pro_credential_evidence_upload_reservations: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      cleanup_pro_credential_evidence_removals: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      cleanup_pro_lifecycle_operation_receipts: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
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
      complete_document_upload_cleanup: {
        Args: {
          p_company_id: string;
          p_deleted: boolean;
          p_fence: string;
          p_operation_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      complete_erasure_cleanup: {
        Args: { p_actor_id: string; p_request_id: string; p_tenant_id: string };
        Returns: Json;
      };
      complete_event_job: {
        Args: {
          p_effect_reference_hash?: string;
          p_job_id: string;
          p_lease_token: string;
          p_worker_id: string;
        };
        Returns: boolean;
      };
      compute_notify_at: { Args: { due: string; renewal_type: string }; Returns: string[] };
      cost_data_version_is_public: {
        Args: { p_authority_id: string; p_source_id: string; p_version_id: string };
        Returns: boolean;
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
      create_company_registration: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_due_at: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_priority: string;
          p_tenant_id: string;
          p_title: string;
        };
        Returns: Json;
      };
      create_document_request_batch: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_items: Json;
          p_operation_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      create_p3_12_report_export: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_correlation_id: string;
          p_file_size_bytes: number;
          p_filters: Json;
          p_operation_id: string;
          p_report_id: string;
          p_row_count: number;
        };
        Returns: Json;
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
      create_public_application_draft: {
        Args: {
          p_definition_id: string;
          p_definition_version: number;
          p_expires_at: string;
          p_operation_id: string;
          p_request_hash: string;
          p_resume_secret_hash: string;
        };
        Returns: Json;
      };
      create_registration_visa_person: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_display_name: string;
          p_employee_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_person_kind: Database['public']['Enums']['registration_person_kind'];
          p_registration_id: string;
          p_shareholder_id: string;
          p_tenant_id: string;
          p_visa_kind: Database['public']['Enums']['registration_visa_kind'];
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
      delete_public_application_attachment: {
        Args: { p_attachment_id: string; p_draft_id: string; p_resume_secret_hash: string };
        Returns: Json;
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
      evaluate_company_assignment_eligibility: {
        Args: { p_company_id: string; p_expected_assignment_id?: string; p_pro_profile_id: string };
        Returns: Json;
      };
      evaluate_pro_assignment_eligibility: {
        Args: { p_company_id?: string; p_pro_profile_id: string };
        Returns: Json;
      };
      event_payload_is_safe: { Args: { p_payload: Json }; Returns: boolean };
      event_payload_matches_schema: { Args: { p_payload: Json; p_schema: Json }; Returns: boolean };
      extend_event_job_lease: {
        Args: {
          p_job_id: string;
          p_lease_seconds: number;
          p_lease_token: string;
          p_worker_id: string;
        };
        Returns: string;
      };
      fail_event_job: {
        Args: {
          p_error_category: string;
          p_error_code: string;
          p_job_id: string;
          p_lease_token: string;
          p_retryable: boolean;
          p_worker_id: string;
        };
        Returns: string;
      };
      finalize_document_access_grant: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_document_id: string;
          p_expected_operation_id: string;
          p_expected_sha256: string;
          p_lifetime_seconds: number;
          p_provider_expires_at: string;
          p_tenant_id: string;
          p_version_id: string;
        };
        Returns: Json;
      };
      finalize_document_upload: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_mime_type: string;
          p_operation_id: string;
          p_scan_completed_at: string;
          p_scan_provider: string;
          p_scan_state: string;
          p_sha256: string;
          p_size_bytes: number;
          p_storage_path: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      finalize_pro_credential_evidence_removal: {
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
      finalize_pro_credential_evidence_removal_recovery: {
        Args: {
          p_actor_id: string;
          p_credential_id: string;
          p_evidence_id: string;
          p_pro_profile_id: string;
          p_recovery_operation_id: string;
        };
        Returns: Json;
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
      finalize_pro_credential_evidence_upload_cleanup: {
        Args: { p_recovery_operation_id: string; p_reservation_id: string };
        Returns: Json;
      };
      finalize_public_application_attachment: {
        Args: {
          p_attachment_id: string;
          p_draft_id: string;
          p_resume_secret_hash: string;
          p_storage_path: string;
        };
        Returns: Json;
      };
      get_document_upload_receipt: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_operation_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      get_pro_document_version_history: {
        Args: { p_document_id: string; p_tenant_id: string };
        Returns: Json;
      };
      has_company_access: { Args: { p_tenant_id: string }; Returns: boolean };
      has_company_storage_access: { Args: { p_object_name: string }; Returns: boolean };
      has_current_pro_credential: { Args: { p_pro_profile_id: string }; Returns: boolean };
      import_cost_data: {
        Args: { p_actor_id: string; p_operation_id: string; p_rows: Json };
        Returns: Json;
      };
      is_valid_company_settings_http_url: { Args: { p_url: string }; Returns: boolean };
      link_registration_stage_document: {
        Args: {
          p_actor_aal: string;
          p_actor_id: string;
          p_company_id: string;
          p_document_id: string;
          p_document_version_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_registration_id: string;
          p_role: Database['public']['Enums']['registration_document_role'];
          p_stage_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      list_admin_document_center: {
        Args: {
          p_doc_type: string;
          p_page: number;
          p_page_size: number;
          p_search: string;
          p_state: string;
        };
        Returns: Json;
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
      list_document_upload_cleanup_candidates: {
        Args: { p_company_id: string; p_limit?: number; p_tenant_id: string };
        Returns: Json;
      };
      list_eligible_pros_for_company: {
        Args: { p_actor_id: string; p_company_id: string; p_limit?: number; p_query?: string };
        Returns: Json;
      };
      list_operational_activity: {
        Args: {
          p_before_created_at?: string;
          p_before_id?: string;
          p_company_id: string;
          p_limit?: number;
        };
        Returns: {
          activity_code: string;
          actor_profile_id: string | null;
          company_id: string;
          created_at: string;
          id: string;
          projection_key: string;
          safe_metadata: NonNullable<Json>;
          source_event_id: string;
          source_job_id: string;
          tenant_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'operational_activity';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      list_operational_notifications: {
        Args: {
          p_before_created_at?: string;
          p_before_id?: string;
          p_company_id: string;
          p_limit?: number;
        };
        Returns: {
          company_id: string;
          created_at: string;
          id: string;
          notification_code: string;
          projection_key: string;
          read_at: string | null;
          recipient_profile_id: string;
          safe_metadata: NonNullable<Json>;
          severity: string;
          source_event_id: string;
          source_job_id: string;
          tenant_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'operational_notifications';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      list_operational_tasks: {
        Args: {
          p_before_created_at?: string;
          p_before_id?: string;
          p_company_id: string;
          p_limit?: number;
        };
        Returns: {
          assigned_profile_id: string | null;
          company_id: string;
          created_at: string;
          due_at: string | null;
          id: string;
          priority: string;
          projection_key: string;
          safe_metadata: NonNullable<Json>;
          source_event_id: string;
          source_job_id: string;
          state: string;
          task_code: string;
          tenant_id: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'operational_tasks';
          isOneToOne: false;
          isSetofReturn: true;
        };
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
      materialize_expired_pro_credentials: { Args: Record<PropertyKey, never>; Returns: number };
      mutate_assigned_company_settings: {
        Args: {
          p_actor_profile_id: string;
          p_company_id: string;
          p_expected_version: number;
          p_input: Json;
          p_operation_id: string;
          p_replacement_secret_encrypted?: string;
          p_replacement_secret_fingerprint?: string;
          p_section: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      mutate_cost_data: {
        Args: {
          p_action: string;
          p_actor_id: string;
          p_entity_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload: Json;
        };
        Returns: Json;
      };
      mutate_editorial_content: {
        Args: {
          p_action: string;
          p_actor_id: string;
          p_entity_id: string;
          p_entity_type: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload: Json;
        };
        Returns: Json;
      };
      mutate_platform_lead: {
        Args: {
          p_action: string;
          p_expected_version: number;
          p_lead_id: string;
          p_operation_id: string;
          p_request_hash: string;
          p_value: string;
        };
        Returns: Json;
      };
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
      p3_12_metadata_is_safe: { Args: { value: Json }; Returns: boolean };
      p308_apply_import_batch: {
        Args: {
          p_batch_no: number;
          p_first_row: number;
          p_job_id: string;
          p_lease_token: string;
          p_rows: Json;
          p_worker_id: string;
        };
        Returns: Json;
      };
      p308_batch_transition_renewals: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_items: Json;
          p_operation_id: string;
          p_payload_hash: string;
          p_reason_code: string;
          p_tenant_id: string;
          p_to_stage: string;
        };
        Returns: Json;
      };
      p308_cancel_import: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_version: number;
          p_job_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p308_create_employee: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_employee: Json;
          p_operation_id: string;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p308_create_renewal: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_renewal: Json;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p308_finalize_import: {
        Args: {
          p_failure_code?: string;
          p_job_id: string;
          p_lease_token: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      p308_list_expired_import_artifacts: {
        Args: { p_limit: number };
        Returns: {
          artifact_sha256: string;
          job_id: string;
          storage_path: string;
        }[];
      };
      p308_mark_import_artifact_deleted: {
        Args: { p_job_id: string; p_worker_id: string };
        Returns: boolean;
      };
      p308_read_import_execution: {
        Args: { p_job_id: string; p_lease_token: string; p_worker_id: string };
        Returns: Json;
      };
      p308_read_renewal_health: { Args: Record<PropertyKey, never>; Returns: Json };
      p308_reconcile_stuck_imports: { Args: { p_limit: number }; Returns: number };
      p308_record_import_artifact_access: {
        Args: {
          p_actor_id: string;
          p_artifact_sha256: string;
          p_job_id: string;
          p_purpose: string;
          p_worker_id: string;
        };
        Returns: undefined;
      };
      p308_record_import_validation: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_error_rows: number;
          p_errors: Json;
          p_expected_version: number;
          p_job_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_tenant_id: string;
          p_total_rows: number;
        };
        Returns: Json;
      };
      p308_register_import: {
        Args: {
          p_actor_id: string;
          p_artifact_bytes: number;
          p_artifact_sha256: string;
          p_company_id: string;
          p_job_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_storage_path: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p308_request_import_execution: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_version: number;
          p_job_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p308_set_employee_status: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_employee_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_status: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p308_transition_renewal: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_evidence_document_ids: string[];
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_reason_code: string;
          p_renewal_id: string;
          p_tenant_id: string;
          p_to_stage: string;
        };
        Returns: Json;
      };
      p308_update_employee: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_employee_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_patch: Json;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p308_update_employee_self: {
        Args: {
          p_actor_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_patch: Json;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p308_update_renewal: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_patch: Json;
          p_payload_hash: string;
          p_renewal_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_activate_subscription_catalog: {
        Args: {
          p_actor_id: string;
          p_effective_from: string;
          p_expected_revision: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_review_reference: string;
          p_version_id: string;
        };
        Returns: {
          replayed: boolean;
          version_id: string;
        }[];
      };
      p309_allocate_manual_payment: {
        Args: {
          p_actor_id: string;
          p_amount_minor: number;
          p_company_id: string;
          p_expected_version: number;
          p_invoice_id: string;
          p_method: string;
          p_note: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_allocate_reviewed_bank_payment: {
        Args: {
          p_actor_id: string;
          p_amount_minor: number;
          p_company_id: string;
          p_expected_version: number;
          p_invoice_id: string;
          p_note: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_submission_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_apply_stripe_subscription_event: {
        Args: {
          p_amount_minor: number;
          p_cancel_at_period_end: boolean;
          p_canceled_at: string;
          p_currency: string;
          p_event_id: string;
          p_interval: string;
          p_metadata_tenant_id?: string;
          p_period_end: string;
          p_period_start: string;
          p_provider_price_id: string;
          p_status: string;
          p_stripe_customer_id: string;
          p_stripe_subscription_id: string;
        };
        Returns: Json;
      };
      p309_approve_compensation: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_compensation_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_approve_expense: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_version: number;
          p_expense_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_attach_payment_attempt: {
        Args: {
          p_attempt_id: string;
          p_effect_key: string;
          p_effect_token: string;
          p_provider_reference: string;
          p_redirect_url: string;
        };
        Returns: Json;
      };
      p309_attach_payment_attempt_recovery: {
        Args: {
          p_attempt_id: string;
          p_effect_key: string;
          p_lease_token: string;
          p_provider_reference: string;
          p_redirect_url: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      p309_attach_pending_refund: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_version: number;
          p_invoice_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_payment_id: string;
          p_provider_refund_id: string;
          p_refund_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_attach_refund_effect_recovery: {
        Args: {
          p_lease_token: string;
          p_provider_effect_key: string;
          p_provider_refund_id: string;
          p_refund_id: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      p309_attach_stripe_operation: {
        Args: {
          p_effect_token: string;
          p_operation_id: string;
          p_provider_reference: string;
          p_redirect_url: string;
        };
        Returns: Json;
      };
      p309_attach_tap_compensation: {
        Args: {
          p_attempt_id: string;
          p_compensation_reference: string;
          p_effect_key: string;
          p_lease_token: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      p309_bind_stripe_customer: {
        Args: {
          p_operation_id: string;
          p_provider_reference: string;
          p_stripe_customer_id: string;
        };
        Returns: string;
      };
      p309_claim_stripe_operation_recovery: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker_id: string };
        Returns: {
          actor_id: string | null;
          cadence: string | null;
          catalog_version_id: string | null;
          created_at: string;
          destination: string;
          effect_key: string;
          effect_token: string | null;
          expected_version: number | null;
          failure_code: string | null;
          operation_id: string;
          operation_kind: string;
          payload_hash: string;
          plan_key: string | null;
          provider_price_id: string | null;
          provider_reference: string | null;
          recovery_lease_expires_at: string | null;
          recovery_lease_owner: string | null;
          recovery_lease_token: string | null;
          redirect_url: string | null;
          state: string;
          tenant_id: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'stripe_subscription_operations';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      p309_claim_tap_compensation: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker_id: string };
        Returns: {
          amount_minor: number;
          company_id: string;
          compensation_effect_key: string | null;
          compensation_reference: string | null;
          created_at: string;
          currency: string;
          customer_profile_id: string;
          destination_id: string;
          effect_lease_expires_at: string;
          effect_lease_token: string;
          expected_invoice_version: number;
          failure_code: string | null;
          id: string;
          invoice_id: string;
          last_provider_body_hash: string | null;
          last_provider_event_id: string | null;
          last_provider_occurred_at: string | null;
          lease_expires_at: string | null;
          lease_owner: string | null;
          lease_token: string | null;
          operation_id: string;
          payload_hash: string;
          payment_id: string;
          provider: string;
          provider_effect_hash: string;
          provider_effect_key: string;
          provider_reference: string | null;
          redirect_url: string | null;
          state: string;
          tenant_id: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'payment_provider_attempts';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      p309_claim_tap_event_recovery: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker_id: string };
        Returns: {
          amount_minor: number;
          body_hash: string;
          currency: string;
          destination_id: string;
          fence_token: string;
          id: string;
          lease_expires_at: string | null;
          lease_owner: string | null;
          provider_event_id: string;
          provider_occurred_at: string;
          provider_reference: string;
          provider_status: string;
          received_at: string;
          reconciled_at: string | null;
          state: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'tap_provider_events';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      p309_claim_tap_recovery: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker_id: string };
        Returns: {
          amount_minor: number;
          company_id: string;
          compensation_effect_key: string | null;
          compensation_reference: string | null;
          created_at: string;
          currency: string;
          customer_profile_id: string;
          destination_id: string;
          effect_lease_expires_at: string;
          effect_lease_token: string;
          expected_invoice_version: number;
          failure_code: string | null;
          id: string;
          invoice_id: string;
          last_provider_body_hash: string | null;
          last_provider_event_id: string | null;
          last_provider_occurred_at: string | null;
          lease_expires_at: string | null;
          lease_owner: string | null;
          lease_token: string | null;
          operation_id: string;
          payload_hash: string;
          payment_id: string;
          provider: string;
          provider_effect_hash: string;
          provider_effect_key: string;
          provider_reference: string | null;
          redirect_url: string | null;
          state: string;
          tenant_id: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'payment_provider_attempts';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      p309_claim_tap_refund_recovery: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker_id: string };
        Returns: {
          amount_minor: number;
          created_at: string;
          currency: string | null;
          id: string;
          idempotency_key: string | null;
          ledger_eligible: boolean;
          payment_id: string;
          provider_effect_hash: string | null;
          provider_effect_key: string | null;
          provider_effect_state: string | null;
          provider_idempotency_key: string | null;
          provider_refund_id: string | null;
          quarantine_reason: string | null;
          reason: string | null;
          recovery_lease_expires_at: string | null;
          recovery_lease_owner: string | null;
          recovery_lease_token: string | null;
          status: string;
          tenant_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'refunds';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      p309_clone_subscription_catalog: {
        Args: {
          p_actor_id: string;
          p_catalog_key: string;
          p_label: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_review_reference: string;
          p_source_version_id: string;
        };
        Returns: {
          replayed: boolean;
          version_id: string;
        }[];
      };
      p309_complete_tap_compensation: {
        Args: { p_attempt_id: string; p_lease_token: string; p_worker_id: string };
        Returns: boolean;
      };
      p309_complete_tap_recovery: {
        Args: { p_attempt_id: string; p_lease_token: string; p_worker_id: string };
        Returns: boolean;
      };
      p309_complete_tap_refund_recovery: {
        Args: { p_lease_token: string; p_refund_id: string; p_worker_id: string };
        Returns: boolean;
      };
      p309_consume_finance_export: {
        Args: { p_operation_id: string; p_source_id?: string; p_tenant_id: string };
        Returns: {
          allowance_limit: number;
          replayed: boolean;
          snapshot_id: string;
          status: string;
          used: number;
        }[];
      };
      p309_consume_plan_allowance: {
        Args: {
          p_allowance_key: string;
          p_amount: number;
          p_operation_id: string;
          p_source: string;
          p_source_id?: string;
          p_tenant_id: string;
        };
        Returns: {
          allowance_limit: number;
          replayed: boolean;
          snapshot_id: string;
          status: string;
          used: number;
        }[];
      };
      p309_create_compensation_draft: {
        Args: {
          p_actor_id: string;
          p_amount_minor: number;
          p_company_id: string;
          p_currency: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_pro_profile_id: string;
          p_source_reference: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_create_expense_draft: {
        Args: {
          p_actor_id: string;
          p_amount_minor: number;
          p_company_id: string;
          p_currency: string;
          p_description: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_source_reference: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_create_invoice_draft: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_customer_profile_id: string;
          p_due_date: string;
          p_expected_version: number;
          p_label: string;
          p_lines: Json;
          p_operation_id: string;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_edit_subscription_catalog: {
        Args: {
          p_actor_id: string;
          p_expected_revision: number;
          p_label: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_review_reference: string;
          p_version_id: string;
        };
        Returns: {
          replayed: boolean;
          version_id: string;
        }[];
      };
      p309_export_finance_page: {
        Args: {
          p_actor_id: string;
          p_before_accounting_at?: string;
          p_before_id?: string;
          p_company_id: string;
          p_currency?: string;
          p_end_at: string;
          p_kind?: string;
          p_limit?: number;
          p_operation_id: string;
          p_start_at: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_fail_payment_attempt: {
        Args: { p_attempt_id: string; p_failure_code: string };
        Returns: Json;
      };
      p309_finalize_bank_evidence: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_customer_profile_id: string;
          p_document_id: string;
          p_invoice_id: string;
          p_operation_id: string;
          p_submission_id: string;
          p_tenant_id: string;
          p_version_id: string;
        };
        Returns: Json;
      };
      p309_finalize_invoice: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_version: number;
          p_invoice_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_finance_report: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_customer_profile_id: string;
          p_end_at: string;
          p_start_at: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_generate_finance_receipt: {
        Args: {
          p_actor_id: string;
          p_actor_role: string;
          p_company_id: string;
          p_invoice_id: string;
          p_receipt_id: string;
          p_receipt_kind: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_get_company_invoice: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_invoice_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_get_customer_invoice: {
        Args: {
          p_company_id: string;
          p_customer_profile_id: string;
          p_invoice_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_get_refund_result: { Args: { p_refund_id: string }; Returns: Json };
      p309_list_company_finance_costs: {
        Args: {
          p_actor_id: string;
          p_before_accounting_at?: string;
          p_before_id?: string;
          p_company_id: string;
          p_limit?: number;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_list_company_invoices: {
        Args: {
          p_actor_id: string;
          p_before_created_at?: string;
          p_before_id?: string;
          p_company_id: string;
          p_date?: string;
          p_limit?: number;
          p_period?: string;
          p_tenant_id: string;
          p_today?: string;
          p_view?: string;
        };
        Returns: Json;
      };
      p309_list_customer_invoices: {
        Args: {
          p_before_created_at?: string;
          p_before_id?: string;
          p_company_id: string;
          p_customer_profile_id: string;
          p_invoice_id?: string;
          p_limit?: number;
          p_status?: string;
          p_tenant_id: string;
          p_today?: string;
        };
        Returns: Json;
      };
      p309_list_customer_payment_history: {
        Args: { p_customer_profile_id: string };
        Returns: Json;
      };
      p309_mark_stripe_operation_unknown: {
        Args: { p_failure_code: string; p_operation_id: string };
        Returns: undefined;
      };
      p309_post_compensation: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_compensation_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_post_expense: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_version: number;
          p_expense_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_settlement_account: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_prepare_bank_evidence: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_customer_profile_id: string;
          p_expires_at: string;
          p_invoice_id: string;
          p_operation_id: string;
          p_policy_key: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_prepare_refund: {
        Args: {
          p_actor_id: string;
          p_amount_minor: number;
          p_company_id: string;
          p_expected_version: number;
          p_invoice_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_payment_id: string;
          p_reason: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_reconcile_claimed_refund: {
        Args: {
          p_lease_token: string;
          p_provider_refund_id: string;
          p_refund_id: string;
          p_status: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      p309_reconcile_payment_attempt: {
        Args: {
          p_amount_minor: number;
          p_attempt_id: string;
          p_currency: string;
          p_lease_token?: string;
          p_provider_reference: string;
          p_provider_status: string;
          p_worker_id?: string;
        };
        Returns: Json;
      };
      p309_reconcile_pending_refund: {
        Args: { p_provider_refund_id: string; p_refund_id: string; p_status: string };
        Returns: Json;
      };
      p309_reconcile_refund: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_version: number;
          p_invoice_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_payment_id: string;
          p_provider_refund_id: string;
          p_refund_id: string;
          p_status: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_reconcile_tap_compensation: {
        Args: {
          p_attempt_id: string;
          p_compensation_reference: string;
          p_lease_token: string;
          p_status: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      p309_reconcile_tap_event: {
        Args: { p_event_id: string; p_fence_token: string };
        Returns: Json;
      };
      p309_require_catalog_actor: { Args: { p_actor_id: string }; Returns: undefined };
      p309_reserve_payment_attempt: {
        Args: {
          p_company_id: string;
          p_customer_profile_id: string;
          p_destination_id: string;
          p_expected_invoice_version: number;
          p_invoice_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_reserve_refund_effect: {
        Args: {
          p_provider_effect_hash: string;
          p_provider_effect_key: string;
          p_refund_id: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      p309_reserve_stripe_event: {
        Args: {
          p_body_hash: string;
          p_destination: string;
          p_event_type: string;
          p_provider_created: number;
          p_provider_event_id: string;
          p_stripe_customer_id: string;
          p_stripe_subscription_id: string;
        };
        Returns: Json;
      };
      p309_reserve_stripe_operation: {
        Args: {
          p_actor_id: string;
          p_cadence: string;
          p_catalog_version_id: string;
          p_company_id: string;
          p_destination: string;
          p_expected_version: number;
          p_operation_id: string;
          p_operation_kind: string;
          p_payload_hash: string;
          p_plan_key: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_reserve_tap_event: {
        Args: {
          p_amount_minor: number;
          p_body_hash: string;
          p_currency: string;
          p_destination_id: string;
          p_provider_event_id: string;
          p_provider_occurred_at: string;
          p_provider_reference: string;
          p_provider_status: string;
        };
        Returns: Json;
      };
      p309_resolve_bank_evidence_access: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_submission_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_resolve_provider_price: {
        Args: {
          p_cadence: string;
          p_catalog_version_id: string;
          p_destination: string;
          p_plan_key: string;
          p_provider: string;
        };
        Returns: {
          provider_price_id: string;
          status: string;
        }[];
      };
      p309_reverse_compensation: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_compensation_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_reason: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_reverse_expense: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_version: number;
          p_expense_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_reason: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_review_bank_evidence: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_decision: string;
          p_expected_state: string;
          p_expected_version: number;
          p_note: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_submission_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p309_subscription_report: {
        Args: { p_actor_id: string; p_end_at: string; p_start_at: string };
        Returns: Json;
      };
      p309_void_invoice: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_version: number;
          p_invoice_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_reason: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p311_add_meeting_note: {
        Args: { p_actor_id: string; p_body: string; p_meeting_id: string; p_visibility: string };
        Returns: string;
      };
      p311_book_meeting: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_slot_id: string;
          p_tenant_id: string;
          p_title?: string;
        };
        Returns: Json;
      };
      p311_cancel_meeting: {
        Args: {
          p_actor_id: string;
          p_expected_version: number;
          p_meeting_id: string;
          p_operation_id: string;
          p_payload_hash: string;
        };
        Returns: Json;
      };
      p311_complete_ai_processing: {
        Args: {
          p_actions: Json;
          p_decisions: Json;
          p_effect_hash: string;
          p_job_id: string;
          p_language: string;
          p_lease_token: string;
          p_meeting_id: string;
          p_model: string;
          p_provider: string;
          p_retain_until: string;
          p_risks: Json;
          p_summary: string;
          p_transcript: string;
          p_worker_id: string;
        };
        Returns: boolean;
      };
      p311_create_slot: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_ends_at: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_starts_at: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      p311_delete_expired_transcripts: { Args: { p_limit?: number }; Returns: number };
      p311_has_processing_consent: { Args: { p_meeting_id: string }; Returns: boolean };
      p311_request_ai_processing: {
        Args: { p_actor_id?: string; p_meeting_id: string; p_operation_id: string };
        Returns: boolean;
      };
      p311_reschedule_meeting: {
        Args: {
          p_actor_id: string;
          p_ends_at: string;
          p_expected_version: number;
          p_meeting_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_starts_at: string;
        };
        Returns: Json;
      };
      p311_review_action_item: {
        Args: {
          p_action_item_id: string;
          p_actor_id: string;
          p_decision: string;
          p_meeting_id: string;
        };
        Returns: boolean;
      };
      p311_set_consent: {
        Args: {
          p_actor_id: string;
          p_granted: boolean;
          p_meeting_id: string;
          p_policy_version: string;
        };
        Returns: boolean;
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
      prepare_document_upload: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_doc_type: string;
          p_document_id: string;
          p_employee_id: string;
          p_expected_head: string;
          p_extension: string;
          p_label: string;
          p_mime_type: string;
          p_operation_id: string;
          p_request_id: string;
          p_safe_filename: string;
          p_sha256: string;
          p_size_bytes: number;
          p_tenant_id: string;
        };
        Returns: Json;
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
      prepare_pro_credential_evidence_removal: {
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
      pro_credential_masked_result: { Args: { p_credential_id: string }; Returns: Json };
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
        Args: { p_actor_id: string; p_company_name: string; p_plan: string; p_slug: string };
        Returns: Json;
      };
      provision_inbound_destination: {
        Args: {
          p_company_id: string;
          p_correlation_id: string;
          p_destination_id: string;
          p_destination_key_hash: string;
          p_enabled: boolean;
          p_operation_id: string;
          p_provider: string;
          p_readiness_approved: boolean;
          p_tenant_id: string;
        };
        Returns: {
          destination_id: string;
          enabled: boolean;
          replayed: boolean;
        }[];
      };
      publish_domain_event: {
        Args: {
          p_actor_id: string;
          p_causation_id: string;
          p_company_id: string;
          p_correlation_id: string;
          p_dedupe_key: string;
          p_event_id: string;
          p_event_type: string;
          p_event_version: number;
          p_occurred_at: string;
          p_payload: Json;
          p_privacy_class: string;
          p_tenant_id: string;
        };
        Returns: string;
      };
      publish_questionnaire_version: {
        Args: { p_definition_id: string; p_expected_definition_version: number; p_version: number };
        Returns: Json;
      };
      raise_pro_assignment_eligibility_error: { Args: { p_result: Json }; Returns: undefined };
      rate_limit_consume: {
        Args: { p_capacity: number; p_cost?: number; p_key: string; p_refill_per_sec: number };
        Returns: boolean;
      };
      read_admin_registration_index: {
        Args: {
          p_actor_aal: string;
          p_actor_id: string;
          p_company: string;
          p_page: number;
          p_pro: string;
          p_stage: string;
          p_status: string;
        };
        Returns: Json;
      };
      read_assigned_company_settings: {
        Args: { p_actor_profile_id: string; p_company_id: string; p_tenant_id: string };
        Returns: Json;
      };
      read_authoritative_pro_tenant: { Args: { p_actor_id: string }; Returns: string };
      read_company_onboarding: {
        Args: { p_actor_id: string; p_company_id: string; p_tenant_id: string };
        Returns: Json;
      };
      read_current_company_assignment_summary: {
        Args: { p_actor_id: string; p_company_id: string };
        Returns: Json;
      };
      read_customer_registration_progress: {
        Args: { p_actor_id: string; p_registration_id: string };
        Returns: Json;
      };
      read_employee_visa_person: {
        Args: { p_actor_id: string; p_registration_id: string };
        Returns: Json;
      };
      read_event_queue_health: { Args: { p_consumer_name?: string }; Returns: Json };
      read_operational_runtime_health: { Args: { p_company_id: string }; Returns: Json };
      read_operator_registration_workflow: {
        Args: { p_actor_aal: string; p_actor_id: string; p_registration_id: string };
        Returns: Json;
      };
      read_p3_12_operational_report: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_correlation_id: string;
          p_operation_id: string;
          p_scope: string;
        };
        Returns: Json;
      };
      read_p3_12_readiness: {
        Args: { p_actor_id: string; p_correlation_id: string; p_operation_id: string };
        Returns: Json;
      };
      read_p3_12_retention_registry: {
        Args: { p_actor_id: string; p_correlation_id: string; p_operation_id: string };
        Returns: {
          approved_at: string | null;
          approved_by: string | null;
          approved_duration: string | null;
          created_at: string;
          data_class: string;
          destructive_execution_enabled: boolean;
          evidence_requirement: string;
          legal_hold_behavior: string;
          owner: string;
          policy_status: string;
          retention_action: string;
          runtime_status: string;
          trigger_event: string;
          version: number;
        }[];
        SetofOptions: {
          from: '*';
          to: 'retention_policy_registry';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      read_pro_commercial_terms: {
        Args: { p_actor_id: string; p_pro_profile_id: string };
        Returns: Json;
      };
      read_pro_credential_snapshot: {
        Args: { p_actor_id: string; p_pro_profile_id: string };
        Returns: Json;
      };
      read_pro_lifecycle_detail: {
        Args: { p_actor_id: string; p_pro_profile_id: string; p_timeline_limit?: number };
        Returns: Json;
      };
      read_pro_lifecycle_detail_without_reasons_0076: {
        Args: { p_actor_id: string; p_pro_profile_id: string; p_timeline_limit?: number };
        Returns: Json;
      };
      read_pro_lifecycle_identity: {
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
      read_pro_registration_workflow: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_registration_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      read_pro_registry: {
        Args: {
          p_account_status?: string;
          p_actor_id: string;
          p_assignment?: string;
          p_credential_state?: string;
          p_direction?: string;
          p_eligibility?: string;
          p_expiry_window?: string;
          p_page?: number;
          p_page_size?: number;
          p_query?: string;
          p_sort?: string;
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
      reassign_company_pro_with_context: {
        Args: {
          p_actor_profile_id: string;
          p_company_id: string;
          p_expected_assignment_id: string;
          p_reason: string;
          p_replacement_pro_profile_id: string;
        };
        Returns: Json;
      };
      recompute_renewal_status: { Args: Record<PropertyKey, never>; Returns: undefined };
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
      reconcile_document_upload_cleanup: {
        Args: { p_company_id: string; p_operation_id: string; p_tenant_id: string };
        Returns: Json;
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
      record_event_worker_heartbeat: {
        Args: {
          p_consumer_name: string;
          p_release_version: string;
          p_scheduler_owner: string;
          p_started_at: string;
          p_worker_id: string;
          p_worker_name: string;
        };
        Returns: boolean;
      };
      record_safe_delivery_receipt: {
        Args: {
          p_attempt_number: number;
          p_attempted_at: string;
          p_channel: string;
          p_company_id: string;
          p_delivery_state: string;
          p_effect_reference_hash: string;
          p_event_id: string;
          p_job_id: string;
          p_lease_token: string;
          p_operation_id: string;
          p_provider_category: string;
          p_provider_code: string;
          p_reconciled_at?: string;
          p_reconciliation_state: string;
          p_retryable: boolean;
          p_tenant_id: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      recover_unlink_registration_stage_document: {
        Args: {
          p_actor_aal: string;
          p_actor_id: string;
          p_company_id: string;
          p_link_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_reason: string;
          p_registration_id: string;
          p_stage_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
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
      registration_replay_result: {
        Args: {
          p_operation_id: string;
          p_operation_kind: Database['public']['Enums']['registration_operation_kind'];
          p_payload_hash: string;
          p_scope_id: string;
        };
        Returns: Json;
      };
      reject_erasure_request: {
        Args: {
          p_actor_id: string;
          p_correlation_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_reason_code: string;
          p_reason_note: string;
          p_request_id: string;
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
      release_company_pro_with_context: {
        Args: {
          p_actor_profile_id: string;
          p_company_id: string;
          p_expected_assignment_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      release_mfa_factor_removal: {
        Args: { p_factor_id: string; p_operation_id: string; p_user_id: string };
        Returns: boolean;
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
      request_event_job_replay: {
        Args: { p_operation_id: string; p_reason: string; p_source_job_id: string };
        Returns: string;
      };
      reserve_inbound_webhook: {
        Args: {
          p_destination_key_hash: string;
          p_occurred_at: string;
          p_payload_hash: string;
          p_provider: string;
          p_provider_event_id_hash: string;
          p_signature_verified: boolean;
        };
        Returns: {
          company_id: string;
          destination_id: string;
          receipt_id: string;
          tenant_id: string;
        }[];
      };
      reserve_mfa_factor_removal: {
        Args: { p_factor_id: string; p_operation_id: string; p_user_id: string };
        Returns: boolean;
      };
      reserve_public_application_attachment: {
        Args: {
          p_content_sha256: string;
          p_draft_id: string;
          p_field_id: string;
          p_operation_id: string;
          p_request_hash: string;
          p_resume_secret_hash: string;
        };
        Returns: Json;
      };
      resolve_company_active_registration: {
        Args: { p_actor_id: string; p_company_id: string; p_role: string; p_tenant_id: string };
        Returns: string;
      };
      resolve_document_access: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_document_id: string;
          p_lifetime_seconds: number;
          p_tenant_id: string;
          p_version_id: string;
        };
        Returns: Json;
      };
      resolve_runtime_delivery_policy: {
        Args: {
          p_channel: string;
          p_company_id: string;
          p_event_id: string;
          p_job_id: string;
          p_profile_id: string;
          p_template_key: string;
          p_tenant_id: string;
          p_version: number;
        };
        Returns: Json;
      };
      review_document_version: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_document_id: string;
          p_expected_head_version_id: string;
          p_expected_review_status: string;
          p_note: string;
          p_status: string;
          p_tenant_id: string;
          p_version_id: string;
        };
        Returns: {
          company_id: string;
          document_id: string;
          fulfilled_request_id: string;
          review_status: string;
          reviewed_at: string;
        }[];
      };
      revoke_all_user_auth_sessions: { Args: { p_user_id: string }; Returns: number };
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
      revoke_user_auth_session: {
        Args: { p_session_id: string; p_user_id: string };
        Returns: boolean;
      };
      runtime_actor_company_access: {
        Args: { p_allow_member?: boolean; p_company_id: string };
        Returns: string;
      };
      runtime_request_hash: { Args: { p_intent: Json }; Returns: string };
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
          p_identifier_ciphertext: string;
          p_identifier_hash: string;
          p_identifier_last4: string;
          p_issue_date: string;
          p_issuing_authority: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_preserve_identifier: boolean;
        };
        Returns: Json;
      };
      save_public_application_draft: {
        Args: {
          p_answers: Json;
          p_draft_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_request_hash: string;
          p_resume_secret_hash: string;
        };
        Returns: Json;
      };
      save_questionnaire_draft: {
        Args: {
          p_definition: Json;
          p_definition_hash: string;
          p_definition_key: string;
          p_expected_definition_version: number;
          p_title: string;
        };
        Returns: Json;
      };
      set_document_upload_cleanup_hold: {
        Args: {
          p_company_id: string;
          p_held: boolean;
          p_operation_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      set_operational_notification_read_state: {
        Args: {
          p_company_id: string;
          p_notification_id: string;
          p_operation_id: string;
          p_read: boolean;
        };
        Returns: Json;
      };
      set_pro_document_expiry: {
        Args: {
          p_actor_id: string;
          p_company_id: string;
          p_document_id: string;
          p_expected_expires_on: string;
          p_expected_head_version_id: string;
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
      store_registration_receipt: {
        Args: {
          p_operation_id: string;
          p_operation_kind: Database['public']['Enums']['registration_operation_kind'];
          p_payload_hash: string;
          p_sanitized_result: Json;
          p_scope_id: string;
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
      submit_public_application: {
        Args: {
          p_consent_provenance: Json;
          p_draft_id: string;
          p_expected_version: number;
          p_operation_id: string;
          p_request_hash: string;
          p_resume_secret_hash: string;
          p_score: number;
          p_score_factors: Json;
          p_score_version: number;
        };
        Returns: Json;
      };
      transition_registration_stage: {
        Args: {
          p_actor_aal: string;
          p_actor_id: string;
          p_command: string;
          p_company_id: string;
          p_details: Json;
          p_expected_registration_version: number;
          p_expected_stage_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_reason_code: string;
          p_reason_text: string;
          p_registration_id: string;
          p_stage_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      transition_registration_visa_person: {
        Args: {
          p_actor_aal: string;
          p_actor_id: string;
          p_command: string;
          p_company_id: string;
          p_expected_visa_version: number;
          p_operation_id: string;
          p_payload_hash: string;
          p_reason_code: string;
          p_reason_text: string;
          p_registration_id: string;
          p_tenant_id: string;
          p_to_stage: Database['public']['Enums']['registration_visa_stage_code'];
          p_visa_person_id: string;
        };
        Returns: Json;
      };
      unlink_registration_stage_document: {
        Args: {
          p_actor_aal: string;
          p_actor_id: string;
          p_company_id: string;
          p_link_id: string;
          p_operation_id: string;
          p_payload_hash: string;
          p_registration_id: string;
          p_stage_id: string;
          p_tenant_id: string;
        };
        Returns: Json;
      };
      unlock_account_with_platform_audit: {
        Args: {
          p_actor_id: string;
          p_correlation_id: string;
          p_key: string;
          p_operation_id: string;
        };
        Returns: number;
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
      verify_erasure_request: { Args: { p_token_hash: string }; Returns: string };
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
      write_operational_projection: {
        Args: {
          p_code: string;
          p_company_id: string;
          p_due_at?: string;
          p_event_id: string;
          p_job_id: string;
          p_lease_token: string;
          p_operation_id: string;
          p_priority?: string;
          p_profile_id?: string;
          p_projection_key: string;
          p_projection_type: string;
          p_safe_metadata?: Json;
          p_state?: string;
          p_tenant_id: string;
          p_worker_id: string;
        };
        Returns: Json;
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
        | 'pro_lifecycle_changed'
        | 'profile_self_edited';
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
      registration_document_role:
        | 'application_form'
        | 'approval_letter'
        | 'trade_name_approval'
        | 'trade_license'
        | 'visa_evidence'
        | 'bank_evidence'
        | 'other';
      registration_domain_event_code: 'registration_stage_changed';
      registration_operation_kind:
        | 'create_registration'
        | 'transition_stage'
        | 'link_document'
        | 'unlink_document'
        | 'recover_unlink_document'
        | 'create_visa_person'
        | 'transition_visa_person'
        | 'cancel_visa_person';
      registration_person_kind: 'shareholder' | 'employee' | 'dependent' | 'other';
      registration_stage_code:
        | 'application_submitted'
        | 'initial_approval'
        | 'name_reservation'
        | 'license_issuance'
        | 'visa_processing'
        | 'bank_account'
        | 'completed';
      registration_stage_status:
        | 'not_started'
        | 'in_progress'
        | 'blocked'
        | 'completed'
        | 'skipped';
      registration_status: 'draft' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
      registration_visa_kind: 'investor' | 'employee' | 'family';
      registration_visa_stage_code:
        | 'documents_ready'
        | 'entry_permit'
        | 'status_adjustment'
        | 'medical_fitness'
        | 'emirates_id'
        | 'residency_issued';
      registration_visa_status:
        | 'not_started'
        | 'in_progress'
        | 'blocked'
        | 'completed'
        | 'cancelled';
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
        'tenant_provisioned',
        'tenant_self_serve_submitted',
        'tenant_approved',
        'tenant_rejected',
        'tenant_suspended',
        'tenant_reactivated',
        'tenant_self_updated',
        'pro_lifecycle_changed',
        'profile_self_edited',
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
      registration_document_role: [
        'application_form',
        'approval_letter',
        'trade_name_approval',
        'trade_license',
        'visa_evidence',
        'bank_evidence',
        'other',
      ],
      registration_domain_event_code: ['registration_stage_changed'],
      registration_operation_kind: [
        'create_registration',
        'transition_stage',
        'link_document',
        'unlink_document',
        'recover_unlink_document',
        'create_visa_person',
        'transition_visa_person',
        'cancel_visa_person',
      ],
      registration_person_kind: ['shareholder', 'employee', 'dependent', 'other'],
      registration_stage_code: [
        'application_submitted',
        'initial_approval',
        'name_reservation',
        'license_issuance',
        'visa_processing',
        'bank_account',
        'completed',
      ],
      registration_stage_status: ['not_started', 'in_progress', 'blocked', 'completed', 'skipped'],
      registration_status: ['draft', 'in_progress', 'blocked', 'completed', 'cancelled'],
      registration_visa_kind: ['investor', 'employee', 'family'],
      registration_visa_stage_code: [
        'documents_ready',
        'entry_permit',
        'status_adjustment',
        'medical_fitness',
        'emirates_id',
        'residency_issued',
      ],
      registration_visa_status: ['not_started', 'in_progress', 'blocked', 'completed', 'cancelled'],
    },
  },
} as const;
