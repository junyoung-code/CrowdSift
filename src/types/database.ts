export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      analysis_job_costs: {
        Row: {
          actual_calculated_cost: number | null
          actual_embedding_input_tokens: number
          actual_stage_one_input_tokens: number
          actual_stage_one_output_tokens: number
          actual_stage_two_input_tokens: number
          actual_stage_two_output_tokens: number
          analysis_job_id: string
          calculated_at: string | null
          created_at: string
          currency: string
          embedding_input_per_million: number
          embedding_model: string
          estimated_at: string
          estimated_cost_high: number
          estimated_cost_low: number
          estimated_input_tokens_high: number
          estimated_input_tokens_low: number
          estimated_output_tokens_high: number
          estimated_output_tokens_low: number
          id: string
          pricing_effective_at: string
          pricing_version: string
          stage_one_input_per_million: number
          stage_one_model: string
          stage_one_output_per_million: number
          stage_two_input_per_million: number
          stage_two_model: string
          stage_two_output_per_million: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actual_calculated_cost?: number | null
          actual_embedding_input_tokens?: number
          actual_stage_one_input_tokens?: number
          actual_stage_one_output_tokens?: number
          actual_stage_two_input_tokens?: number
          actual_stage_two_output_tokens?: number
          analysis_job_id: string
          calculated_at?: string | null
          created_at?: string
          currency: string
          embedding_input_per_million: number
          embedding_model: string
          estimated_at?: string
          estimated_cost_high: number
          estimated_cost_low: number
          estimated_input_tokens_high?: number
          estimated_input_tokens_low?: number
          estimated_output_tokens_high?: number
          estimated_output_tokens_low?: number
          id?: string
          pricing_effective_at: string
          pricing_version: string
          stage_one_input_per_million: number
          stage_one_model: string
          stage_one_output_per_million: number
          stage_two_input_per_million: number
          stage_two_model: string
          stage_two_output_per_million: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actual_calculated_cost?: number | null
          actual_embedding_input_tokens?: number
          actual_stage_one_input_tokens?: number
          actual_stage_one_output_tokens?: number
          actual_stage_two_input_tokens?: number
          actual_stage_two_output_tokens?: number
          analysis_job_id?: string
          calculated_at?: string | null
          created_at?: string
          currency?: string
          embedding_input_per_million?: number
          embedding_model?: string
          estimated_at?: string
          estimated_cost_high?: number
          estimated_cost_low?: number
          estimated_input_tokens_high?: number
          estimated_input_tokens_low?: number
          estimated_output_tokens_high?: number
          estimated_output_tokens_low?: number
          id?: string
          pricing_effective_at?: string
          pricing_version?: string
          stage_one_input_per_million?: number
          stage_one_model?: string
          stage_one_output_per_million?: number
          stage_two_input_per_million?: number
          stage_two_model?: string
          stage_two_output_per_million?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_job_costs_analysis_job_id_fkey"
            columns: ["analysis_job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_job_costs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_job_items: {
        Row: {
          analysis_job_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          finished_at: string | null
          id: string
          raw_comment_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["item_status"]
          workspace_id: string
        }
        Insert: {
          analysis_job_id: string
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          raw_comment_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          workspace_id: string
        }
        Update: {
          analysis_job_id?: string
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          raw_comment_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_job_items_analysis_job_id_fkey"
            columns: ["analysis_job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_job_items_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_job_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_jobs: {
        Row: {
          completed_count: number
          configuration_key: string
          created_at: string
          failed_count: number
          finished_at: string | null
          id: string
          import_job_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          total_count: number
          workspace_id: string
        }
        Insert: {
          completed_count?: number
          configuration_key: string
          created_at?: string
          failed_count?: number
          finished_at?: string | null
          id?: string
          import_job_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          total_count?: number
          workspace_id: string
        }
        Update: {
          completed_count?: number
          configuration_key?: string
          created_at?: string
          failed_count?: number
          finished_at?: string | null
          id?: string
          import_job_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          total_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "comment_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          target_id: string
          target_type: string
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          target_id: string
          target_type: string
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          target_id?: string
          target_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_comment_sync_runs: {
        Row: {
          analyzed_count: number
          claim_token: string | null
          created_at: string
          duplicate_count: number
          error_code: string | null
          failed_count: number
          finished_at: string | null
          id: string
          input_page_token: string | null
          kind: string
          observed_count: number
          output_page_token: string | null
          quota_units_used: number
          setting_id: string
          started_at: string | null
          status: string
          stored_count: number
          updated_count: number
          workspace_id: string
        }
        Insert: {
          analyzed_count?: number
          claim_token?: string | null
          created_at?: string
          duplicate_count?: number
          error_code?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          input_page_token?: string | null
          kind: string
          observed_count?: number
          output_page_token?: string | null
          quota_units_used?: number
          setting_id: string
          started_at?: string | null
          status?: string
          stored_count?: number
          updated_count?: number
          workspace_id: string
        }
        Update: {
          analyzed_count?: number
          claim_token?: string | null
          created_at?: string
          duplicate_count?: number
          error_code?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          input_page_token?: string | null
          kind?: string
          observed_count?: number
          output_page_token?: string | null
          quota_units_used?: number
          setting_id?: string
          started_at?: string | null
          status?: string
          stored_count?: number
          updated_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_comment_sync_runs_setting_id_fkey"
            columns: ["setting_id"]
            isOneToOne: false
            referencedRelation: "channel_comment_sync_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_comment_sync_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_comment_sync_settings: {
        Row: {
          backfill_page_token: string | null
          backfill_start_at: string
          backfill_status: string
          connection_id: string
          created_at: string
          enabled: boolean
          id: string
          incremental_page_token: string | null
          incremental_scan_started_at: string | null
          last_error_code: string | null
          last_reply_reconciliation_at: string | null
          last_successful_sync_at: string | null
          lease_until: string | null
          next_reply_reconciliation_at: string | null
          next_sync_at: string
          reply_reconciliation_page_token: string | null
          reply_reconciliation_status: string
          sync_interval_minutes: number
          updated_at: string
          workspace_id: string
          youtube_channel_id: string
        }
        Insert: {
          backfill_page_token?: string | null
          backfill_start_at: string
          backfill_status?: string
          connection_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          incremental_page_token?: string | null
          incremental_scan_started_at?: string | null
          last_error_code?: string | null
          last_reply_reconciliation_at?: string | null
          last_successful_sync_at?: string | null
          lease_until?: string | null
          next_reply_reconciliation_at?: string | null
          next_sync_at?: string
          reply_reconciliation_page_token?: string | null
          reply_reconciliation_status?: string
          sync_interval_minutes?: number
          updated_at?: string
          workspace_id: string
          youtube_channel_id: string
        }
        Update: {
          backfill_page_token?: string | null
          backfill_start_at?: string
          backfill_status?: string
          connection_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          incremental_page_token?: string | null
          incremental_scan_started_at?: string | null
          last_error_code?: string | null
          last_reply_reconciliation_at?: string | null
          last_successful_sync_at?: string | null
          lease_until?: string | null
          next_reply_reconciliation_at?: string | null
          next_sync_at?: string
          reply_reconciliation_page_token?: string | null
          reply_reconciliation_status?: string
          sync_interval_minutes?: number
          updated_at?: string
          workspace_id?: string
          youtube_channel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_comment_sync_settings_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "youtube_connection_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_comment_sync_settings_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "youtube_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_comment_sync_settings_connection_id_youtube_channe_fkey"
            columns: ["connection_id", "youtube_channel_id"]
            isOneToOne: false
            referencedRelation: "youtube_channel_candidates"
            referencedColumns: ["connection_id", "youtube_channel_id"]
          },
          {
            foreignKeyName: "channel_comment_sync_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_sync_analysis_assignments: {
        Row: {
          analysis_job_id: string | null
          assigned_import_job_id: string
          attached_at: string | null
          configuration_key: string
          created_at: string
          raw_comment_id: string
          workspace_id: string
        }
        Insert: {
          analysis_job_id?: string | null
          assigned_import_job_id: string
          attached_at?: string | null
          configuration_key: string
          created_at?: string
          raw_comment_id: string
          workspace_id: string
        }
        Update: {
          analysis_job_id?: string | null
          assigned_import_job_id?: string
          attached_at?: string | null
          configuration_key?: string
          created_at?: string
          raw_comment_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_sync_analysis_assignments_analysis_job_id_fkey"
            columns: ["analysis_job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_sync_analysis_assignments_assigned_import_job_id_fkey"
            columns: ["assigned_import_job_id"]
            isOneToOne: false
            referencedRelation: "comment_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_sync_analysis_assignments_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_sync_analysis_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_branches: {
        Row: {
          analysis_job_item_id: string
          created_at: string
          id: string
          outcome: string
          protection: Json
          raw_comment_id: string
          reasons: Json
          workspace_id: string
        }
        Insert: {
          analysis_job_item_id: string
          created_at?: string
          id?: string
          outcome: string
          protection?: Json
          raw_comment_id: string
          reasons?: Json
          workspace_id: string
        }
        Update: {
          analysis_job_item_id?: string
          created_at?: string
          id?: string
          outcome?: string
          protection?: Json
          raw_comment_id?: string
          reasons?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classification_branches_analysis_job_item_id_fkey"
            columns: ["analysis_job_item_id"]
            isOneToOne: true
            referencedRelation: "analysis_job_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_branches_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_branches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_feedback: {
        Row: {
          actor_user_id: string
          classification_verdict_id: string
          corrected_level: Database["public"]["Enums"]["review_level"] | null
          created_at: string
          decision: string
          edited_feedback_core: string | null
          id: string
          raw_comment_id: string
          use_for_personalization: boolean
          use_for_training: boolean
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          classification_verdict_id: string
          corrected_level?: Database["public"]["Enums"]["review_level"] | null
          created_at?: string
          decision: string
          edited_feedback_core?: string | null
          id?: string
          raw_comment_id: string
          use_for_personalization?: boolean
          use_for_training?: boolean
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          classification_verdict_id?: string
          corrected_level?: Database["public"]["Enums"]["review_level"] | null
          created_at?: string
          decision?: string
          edited_feedback_core?: string | null
          id?: string
          raw_comment_id?: string
          use_for_personalization?: boolean
          use_for_training?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classification_feedback_classification_verdict_id_fkey"
            columns: ["classification_verdict_id"]
            isOneToOne: false
            referencedRelation: "classification_verdicts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_feedback_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_stage_runs: {
        Row: {
          analysis_job_item_id: string
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          latency_ms: number | null
          model_identifier: string
          output: Json
          policy_version: number
          prompt_version: string | null
          provider: string
          provider_response_id: string | null
          raw_comment_id: string
          schema_version: string
          stage: string
          status: string
          usage: Json
          workspace_id: string
        }
        Insert: {
          analysis_job_item_id: string
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          latency_ms?: number | null
          model_identifier: string
          output?: Json
          policy_version: number
          prompt_version?: string | null
          provider: string
          provider_response_id?: string | null
          raw_comment_id: string
          schema_version: string
          stage: string
          status: string
          usage?: Json
          workspace_id: string
        }
        Update: {
          analysis_job_item_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          latency_ms?: number | null
          model_identifier?: string
          output?: Json
          policy_version?: number
          prompt_version?: string | null
          provider?: string
          provider_response_id?: string | null
          raw_comment_id?: string
          schema_version?: string
          stage?: string
          status?: string
          usage?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classification_stage_runs_analysis_job_item_id_fkey"
            columns: ["analysis_job_item_id"]
            isOneToOne: false
            referencedRelation: "analysis_job_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_stage_runs_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_stage_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_verdicts: {
        Row: {
          agreed_with_first_pass: boolean | null
          allow_rewrite: boolean
          analysis_job_item_id: string
          basis: string
          created_at: string
          feedback_core: string | null
          feedback_type: string
          hide_source: boolean
          id: string
          level: Database["public"]["Enums"]["review_level"] | null
          raised_by_moderation: boolean
          raw_comment_id: string
          reason_codes: Json
          recommended_actions: Json
          safety_case: boolean
          status: string
          workspace_id: string
        }
        Insert: {
          agreed_with_first_pass?: boolean | null
          allow_rewrite?: boolean
          analysis_job_item_id: string
          basis: string
          created_at?: string
          feedback_core?: string | null
          feedback_type: string
          hide_source?: boolean
          id?: string
          level?: Database["public"]["Enums"]["review_level"] | null
          raised_by_moderation?: boolean
          raw_comment_id: string
          reason_codes?: Json
          recommended_actions?: Json
          safety_case?: boolean
          status: string
          workspace_id: string
        }
        Update: {
          agreed_with_first_pass?: boolean | null
          allow_rewrite?: boolean
          analysis_job_item_id?: string
          basis?: string
          created_at?: string
          feedback_core?: string | null
          feedback_type?: string
          hide_source?: boolean
          id?: string
          level?: Database["public"]["Enums"]["review_level"] | null
          raised_by_moderation?: boolean
          raw_comment_id?: string
          reason_codes?: Json
          recommended_actions?: Json
          safety_case?: boolean
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classification_verdicts_analysis_job_item_id_fkey"
            columns: ["analysis_job_item_id"]
            isOneToOne: true
            referencedRelation: "analysis_job_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_verdicts_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_verdicts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_analyses: {
        Row: {
          actionable_feedback: boolean
          analysis_job_item_id: string | null
          category: Database["public"]["Enums"]["comment_category"]
          confidence: number
          created_at: string
          evidence_review: boolean
          explanation: string
          id: string
          manual_review: boolean
          model_run_id: string
          phishing: number
          policy_version: number
          provenance: Json
          raw_comment_id: string
          recommended_action: Database["public"]["Enums"]["recommended_action"]
          retrieved_feedback: Json
          review_level: Database["public"]["Enums"]["review_level"]
          rule_evaluation_id: string | null
          spam: number
          stage: number
          stage_one_analysis_id: string | null
          toxicity: number
          workspace_id: string
        }
        Insert: {
          actionable_feedback: boolean
          analysis_job_item_id?: string | null
          category: Database["public"]["Enums"]["comment_category"]
          confidence: number
          created_at?: string
          evidence_review: boolean
          explanation: string
          id?: string
          manual_review: boolean
          model_run_id: string
          phishing: number
          policy_version: number
          provenance: Json
          raw_comment_id: string
          recommended_action: Database["public"]["Enums"]["recommended_action"]
          retrieved_feedback?: Json
          review_level: Database["public"]["Enums"]["review_level"]
          rule_evaluation_id?: string | null
          spam: number
          stage: number
          stage_one_analysis_id?: string | null
          toxicity: number
          workspace_id: string
        }
        Update: {
          actionable_feedback?: boolean
          analysis_job_item_id?: string | null
          category?: Database["public"]["Enums"]["comment_category"]
          confidence?: number
          created_at?: string
          evidence_review?: boolean
          explanation?: string
          id?: string
          manual_review?: boolean
          model_run_id?: string
          phishing?: number
          policy_version?: number
          provenance?: Json
          raw_comment_id?: string
          recommended_action?: Database["public"]["Enums"]["recommended_action"]
          retrieved_feedback?: Json
          review_level?: Database["public"]["Enums"]["review_level"]
          rule_evaluation_id?: string | null
          spam?: number
          stage?: number
          stage_one_analysis_id?: string | null
          toxicity?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_analyses_analysis_job_item_id_fkey"
            columns: ["analysis_job_item_id"]
            isOneToOne: false
            referencedRelation: "analysis_job_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_analyses_model_run_id_fkey"
            columns: ["model_run_id"]
            isOneToOne: true
            referencedRelation: "model_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_analyses_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_analyses_rule_evaluation_id_fkey"
            columns: ["rule_evaluation_id"]
            isOneToOne: false
            referencedRelation: "rule_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_analyses_stage_one_analysis_id_fkey"
            columns: ["stage_one_analysis_id"]
            isOneToOne: false
            referencedRelation: "comment_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_analyses_stage_one_analysis_id_fkey"
            columns: ["stage_one_analysis_id"]
            isOneToOne: false
            referencedRelation: "current_comment_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_analyses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_import_items: {
        Row: {
          created_at: string
          error_code: string | null
          import_job_id: string
          raw_comment_id: string | null
          status: Database["public"]["Enums"]["item_status"]
          workspace_id: string
          youtube_comment_id: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          import_job_id: string
          raw_comment_id?: string | null
          status: Database["public"]["Enums"]["item_status"]
          workspace_id: string
          youtube_comment_id: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          import_job_id?: string
          raw_comment_id?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          workspace_id?: string
          youtube_comment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_import_items_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "comment_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_import_items_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_import_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_import_jobs: {
        Row: {
          analyzed_count: number
          attempt_count: number
          channel_sync_run_id: string | null
          created_at: string
          duplicate_count: number
          failed_count: number
          fetched_count: number
          finished_at: string | null
          id: string
          last_error_code: string | null
          next_page_token: string | null
          provider_mode: string
          reply_count: number
          requested_top_level_count: number | null
          requested_total_count: number | null
          source_kind: Database["public"]["Enums"]["comment_source_kind"]
          source_video_url: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          stored_count: number
          top_level_count: number
          trigger_kind: string
          updated_count: number
          workspace_id: string
          youtube_quota_units_used: number
          youtube_video_id: string
        }
        Insert: {
          analyzed_count?: number
          attempt_count?: number
          channel_sync_run_id?: string | null
          created_at?: string
          duplicate_count?: number
          failed_count?: number
          fetched_count?: number
          finished_at?: string | null
          id?: string
          last_error_code?: string | null
          next_page_token?: string | null
          provider_mode?: string
          reply_count?: number
          requested_top_level_count?: number | null
          requested_total_count?: number | null
          source_kind?: Database["public"]["Enums"]["comment_source_kind"]
          source_video_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          stored_count?: number
          top_level_count?: number
          trigger_kind?: string
          updated_count?: number
          workspace_id: string
          youtube_quota_units_used?: number
          youtube_video_id: string
        }
        Update: {
          analyzed_count?: number
          attempt_count?: number
          channel_sync_run_id?: string | null
          created_at?: string
          duplicate_count?: number
          failed_count?: number
          fetched_count?: number
          finished_at?: string | null
          id?: string
          last_error_code?: string | null
          next_page_token?: string | null
          provider_mode?: string
          reply_count?: number
          requested_top_level_count?: number | null
          requested_total_count?: number | null
          source_kind?: Database["public"]["Enums"]["comment_source_kind"]
          source_video_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          stored_count?: number
          top_level_count?: number
          trigger_kind?: string
          updated_count?: number
          workspace_id?: string
          youtube_quota_units_used?: number
          youtube_video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_import_jobs_channel_sync_run_id_fkey"
            columns: ["channel_sync_run_id"]
            isOneToOne: false
            referencedRelation: "channel_comment_sync_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_import_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_source_observations: {
        Row: {
          captured_at: string
          fingerprint: string
          id: string
          import_job_id: string
          provider_payload: Json
          provider_updated_at: string | null
          raw_comment_id: string
          source_snapshot: Json
          workspace_id: string
        }
        Insert: {
          captured_at?: string
          fingerprint: string
          id?: string
          import_job_id: string
          provider_payload: Json
          provider_updated_at?: string | null
          raw_comment_id: string
          source_snapshot: Json
          workspace_id: string
        }
        Update: {
          captured_at?: string
          fingerprint?: string
          id?: string
          import_job_id?: string
          provider_payload?: Json
          provider_updated_at?: string | null
          raw_comment_id?: string
          source_snapshot?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_source_observations_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "comment_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_source_observations_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_source_observations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_feedback: {
        Row: {
          actor_user_id: string
          analysis_id: string
          corrected_category:
            | Database["public"]["Enums"]["comment_category"]
            | null
          corrected_recommended_action:
            | Database["public"]["Enums"]["recommended_action"]
            | null
          corrected_review_level:
            | Database["public"]["Enums"]["review_level"]
            | null
          created_at: string
          decision: string
          edited_sanitized_feedback: string | null
          id: string
          raw_comment_id: string
          source_import_job_id: string | null
          use_for_personalization: boolean
          use_for_training: boolean
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          analysis_id: string
          corrected_category?:
            | Database["public"]["Enums"]["comment_category"]
            | null
          corrected_recommended_action?:
            | Database["public"]["Enums"]["recommended_action"]
            | null
          corrected_review_level?:
            | Database["public"]["Enums"]["review_level"]
            | null
          created_at?: string
          decision: string
          edited_sanitized_feedback?: string | null
          id?: string
          raw_comment_id: string
          source_import_job_id?: string | null
          use_for_personalization?: boolean
          use_for_training?: boolean
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          analysis_id?: string
          corrected_category?:
            | Database["public"]["Enums"]["comment_category"]
            | null
          corrected_recommended_action?:
            | Database["public"]["Enums"]["recommended_action"]
            | null
          corrected_review_level?:
            | Database["public"]["Enums"]["review_level"]
            | null
          created_at?: string
          decision?: string
          edited_sanitized_feedback?: string | null
          id?: string
          raw_comment_id?: string
          source_import_job_id?: string | null
          use_for_personalization?: boolean
          use_for_training?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_feedback_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "comment_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_feedback_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "current_comment_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_feedback_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_feedback_source_import_job_id_fkey"
            columns: ["source_import_job_id"]
            isOneToOne: false
            referencedRelation: "comment_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_policies: {
        Row: {
          category_sensitivity: Json
          created_at: string
          created_by: string
          harmful_text_hidden: boolean
          id: string
          preferred_actions: Json
          version: number
          workspace_id: string
        }
        Insert: {
          category_sensitivity?: Json
          created_at?: string
          created_by: string
          harmful_text_hidden?: boolean
          id?: string
          preferred_actions?: Json
          version: number
          workspace_id: string
        }
        Update: {
          category_sensitivity?: Json
          created_at?: string
          created_by?: string
          harmful_text_hidden?: boolean
          id?: string
          preferred_actions?: Json
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_audit_logs: {
        Row: {
          actor_fingerprint: string
          created_at: string
          deleted_workspace_id: string
          event_type: string
          id: string
        }
        Insert: {
          actor_fingerprint: string
          created_at?: string
          deleted_workspace_id: string
          event_type: string
          id?: string
        }
        Update: {
          actor_fingerprint?: string
          created_at?: string
          deleted_workspace_id?: string
          event_type?: string
          id?: string
        }
        Relationships: []
      }
      evaluation_cases: {
        Row: {
          created_at: string
          expected: Json
          fixture: Json
          id: string
          locale: string
          reviewed_at: string
          reviewed_by: string
        }
        Insert: {
          created_at?: string
          expected: Json
          fixture: Json
          id: string
          locale: string
          reviewed_at: string
          reviewed_by: string
        }
        Update: {
          created_at?: string
          expected?: Json
          fixture?: Json
          id?: string
          locale?: string
          reviewed_at?: string
          reviewed_by?: string
        }
        Relationships: []
      }
      evidence_records: {
        Row: {
          action_request_id: string
          captured_at: string
          id: string
          raw_comment_id: string
          source_snapshot: Json
          workspace_id: string
        }
        Insert: {
          action_request_id: string
          captured_at?: string
          id?: string
          raw_comment_id: string
          source_snapshot: Json
          workspace_id: string
        }
        Update: {
          action_request_id?: string
          captured_at?: string
          id?: string
          raw_comment_id?: string
          source_snapshot?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_records_action_request_id_fkey"
            columns: ["action_request_id"]
            isOneToOne: true
            referencedRelation: "moderation_action_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_records_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_embeddings: {
        Row: {
          created_at: string
          creator_feedback_id: string
          deleted_at: string | null
          embedding: string
          embedding_model: string
          id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          creator_feedback_id: string
          deleted_at?: string | null
          embedding: string
          embedding_model: string
          id?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          creator_feedback_id?: string
          deleted_at?: string | null
          embedding?: string
          embedding_model?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_embeddings_creator_feedback_id_fkey"
            columns: ["creator_feedback_id"]
            isOneToOne: true
            referencedRelation: "creator_feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_embeddings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      model_runs: {
        Row: {
          analysis_job_item_id: string | null
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          latency_ms: number | null
          model_identifier: string
          policy_version: number
          prompt_version: string
          provider: string
          provider_response_id: string | null
          raw_comment_id: string
          schema_version: string
          stage: number
          status: string
          usage: Json
          workspace_id: string
        }
        Insert: {
          analysis_job_item_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          latency_ms?: number | null
          model_identifier: string
          policy_version: number
          prompt_version: string
          provider: string
          provider_response_id?: string | null
          raw_comment_id: string
          schema_version: string
          stage: number
          status: string
          usage?: Json
          workspace_id: string
        }
        Update: {
          analysis_job_item_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          latency_ms?: number | null
          model_identifier?: string
          policy_version?: number
          prompt_version?: string
          provider?: string
          provider_response_id?: string | null
          raw_comment_id?: string
          schema_version?: string
          stage?: number
          status?: string
          usage?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_runs_analysis_job_item_id_fkey"
            columns: ["analysis_job_item_id"]
            isOneToOne: false
            referencedRelation: "analysis_job_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_runs_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_action_requests: {
        Row: {
          action: Database["public"]["Enums"]["moderation_action"]
          confirmed_at: string | null
          connection_updated_at: string | null
          created_at: string
          error_code: string | null
          executed_at: string | null
          id: string
          idempotency_key: string
          provider_result: Json | null
          raw_comment_id: string
          requested_by: string
          source_import_job_id: string
          state: Database["public"]["Enums"]["action_state"]
          workspace_id: string
          youtube_channel_id: string | null
          youtube_connection_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["moderation_action"]
          confirmed_at?: string | null
          connection_updated_at?: string | null
          created_at?: string
          error_code?: string | null
          executed_at?: string | null
          id?: string
          idempotency_key: string
          provider_result?: Json | null
          raw_comment_id: string
          requested_by: string
          source_import_job_id: string
          state: Database["public"]["Enums"]["action_state"]
          workspace_id: string
          youtube_channel_id?: string | null
          youtube_connection_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["moderation_action"]
          confirmed_at?: string | null
          connection_updated_at?: string | null
          created_at?: string
          error_code?: string | null
          executed_at?: string | null
          id?: string
          idempotency_key?: string
          provider_result?: Json | null
          raw_comment_id?: string
          requested_by?: string
          source_import_job_id?: string
          state?: Database["public"]["Enums"]["action_state"]
          workspace_id?: string
          youtube_channel_id?: string | null
          youtube_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_action_requests_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_action_requests_source_import_job_id_fkey"
            columns: ["source_import_job_id"]
            isOneToOne: false
            referencedRelation: "comment_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_action_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_action_requests_youtube_connection_id_fkey"
            columns: ["youtube_connection_id"]
            isOneToOne: false
            referencedRelation: "youtube_connection_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_action_requests_youtube_connection_id_fkey"
            columns: ["youtube_connection_id"]
            isOneToOne: false
            referencedRelation: "youtube_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      phrase_rules: {
        Row: {
          context_note: string | null
          created_at: string
          enabled: boolean
          id: string
          kind: Database["public"]["Enums"]["rule_kind"]
          normalized_phrase: string
          phrase: string
          policy_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          context_note?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          kind: Database["public"]["Enums"]["rule_kind"]
          normalized_phrase: string
          phrase: string
          policy_id: string
          version: number
          workspace_id: string
        }
        Update: {
          context_note?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["rule_kind"]
          normalized_phrase?: string
          phrase?: string
          policy_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phrase_rules_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "creator_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phrase_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_comment_payloads: {
        Row: {
          captured_at: string
          payload: Json
          raw_comment_id: string
          workspace_id: string
        }
        Insert: {
          captured_at?: string
          payload: Json
          raw_comment_id: string
          workspace_id: string
        }
        Update: {
          captured_at?: string
          payload?: Json
          raw_comment_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_comment_payloads_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: true
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_comment_payloads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_comments: {
        Row: {
          author_avatar_url: string | null
          author_channel_id: string | null
          author_display_name: string | null
          captured_at: string
          first_import_job_id: string
          id: string
          like_count: number
          parent_youtube_comment_id: string | null
          published_at: string | null
          source_deleted_at: string | null
          source_moderation_status: string | null
          text_display: string
          text_original: string | null
          updated_at: string | null
          workspace_id: string
          youtube_comment_id: string
          youtube_video_id: string
        }
        Insert: {
          author_avatar_url?: string | null
          author_channel_id?: string | null
          author_display_name?: string | null
          captured_at?: string
          first_import_job_id: string
          id?: string
          like_count?: number
          parent_youtube_comment_id?: string | null
          published_at?: string | null
          source_deleted_at?: string | null
          source_moderation_status?: string | null
          text_display: string
          text_original?: string | null
          updated_at?: string | null
          workspace_id: string
          youtube_comment_id: string
          youtube_video_id: string
        }
        Update: {
          author_avatar_url?: string | null
          author_channel_id?: string | null
          author_display_name?: string | null
          captured_at?: string
          first_import_job_id?: string
          id?: string
          like_count?: number
          parent_youtube_comment_id?: string | null
          published_at?: string | null
          source_deleted_at?: string | null
          source_moderation_status?: string | null
          text_display?: string
          text_original?: string | null
          updated_at?: string | null
          workspace_id?: string
          youtube_comment_id?: string
          youtube_video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_comments_first_import_job_id_fkey"
            columns: ["first_import_job_id"]
            isOneToOne: false
            referencedRelation: "comment_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_evaluations: {
        Row: {
          created_at: string
          id: string
          initial_review_level: Database["public"]["Enums"]["review_level"]
          normalized_text: string
          policy_version: number
          raw_comment_id: string
          rule_engine_version: string
          signals: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          initial_review_level: Database["public"]["Enums"]["review_level"]
          normalized_text: string
          policy_version: number
          raw_comment_id: string
          rule_engine_version: string
          signals: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          initial_review_level?: Database["public"]["Enums"]["review_level"]
          normalized_text?: string
          policy_version?: number
          raw_comment_id?: string
          rule_engine_version?: string
          signals?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_evaluations_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_evaluations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sanitized_feedback: {
        Row: {
          analysis_id: string
          created_at: string
          id: string
          neutral_text: string | null
          no_signal: boolean
          normalized_question: string | null
          workspace_id: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          id?: string
          neutral_text?: string | null
          no_signal: boolean
          normalized_question?: string | null
          workspace_id: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          id?: string
          neutral_text?: string | null
          no_signal?: boolean
          normalized_question?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sanitized_feedback_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: true
            referencedRelation: "comment_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sanitized_feedback_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: true
            referencedRelation: "current_comment_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sanitized_feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_analysis_summaries: {
        Row: {
          analysis_job_id: string
          created_at: string
          id: string
          model_identifier: string
          prompt_version: string
          provider: string
          provider_response_id: string | null
          schema_version: string
          source_analysis_count: number
          summary_text: string
          usage: Json
          workspace_id: string
        }
        Insert: {
          analysis_job_id: string
          created_at?: string
          id?: string
          model_identifier: string
          prompt_version: string
          provider: string
          provider_response_id?: string | null
          schema_version: string
          source_analysis_count: number
          summary_text: string
          usage?: Json
          workspace_id: string
        }
        Update: {
          analysis_job_id?: string
          created_at?: string
          id?: string
          model_identifier?: string
          prompt_version?: string
          provider?: string
          provider_response_id?: string | null
          schema_version?: string
          source_analysis_count?: number
          summary_text?: string
          usage?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_analysis_summaries_analysis_job_id_fkey"
            columns: ["analysis_job_id"]
            isOneToOne: true
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_analysis_summaries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_analysis_summary_jobs: {
        Row: {
          analysis_job_id: string
          attempt_count: number
          created_at: string
          finished_at: string | null
          last_attempt_at: string | null
          last_error_code: string | null
          started_at: string | null
          state: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis_job_id: string
          attempt_count?: number
          created_at?: string
          finished_at?: string | null
          last_attempt_at?: string | null
          last_error_code?: string | null
          started_at?: string | null
          state?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis_job_id?: string
          attempt_count?: number
          created_at?: string
          finished_at?: string | null
          last_attempt_at?: string | null
          last_error_code?: string | null
          started_at?: string | null
          state?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_analysis_summary_jobs_analysis_job_id_fkey"
            columns: ["analysis_job_id"]
            isOneToOne: true
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_analysis_summary_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
        }
        Relationships: []
      }
      youtube_channel_candidates: {
        Row: {
          connection_id: string
          handle: string | null
          selected: boolean
          thumbnail_url: string | null
          title: string
          workspace_id: string
          youtube_channel_id: string
        }
        Insert: {
          connection_id: string
          handle?: string | null
          selected?: boolean
          thumbnail_url?: string | null
          title: string
          workspace_id: string
          youtube_channel_id: string
        }
        Update: {
          connection_id?: string
          handle?: string | null
          selected?: boolean
          thumbnail_url?: string | null
          title?: string
          workspace_id?: string
          youtube_channel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_channel_candidates_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "youtube_connection_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_channel_candidates_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "youtube_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_channel_candidates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_connections: {
        Row: {
          created_at: string
          encrypted_access_token: string | null
          encrypted_refresh_token: string | null
          google_subject: string | null
          granted_scopes: string[]
          id: string
          status: Database["public"]["Enums"]["connection_status"]
          token_expires_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          google_subject?: string | null
          granted_scopes?: string[]
          id?: string
          status: Database["public"]["Enums"]["connection_status"]
          token_expires_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          google_subject?: string | null
          granted_scopes?: string[]
          id?: string
          status?: Database["public"]["Enums"]["connection_status"]
          token_expires_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_videos: {
        Row: {
          captured_at: string
          comments_enabled: boolean | null
          id: string
          published_at: string | null
          thumbnail_url: string | null
          title: string
          workspace_id: string
          youtube_channel_id: string
          youtube_video_id: string
        }
        Insert: {
          captured_at?: string
          comments_enabled?: boolean | null
          id?: string
          published_at?: string | null
          thumbnail_url?: string | null
          title: string
          workspace_id: string
          youtube_channel_id: string
          youtube_video_id: string
        }
        Update: {
          captured_at?: string
          comments_enabled?: boolean | null
          id?: string
          published_at?: string | null
          thumbnail_url?: string | null
          title?: string
          workspace_id?: string
          youtube_channel_id?: string
          youtube_video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_videos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      current_comment_analyses: {
        Row: {
          actionable_feedback: boolean | null
          analysis_job_item_id: string | null
          category: Database["public"]["Enums"]["comment_category"] | null
          confidence: number | null
          created_at: string | null
          current_rank: number | null
          evidence_review: boolean | null
          explanation: string | null
          id: string | null
          manual_review: boolean | null
          model_run_id: string | null
          phishing: number | null
          policy_version: number | null
          provenance: Json | null
          raw_comment_id: string | null
          recommended_action:
            | Database["public"]["Enums"]["recommended_action"]
            | null
          retrieved_feedback: Json | null
          review_level: Database["public"]["Enums"]["review_level"] | null
          rule_evaluation_id: string | null
          spam: number | null
          stage: number | null
          stage_one_analysis_id: string | null
          toxicity: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comment_analyses_analysis_job_item_id_fkey"
            columns: ["analysis_job_item_id"]
            isOneToOne: false
            referencedRelation: "analysis_job_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_analyses_model_run_id_fkey"
            columns: ["model_run_id"]
            isOneToOne: true
            referencedRelation: "model_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_analyses_raw_comment_id_fkey"
            columns: ["raw_comment_id"]
            isOneToOne: false
            referencedRelation: "raw_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_analyses_rule_evaluation_id_fkey"
            columns: ["rule_evaluation_id"]
            isOneToOne: false
            referencedRelation: "rule_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_analyses_stage_one_analysis_id_fkey"
            columns: ["stage_one_analysis_id"]
            isOneToOne: false
            referencedRelation: "comment_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_analyses_stage_one_analysis_id_fkey"
            columns: ["stage_one_analysis_id"]
            isOneToOne: false
            referencedRelation: "current_comment_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_analyses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_connection_overview: {
        Row: {
          created_at: string | null
          granted_scopes: string[] | null
          id: string | null
          status: Database["public"]["Enums"]["connection_status"] | null
          token_expires_at: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          granted_scopes?: string[] | null
          id?: string | null
          status?: Database["public"]["Enums"]["connection_status"] | null
          token_expires_at?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          granted_scopes?: string[] | null
          id?: string | null
          status?: Database["public"]["Enums"]["connection_status"] | null
          token_expires_at?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "youtube_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      attach_channel_sync_analysis_items: {
        Args: {
          target_claim_token: string
          target_configuration_key: string
          target_import_job_id: string
          target_run_id: string
          target_workspace_id: string
          target_youtube_video_id: string
        }
        Returns: {
          analysis_job_id: string
          raw_comment_id: string
        }[]
      }
      claim_analysis_job_items: {
        Args: { target_analysis_job_id: string; target_max_items: number }
        Returns: {
          item_id: string
          raw_comment_id: string
          workspace_id: string
        }[]
      }
      claim_channel_comment_sync_work: {
        Args: { target_lease_seconds?: number; target_limit?: number }
        Returns: {
          backfill_start_at: string
          claim_token: string
          connection_id: string
          incremental_scan_started_at: string | null
          last_successful_sync_at: string | null
          page_token: string | null
          run_id: string
          run_kind: string
          setting_id: string
          workspace_id: string
          youtube_channel_id: string
        }[]
      }
      claim_channel_comment_sync_work_for_workspace: {
        Args: {
          target_lease_seconds?: number
          target_requesting_user_id: string
          target_workspace_id: string
        }
        Returns: {
          backfill_start_at: string
          claim_token: string
          connection_id: string
          incremental_scan_started_at: string | null
          last_successful_sync_at: string | null
          page_token: string | null
          run_id: string
          run_kind: string
          setting_id: string
          workspace_id: string
          youtube_channel_id: string
        }[]
      }
      claim_channel_comment_sync_work_internal: {
        Args: {
          target_lease_seconds: number
          target_limit: number
          target_workspace_id: string | null
        }
        Returns: {
          backfill_start_at: string
          claim_token: string
          connection_id: string
          incremental_scan_started_at: string | null
          last_successful_sync_at: string | null
          page_token: string | null
          run_id: string
          run_kind: string
          setting_id: string
          workspace_id: string
          youtube_channel_id: string
        }[]
      }
      claim_dashboard_summary_job: {
        Args: {
          target_analysis_job_id: string
          target_max_attempts: number
          target_workspace_id: string
        }
        Returns: {
          attempt_count: number
        }[]
      }
      claim_moderation_request: {
        Args: {
          target_actor_user_id: string
          target_confirmed_at: string
          target_request_id: string
          target_workspace_id: string
        }
        Returns: boolean
      }
      complete_channel_comment_sync_run: {
        Args: {
          target_analyzed_count: number
          target_claim_token: string
          target_duplicate_count: number
          target_failed_count: number
          target_next_page_token: string | null
          target_observed_count: number
          target_quota_units_used: number
          target_reached_boundary: boolean
          target_reply_cursor?: string | null
          target_run_id: string
          target_stored_count: number
          target_updated_count: number
        }
        Returns: {
          analyzed_count: number
          claim_token: string | null
          created_at: string
          duplicate_count: number
          error_code: string | null
          failed_count: number
          finished_at: string | null
          id: string
          input_page_token: string | null
          kind: string
          observed_count: number
          output_page_token: string | null
          quota_units_used: number
          setting_id: string
          started_at: string | null
          status: string
          stored_count: number
          updated_count: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "channel_comment_sync_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_moderation_request: {
        Args: {
          target_actor_user_id: string
          target_error_code: string
          target_executed_at: string
          target_provider_status: number
          target_request_id: string
          target_state: Database["public"]["Enums"]["action_state"]
          target_workspace_id: string
        }
        Returns: boolean
      }
      complete_moderation_scope_grant: {
        Args: {
          target_actor_user_id: string
          target_channel_id: string
          target_connection_id: string
          target_encrypted_access_token: string
          target_encrypted_refresh_token: string
          target_expected_updated_at: string
          target_google_subject: string
          target_granted_scopes: string[]
          target_new_updated_at: string
          target_request_id: string
          target_token_expires_at: string
          target_workspace_id: string
        }
        Returns: boolean
      }
      configure_channel_comment_sync: {
        Args: { target_start_date: string; target_workspace_id: string }
        Returns: {
          backfill_page_token: string | null
          backfill_start_at: string
          backfill_status: string
          connection_id: string
          created_at: string
          enabled: boolean
          id: string
          incremental_page_token: string | null
          incremental_scan_started_at: string | null
          last_error_code: string | null
          last_reply_reconciliation_at: string | null
          last_successful_sync_at: string | null
          lease_until: string | null
          next_reply_reconciliation_at: string | null
          next_sync_at: string
          reply_reconciliation_page_token: string | null
          reply_reconciliation_status: string
          sync_interval_minutes: number
          updated_at: string
          workspace_id: string
          youtube_channel_id: string
        }
        SetofOptions: {
          from: "*"
          to: "channel_comment_sync_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_creator_policy_version: {
        Args: {
          target_category_sensitivity: Json
          target_harmful_text_hidden: boolean
          target_phrase_rules: Json
          target_preferred_actions: Json
          target_workspace_id: string
        }
        Returns: {
          policy_id: string
          policy_version: number
        }[]
      }
      create_moderation_request_with_evidence: {
        Args: {
          target_action: Database["public"]["Enums"]["moderation_action"]
          target_channel_id: string
          target_connection_id: string
          target_connection_updated_at: string
          target_evidence: Json
          target_idempotency_key: string
          target_raw_comment_id: string
          target_requested_by: string
          target_source_import_job_id: string
          target_state: Database["public"]["Enums"]["action_state"]
          target_workspace_id: string
        }
        Returns: {
          request_id: string
          request_state: Database["public"]["Enums"]["action_state"]
        }[]
      }
      create_or_get_channel_sync_video_import_job: {
        Args: {
          target_claim_token: string
          target_provider_mode: string
          target_run_id: string
          target_workspace_id: string
          target_youtube_video_id: string
        }
        Returns: {
          analyzed_count: number
          duplicate_count: number
          failed_count: number
          id: string
          is_terminal: boolean
          quota_units_used: number
          status: Database["public"]["Enums"]["job_status"]
          stored_count: number
          updated_count: number
        }[]
      }
      disconnect_youtube_channel: {
        Args: { target_workspace_id: string }
        Returns: undefined
      }
      ensure_owner_workspace: { Args: never; Returns: string }
      fail_channel_comment_sync_run: {
        Args: {
          target_claim_token: string
          target_error_code: string
          target_run_id: string
        }
        Returns: {
          analyzed_count: number
          claim_token: string | null
          created_at: string
          duplicate_count: number
          error_code: string | null
          failed_count: number
          finished_at: string | null
          id: string
          input_page_token: string | null
          kind: string
          observed_count: number
          output_page_token: string | null
          quota_units_used: number
          setting_id: string
          started_at: string | null
          status: string
          stored_count: number
          updated_count: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "channel_comment_sync_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_channel_sync_video_import_job: {
        Args: {
          target_claim_token: string
          target_duplicate_count: number
          target_error_code: string | null
          target_failed_count: number
          target_import_job_id: string
          target_observed_count: number
          target_reply_count: number
          target_run_id: string
          target_status: Database["public"]["Enums"]["job_status"]
          target_stored_count: number
          target_top_level_count: number
          target_updated_count: number
        }
        Returns: {
          analyzed_count: number
          attempt_count: number
          channel_sync_run_id: string | null
          created_at: string
          duplicate_count: number
          failed_count: number
          fetched_count: number
          finished_at: string | null
          id: string
          last_error_code: string | null
          next_page_token: string | null
          provider_mode: string
          reply_count: number
          requested_top_level_count: number | null
          requested_total_count: number | null
          source_kind: Database["public"]["Enums"]["comment_source_kind"]
          source_video_url: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          stored_count: number
          top_level_count: number
          trigger_kind: string
          updated_count: number
          workspace_id: string
          youtube_quota_units_used: number
          youtube_video_id: string
        }
        SetofOptions: {
          from: "*"
          to: "comment_import_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_channel_sync_video_import_job_v2: {
        Args: {
          target_claim_token: string
          target_duplicate_count: number
          target_error_code: string | null
          target_failed_count: number
          target_import_job_id: string
          target_observed_count: number
          target_quota_units_used: number
          target_reply_count: number
          target_run_id: string
          target_status: Database["public"]["Enums"]["job_status"]
          target_stored_count: number
          target_top_level_count: number
          target_updated_count: number
        }
        Returns: {
          analyzed_count: number
          attempt_count: number
          channel_sync_run_id: string | null
          created_at: string
          duplicate_count: number
          failed_count: number
          fetched_count: number
          finished_at: string | null
          id: string
          last_error_code: string | null
          next_page_token: string | null
          provider_mode: string
          reply_count: number
          requested_top_level_count: number | null
          requested_total_count: number | null
          source_kind: Database["public"]["Enums"]["comment_source_kind"]
          source_video_url: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          stored_count: number
          top_level_count: number
          trigger_kind: string
          updated_count: number
          workspace_id: string
          youtube_quota_units_used: number
          youtube_video_id: string
        }
        SetofOptions: {
          from: "*"
          to: "comment_import_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_acknowledged_comment_source: {
        Args: { target_raw_comment_id: string; target_workspace_id: string }
        Returns: {
          author_avatar_url: string
          author_display_name: string
          captured_at: string
          published_at: string
          text_display: string
        }[]
      }
      get_dashboard_summary: {
        Args: { target_workspace_id: string }
        Returns: {
          analyzed_count: number
          caution_count: number
          imported_count: number
          latest_analysis_cost: Json
          latest_analysis_job: Json
          latest_import_job: Json
          latest_summary: string
          latest_summary_source_count: number
          latest_video: Json
          pending_review_count: number
          priority_comments: Json
          recent_actions: Json
          recent_corrections: Json
          risk_count: number
          safe_count: number
          selected_channel: Json
        }[]
      }
      get_dashboard_summary_inputs: {
        Args: { target_analysis_job_id: string }
        Returns: {
          analysis_count: number
          caution_count: number
          job_status: Database["public"]["Enums"]["job_status"]
          risk_count: number
          safe_count: number
          sanitized_signals: Json
          workspace_id: string
        }[]
      }
      get_inbox_conversation_page: {
        Args: {
          action_state_filter?: Database["public"]["Enums"]["action_state"]
          analysis_state_filter?: string
          category_filter?: Database["public"]["Enums"]["comment_category"]
          max_confidence?: number
          min_confidence?: number
          page_offset?: number
          page_size?: number
          review_levels?: Database["public"]["Enums"]["review_level"][]
          search_query?: string
          target_workspace_id: string
          video_id?: string
        }
        Returns: {
          action_state: Database["public"]["Enums"]["action_state"]
          analysis_id: string
          analysis_state: string
          author_avatar_url: string
          author_display_name: string
          category: Database["public"]["Enums"]["comment_category"]
          classification_status: string
          classification_trace: Json
          confidence: number
          delete_eligible: boolean
          like_count: number
          manual_review: boolean
          neutral_text: string
          normalized_question: string
          published_at: string
          raw_comment_id: string
          recommended_action: Database["public"]["Enums"]["recommended_action"]
          replies: Json
          reply_count: number
          review_level: Database["public"]["Enums"]["review_level"]
          safe_source_text: string
          source_available: boolean
          source_import_job_id: string
          source_kind: Database["public"]["Enums"]["comment_source_kind"]
          total_count: number
          video_thumbnail_url: string
          video_title: string
          youtube_video_id: string
        }[]
      }
      get_inbox_page: {
        Args: {
          action_state_filter?: Database["public"]["Enums"]["action_state"]
          analysis_state_filter?: string
          category_filter?: Database["public"]["Enums"]["comment_category"]
          max_confidence?: number
          min_confidence?: number
          page_offset?: number
          page_size?: number
          review_levels?: Database["public"]["Enums"]["review_level"][]
          search_query?: string
          target_workspace_id: string
          video_id?: string
        }
        Returns: {
          action_state: Database["public"]["Enums"]["action_state"]
          analysis_id: string
          analysis_state: string
          author_avatar_url: string
          author_display_name: string
          category: Database["public"]["Enums"]["comment_category"]
          confidence: number
          delete_eligible: boolean
          manual_review: boolean
          neutral_text: string
          normalized_question: string
          published_at: string
          raw_comment_id: string
          recommended_action: Database["public"]["Enums"]["recommended_action"]
          review_level: Database["public"]["Enums"]["review_level"]
          safe_source_text: string
          source_available: boolean
          source_import_job_id: string
          source_kind: Database["public"]["Enums"]["comment_source_kind"]
          total_count: number
          youtube_video_id: string
        }[]
      }
      get_retryable_dashboard_summary_jobs: {
        Args: { target_max_jobs: number }
        Returns: {
          analysis_job_id: string
        }[]
      }
      is_workspace_member: { Args: { target: string }; Returns: boolean }
      list_unanalyzed_channel_sync_raw_comment_ids: {
        Args: {
          target_configuration_key: string
          target_workspace_id: string
          target_youtube_video_id: string
        }
        Returns: {
          raw_comment_id: string
        }[]
      }
      lock_active_channel_sync_claim: {
        Args: {
          target_claim_token: string
          target_run_id: string
          target_workspace_id: string
        }
        Returns: {
          analyzed_count: number
          claim_token: string | null
          created_at: string
          duplicate_count: number
          error_code: string | null
          failed_count: number
          finished_at: string | null
          id: string
          input_page_token: string | null
          kind: string
          observed_count: number
          output_page_token: string | null
          quota_units_used: number
          setting_id: string
          started_at: string | null
          status: string
          stored_count: number
          updated_count: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "channel_comment_sync_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_creator_feedback: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_workspace_id: string
        }
        Returns: {
          corrected_category: Database["public"]["Enums"]["comment_category"]
          corrected_review_level: Database["public"]["Enums"]["review_level"]
          decision: string
          edited_sanitized_feedback: string
          feedback_id: string
          similarity: number
        }[]
      }
      reconcile_stale_moderation_request: {
        Args: {
          target_actor_user_id: string
          target_reconciled_at: string
          target_request_id: string
          target_stale_before: string
          target_workspace_id: string
        }
        Returns: boolean
      }
      record_channel_sync_import_item_failure: {
        Args: {
          target_claim_token: string
          target_error_code: string
          target_import_job_id: string
          target_run_id: string
          target_workspace_id: string
          target_youtube_comment_id: string
        }
        Returns: undefined
      }
      request_channel_comment_sync_now: {
        Args: { target_workspace_id: string }
        Returns: {
          backfill_page_token: string | null
          backfill_start_at: string
          backfill_status: string
          connection_id: string
          created_at: string
          enabled: boolean
          id: string
          incremental_page_token: string | null
          incremental_scan_started_at: string | null
          last_error_code: string | null
          last_reply_reconciliation_at: string | null
          last_successful_sync_at: string | null
          lease_until: string | null
          next_reply_reconciliation_at: string | null
          next_sync_at: string
          reply_reconciliation_page_token: string | null
          reply_reconciliation_status: string
          sync_interval_minutes: number
          updated_at: string
          workspace_id: string
          youtube_channel_id: string
        }
        SetofOptions: {
          from: "*"
          to: "channel_comment_sync_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      select_youtube_channel: {
        Args: { target_channel_id: string; target_workspace_id: string }
        Returns: undefined
      }
      set_channel_comment_sync_enabled: {
        Args: { target_enabled: boolean; target_workspace_id: string }
        Returns: {
          backfill_page_token: string | null
          backfill_start_at: string
          backfill_status: string
          connection_id: string
          created_at: string
          enabled: boolean
          id: string
          incremental_page_token: string | null
          incremental_scan_started_at: string | null
          last_error_code: string | null
          last_reply_reconciliation_at: string | null
          last_successful_sync_at: string | null
          lease_until: string | null
          next_reply_reconciliation_at: string | null
          next_sync_at: string
          reply_reconciliation_page_token: string | null
          reply_reconciliation_status: string
          sync_interval_minutes: number
          updated_at: string
          workspace_id: string
          youtube_channel_id: string
        }
        SetofOptions: {
          from: "*"
          to: "channel_comment_sync_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      store_channel_sync_comment_item: {
        Args: {
          target_author_avatar_url: string
          target_author_channel_id: string
          target_author_display_name: string
          target_claim_token: string
          target_import_job_id: string
          target_like_count: number
          target_parent_youtube_comment_id: string
          target_payload: Json
          target_published_at: string
          target_run_id: string
          target_source_moderation_status: string
          target_text_display: string
          target_text_original: string
          target_updated_at: string
          target_workspace_id: string
          target_youtube_comment_id: string
          target_youtube_video_id: string
        }
        Returns: {
          disposition: string
          raw_comment_id: string
        }[]
      }
      store_import_comment_item: {
        Args: {
          target_author_avatar_url: string
          target_author_channel_id: string
          target_author_display_name: string
          target_import_job_id: string
          target_like_count: number
          target_parent_youtube_comment_id: string
          target_payload: Json
          target_published_at: string
          target_source_moderation_status: string
          target_text_display: string
          target_text_original: string
          target_updated_at: string
          target_workspace_id: string
          target_youtube_comment_id: string
          target_youtube_video_id: string
        }
        Returns: {
          disposition: string
          raw_comment_id: string
        }[]
      }
      store_import_comment_item_internal: {
        Args: {
          target_author_avatar_url: string
          target_author_channel_id: string
          target_author_display_name: string
          target_import_job_id: string
          target_like_count: number
          target_parent_youtube_comment_id: string
          target_payload: Json
          target_published_at: string
          target_source_moderation_status: string
          target_text_display: string
          target_text_original: string
          target_updated_at: string
          target_workspace_id: string
          target_youtube_comment_id: string
          target_youtube_video_id: string
        }
        Returns: {
          disposition: string
          raw_comment_id: string
        }[]
      }
    }
    Enums: {
      action_state:
        | "pending_confirmation"
        | "awaiting_scope"
        | "running"
        | "succeeded"
        | "failed"
        | "cancelled"
      comment_category:
        | "positive"
        | "neutral"
        | "question"
        | "constructive_feedback"
        | "toxic_but_actionable"
        | "abusive_no_signal"
        | "spam_advertisement"
        | "phishing"
        | "harassment"
        | "threat_or_serious_risk"
        | "uncertain"
      comment_source_kind: "owned_oauth" | "public_url"
      connection_status:
        | "pending_channel_selection"
        | "connected"
        | "revoked"
        | "disconnected"
        | "error"
      item_status: "pending" | "running" | "succeeded" | "failed"
      job_status:
        | "pending"
        | "running"
        | "partially_succeeded"
        | "succeeded"
        | "failed"
      moderation_action: "hold_for_review" | "publish" | "reject" | "delete"
      recommended_action:
        | "none"
        | "review"
        | "hold_for_review"
        | "publish"
        | "reject"
      review_level: "safe" | "caution" | "risk"
      rule_kind: "blocked" | "allowed" | "context_exception"
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

type ExpectTrue<T extends true> = T
type IsNullable<T> = null extends T ? true : false

export type ChannelCommentSyncDatabaseTypeAssertions = {
  globalClaimPageToken: ExpectTrue<
    IsNullable<
      Database["public"]["Functions"]["claim_channel_comment_sync_work"]["Returns"][number]["page_token"]
    >
  >
  globalClaimLastSuccessfulSyncAt: ExpectTrue<
    IsNullable<
      Database["public"]["Functions"]["claim_channel_comment_sync_work"]["Returns"][number]["last_successful_sync_at"]
    >
  >
  globalClaimIncrementalScanStartedAt: ExpectTrue<
    IsNullable<
      Database["public"]["Functions"]["claim_channel_comment_sync_work"]["Returns"][number]["incremental_scan_started_at"]
    >
  >
  workspaceClaimPageToken: ExpectTrue<
    IsNullable<
      Database["public"]["Functions"]["claim_channel_comment_sync_work_for_workspace"]["Returns"][number]["page_token"]
    >
  >
  workspaceClaimLastSuccessfulSyncAt: ExpectTrue<
    IsNullable<
      Database["public"]["Functions"]["claim_channel_comment_sync_work_for_workspace"]["Returns"][number]["last_successful_sync_at"]
    >
  >
  workspaceClaimIncrementalScanStartedAt: ExpectTrue<
    IsNullable<
      Database["public"]["Functions"]["claim_channel_comment_sync_work_for_workspace"]["Returns"][number]["incremental_scan_started_at"]
    >
  >
  internalClaimWorkspaceSentinel: ExpectTrue<
    IsNullable<
      Database["public"]["Functions"]["claim_channel_comment_sync_work_internal"]["Args"]["target_workspace_id"]
    >
  >
  completeNextPageToken: ExpectTrue<
    IsNullable<
      Database["public"]["Functions"]["complete_channel_comment_sync_run"]["Args"]["target_next_page_token"]
    >
  >
  completeReplyCursor: ExpectTrue<
    IsNullable<
      Database["public"]["Functions"]["complete_channel_comment_sync_run"]["Args"]["target_reply_cursor"]
    >
  >
}

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      action_state: [
        "pending_confirmation",
        "awaiting_scope",
        "running",
        "succeeded",
        "failed",
        "cancelled",
      ],
      comment_category: [
        "positive",
        "neutral",
        "question",
        "constructive_feedback",
        "toxic_but_actionable",
        "abusive_no_signal",
        "spam_advertisement",
        "phishing",
        "harassment",
        "threat_or_serious_risk",
        "uncertain",
      ],
      comment_source_kind: ["owned_oauth", "public_url"],
      connection_status: [
        "pending_channel_selection",
        "connected",
        "revoked",
        "disconnected",
        "error",
      ],
      item_status: ["pending", "running", "succeeded", "failed"],
      job_status: [
        "pending",
        "running",
        "partially_succeeded",
        "succeeded",
        "failed",
      ],
      moderation_action: ["hold_for_review", "publish", "reject", "delete"],
      recommended_action: [
        "none",
        "review",
        "hold_for_review",
        "publish",
        "reject",
      ],
      review_level: ["safe", "caution", "risk"],
      rule_kind: ["blocked", "allowed", "context_exception"],
    },
  },
} as const
