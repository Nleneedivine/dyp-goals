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
      accountability_sharing_preferences: {
        Row: {
          created_at: string
          share_goals: boolean
          share_tasks: boolean
          share_weekly_reviews: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          share_goals?: boolean
          share_tasks?: boolean
          share_weekly_reviews?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          share_goals?: boolean
          share_tasks?: boolean
          share_weekly_reviews?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountability_sharing_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accountability_groups: {
        Row: {
          created_at: string
          id: string
          mentor_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mentor_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mentor_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_groups: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_channel: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_channel?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_channel?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string
          deleted_at: string | null
          group_id: string | null
          id: string
          is_edited: boolean | null
          media_type: string | null
          media_url: string | null
          message: string
          read_at: string | null
          reply_to_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          group_id?: string | null
          id?: string
          is_edited?: boolean | null
          media_type?: string | null
          media_url?: string | null
          message: string
          read_at?: string | null
          reply_to_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          group_id?: string | null
          id?: string
          is_edited?: boolean | null
          media_type?: string | null
          media_url?: string | null
          message?: string
          read_at?: string | null
          reply_to_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_rate_limits: {
        Row: {
          rate_key: string
          request_count: number
          updated_at: string
          window_started_at: string
        }
        Insert: {
          rate_key: string
          request_count?: number
          updated_at?: string
          window_started_at: string
        }
        Update: {
          rate_key?: string
          request_count?: number
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      execution_notification_deliveries: {
        Row: {
          delivered_at: string
          error_message: string
          id: string
          notification_type: string
          reference_key: string
          status: string
          user_id: string
        }
        Insert: {
          delivered_at?: string
          error_message?: string
          id?: string
          notification_type: string
          reference_key: string
          status?: string
          user_id: string
        }
        Update: {
          delivered_at?: string
          error_message?: string
          id?: string
          notification_type?: string
          reference_key?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      execution_notification_settings: {
        Row: {
          created_at: string
          deadline_alerts_enabled: boolean
          deadline_days_before: number[]
          email_enabled: boolean
          evening_debrief_enabled: boolean
          evening_time: string
          morning_brief_enabled: boolean
          morning_time: string
          timezone: string
          updated_at: string
          user_id: string
          weekly_review_day: number
          weekly_review_enabled: boolean
          weekly_review_time: string
        }
        Insert: {
          created_at?: string
          deadline_alerts_enabled?: boolean
          deadline_days_before?: number[]
          email_enabled?: boolean
          evening_debrief_enabled?: boolean
          evening_time?: string
          morning_brief_enabled?: boolean
          morning_time?: string
          timezone?: string
          updated_at?: string
          user_id: string
          weekly_review_day?: number
          weekly_review_enabled?: boolean
          weekly_review_time?: string
        }
        Update: {
          created_at?: string
          deadline_alerts_enabled?: boolean
          deadline_days_before?: number[]
          email_enabled?: boolean
          evening_debrief_enabled?: boolean
          evening_time?: string
          morning_brief_enabled?: boolean
          morning_time?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          weekly_review_day?: number
          weekly_review_enabled?: boolean
          weekly_review_time?: string
        }
        Relationships: []
      }
      goal_analyses: {
        Row: {
          ai_analysis: Json
          created_at: string
          id: string
          original_goals: string
          refined_goals: string | null
          updated_at: string
          user_id: string | null
          user_responses: Json | null
        }
        Insert: {
          ai_analysis: Json
          created_at?: string
          id?: string
          original_goals: string
          refined_goals?: string | null
          updated_at?: string
          user_id?: string | null
          user_responses?: Json | null
        }
        Update: {
          ai_analysis?: Json
          created_at?: string
          id?: string
          original_goals?: string
          refined_goals?: string | null
          updated_at?: string
          user_id?: string | null
          user_responses?: Json | null
        }
        Relationships: []
      }
      goal_capacity_periods: {
        Row: {
          created_at: string
          end_date: string
          hours_per_week: number
          id: string
          label: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          hours_per_week: number
          id?: string
          label?: string
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          hours_per_week?: number
          id?: string
          label?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goal_capacity_settings: {
        Row: {
          created_at: string
          default_hours_per_week: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_hours_per_week?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_hours_per_week?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goal_effort_periods: {
        Row: {
          created_at: string
          end_date: string
          goal_id: string
          hours_per_week: number
          id: string
          label: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          goal_id: string
          hours_per_week: number
          id?: string
          label?: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          goal_id?: string
          hours_per_week?: number
          id?: string
          label?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_effort_periods_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_milestones: {
        Row: {
          created_at: string
          display_order: number
          due_date: string | null
          goal_id: string
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          due_date?: string | null
          goal_id: string
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          due_date?: string | null
          goal_id?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_milestones_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_task_events: {
        Row: {
          event_type: string
          from_scheduled_date: string | null
          from_scheduled_time: string | null
          from_status: string | null
          goal_id: string
          id: string
          occurred_at: string
          task_id: string | null
          to_scheduled_date: string | null
          to_scheduled_time: string | null
          to_status: string | null
          user_id: string
        }
        Insert: {
          event_type: string
          from_scheduled_date?: string | null
          from_scheduled_time?: string | null
          from_status?: string | null
          goal_id: string
          id?: string
          occurred_at?: string
          task_id?: string | null
          to_scheduled_date?: string | null
          to_scheduled_time?: string | null
          to_status?: string | null
          user_id: string
        }
        Update: {
          event_type?: string
          from_scheduled_date?: string | null
          from_scheduled_time?: string | null
          from_status?: string | null
          goal_id?: string
          id?: string
          occurred_at?: string
          task_id?: string | null
          to_scheduled_date?: string | null
          to_scheduled_time?: string | null
          to_status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_task_events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "goal_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          deferred_from_date: string | null
          display_order: number
          estimated_minutes: number
          goal_id: string
          id: string
          milestone_id: string | null
          notes: string
          scheduled_date: string | null
          scheduled_time: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          weekly_action_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deferred_from_date?: string | null
          display_order?: number
          estimated_minutes?: number
          goal_id: string
          id?: string
          milestone_id?: string | null
          notes?: string
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          weekly_action_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deferred_from_date?: string | null
          display_order?: number
          estimated_minutes?: number
          goal_id?: string
          id?: string
          milestone_id?: string | null
          notes?: string
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          weekly_action_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "goal_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_tasks_weekly_action_id_fkey"
            columns: ["weekly_action_id"]
            isOneToOne: false
            referencedRelation: "goal_weekly_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_weekly_actions: {
        Row: {
          created_at: string
          display_order: number
          estimated_minutes: number
          goal_id: string
          id: string
          milestone_id: string | null
          notes: string
          status: string
          title: string
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          estimated_minutes?: number
          goal_id: string
          id?: string
          milestone_id?: string | null
          notes?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          display_order?: number
          estimated_minutes?: number
          goal_id?: string
          id?: string
          milestone_id?: string | null
          notes?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_weekly_actions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_weekly_actions_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "goal_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_weekly_reviews: {
        Row: {
          adjustments: string
          blockers: string
          completed_minutes: number
          completed_tasks: number
          created_at: string
          id: string
          per_goal_summary: Json
          planned_minutes: number
          planned_tasks: number
          updated_at: string
          user_id: string
          week_start: string
          wins: string
        }
        Insert: {
          adjustments?: string
          blockers?: string
          completed_minutes?: number
          completed_tasks?: number
          created_at?: string
          id?: string
          per_goal_summary?: Json
          planned_minutes?: number
          planned_tasks?: number
          updated_at?: string
          user_id: string
          week_start: string
          wins?: string
        }
        Update: {
          adjustments?: string
          blockers?: string
          completed_minutes?: number
          completed_tasks?: number
          created_at?: string
          id?: string
          per_goal_summary?: Json
          planned_minutes?: number
          planned_tasks?: number
          updated_at?: string
          user_id?: string
          week_start?: string
          wins?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          coaching_context: Json
          created_at: string
          description: string
          effort_source: string
          end_date: string | null
          estimated_hours_per_week: number
          id: string
          life_area: string
          priority: string
          source_analysis_id: string | null
          start_date: string | null
          status: string
          success_definition: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coaching_context?: Json
          created_at?: string
          description?: string
          effort_source?: string
          end_date?: string | null
          estimated_hours_per_week?: number
          id?: string
          life_area?: string
          priority?: string
          source_analysis_id?: string | null
          start_date?: string | null
          status?: string
          success_definition?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coaching_context?: Json
          created_at?: string
          description?: string
          effort_source?: string
          end_date?: string | null
          estimated_hours_per_week?: number
          id?: string
          life_area?: string
          priority?: string
          source_analysis_id?: string | null
          start_date?: string | null
          status?: string
          success_definition?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_source_analysis_id_fkey"
            columns: ["source_analysis_id"]
            isOneToOne: false
            referencedRelation: "goal_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      mentorship_requests: {
        Row: {
          areas: string
          created_at: string
          experience: string | null
          goals: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          areas: string
          created_at?: string
          experience?: string | null
          goals: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          areas?: string
          created_at?: string
          experience?: string | null
          goals?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_fixed_blocks: {
        Row: {
          active_end_date: string | null
          active_start_date: string | null
          category: string
          created_at: string
          crosses_midnight: boolean
          days_of_week: number[]
          end_time: string
          id: string
          notes: string
          recurrence: string
          specific_date: string | null
          start_time: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_end_date?: string | null
          active_start_date?: string | null
          category?: string
          created_at?: string
          crosses_midnight?: boolean
          days_of_week?: number[]
          end_time: string
          id?: string
          notes?: string
          recurrence?: string
          specific_date?: string | null
          start_time: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_end_date?: string | null
          active_start_date?: string | null
          category?: string
          created_at?: string
          crosses_midnight?: boolean
          days_of_week?: number[]
          end_time?: string
          id?: string
          notes?: string
          recurrence?: string
          specific_date?: string | null
          start_time?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          first_name: string
          group_id: string | null
          id: string
          last_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name: string
          group_id?: string | null
          id: string
          last_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          group_id?: string | null
          id?: string
          last_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "accountability_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      program_events: {
        Row: {
          benefits: Json
          created_at: string
          currency: string
          discounted_price: number
          ends_at: string
          id: string
          original_price: number
          registration_slug: string
          session_end_time: string
          session_start_time: string
          slug: string
          starts_at: string
          status: string
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          benefits?: Json
          created_at?: string
          currency?: string
          discounted_price: number
          ends_at: string
          id?: string
          original_price: number
          registration_slug?: string
          session_end_time?: string
          session_start_time?: string
          slug: string
          starts_at: string
          status?: string
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          benefits?: Json
          created_at?: string
          currency?: string
          discounted_price?: number
          ends_at?: string
          id?: string
          original_price?: number
          registration_slug?: string
          session_end_time?: string
          session_start_time?: string
          slug?: string
          starts_at?: string
          status?: string
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      program_form_answers: {
        Row: {
          active_time_ms: number | null
          answer: Json
          created_at: string
          field_id: string
          first_input_delay_ms: number | null
          id: string
          submission_id: string
        }
        Insert: {
          active_time_ms?: number | null
          answer?: Json
          created_at?: string
          field_id: string
          first_input_delay_ms?: number | null
          id?: string
          submission_id: string
        }
        Update: {
          active_time_ms?: number | null
          answer?: Json
          created_at?: string
          field_id?: string
          first_input_delay_ms?: number | null
          id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_form_answers_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "program_form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_form_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "program_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_form_events: {
        Row: {
          created_at: string
          elapsed_ms: number
          event_type: string
          field_id: string | null
          form_id: string
          id: number
          session_id: string
        }
        Insert: {
          created_at?: string
          elapsed_ms?: number
          event_type: string
          field_id?: string | null
          form_id: string
          id?: number
          session_id: string
        }
        Update: {
          created_at?: string
          elapsed_ms?: number
          event_type?: string
          field_id?: string | null
          form_id?: string
          id?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_form_events_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "program_form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_form_events_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "program_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_form_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "program_form_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_form_fields: {
        Row: {
          conditional_logic: Json
          created_at: string
          display_order: number
          field_type: string
          form_id: string
          helper_text: string
          id: string
          label: string
          options: Json
          placeholder: string
          required: boolean
          updated_at: string
          validation_rules: Json
        }
        Insert: {
          conditional_logic?: Json
          created_at?: string
          display_order?: number
          field_type: string
          form_id: string
          helper_text?: string
          id?: string
          label: string
          options?: Json
          placeholder?: string
          required?: boolean
          updated_at?: string
          validation_rules?: Json
        }
        Update: {
          conditional_logic?: Json
          created_at?: string
          display_order?: number
          field_type?: string
          form_id?: string
          helper_text?: string
          id?: string
          label?: string
          options?: Json
          placeholder?: string
          required?: boolean
          updated_at?: string
          validation_rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "program_form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "program_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      program_form_sessions: {
        Row: {
          browser_family: string
          completed_at: string | null
          created_at: string
          device_type: string
          form_id: string
          id: string
          last_activity_at: string
          session_token: string
          started_at: string
        }
        Insert: {
          browser_family?: string
          completed_at?: string | null
          created_at?: string
          device_type?: string
          form_id: string
          id?: string
          last_activity_at?: string
          session_token?: string
          started_at?: string
        }
        Update: {
          browser_family?: string
          completed_at?: string | null
          created_at?: string
          device_type?: string
          form_id?: string
          id?: string
          last_activity_at?: string
          session_token?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_form_sessions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "program_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      program_form_submissions: {
        Row: {
          completion_time_ms: number
          created_at: string
          form_id: string
          id: string
          session_id: string
          submitted_at: string
        }
        Insert: {
          completion_time_ms?: number
          created_at?: string
          form_id: string
          id?: string
          session_id: string
          submitted_at?: string
        }
        Update: {
          completion_time_ms?: number
          created_at?: string
          form_id?: string
          id?: string
          session_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "program_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_form_submissions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "program_form_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_forms: {
        Row: {
          brand: string
          closes_at: string | null
          confirmation_email_enabled: boolean
          confirmation_message: string
          created_at: string
          created_by: string
          description: string
          dropoff_warning_threshold: number
          featured: boolean
          id: string
          low_fill_threshold: number
          opens_at: string | null
          response_limit: number | null
          slug: string
          status: string
          submission_deadline: string | null
          title: string
          updated_at: string
        }
        Insert: {
          brand?: string
          closes_at?: string | null
          confirmation_email_enabled?: boolean
          confirmation_message?: string
          created_at?: string
          created_by: string
          description?: string
          dropoff_warning_threshold?: number
          featured?: boolean
          id?: string
          low_fill_threshold?: number
          opens_at?: string | null
          response_limit?: number | null
          slug: string
          status?: string
          submission_deadline?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          brand?: string
          closes_at?: string | null
          confirmation_email_enabled?: boolean
          confirmation_message?: string
          created_at?: string
          created_by?: string
          description?: string
          dropoff_warning_threshold?: number
          featured?: boolean
          id?: string
          low_fill_threshold?: number
          opens_at?: string | null
          response_limit?: number | null
          slug?: string
          status?: string
          submission_deadline?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      time_plans: {
        Row: {
          created_at: string
          current_step: number
          daily_plan: Json | null
          goal: string
          id: string
          monthly_plan: Json | null
          questionnaire_data: Json
          status: string
          updated_at: string
          user_id: string
          weekly_plan: Json | null
          yearly_plan: Json | null
        }
        Insert: {
          created_at?: string
          current_step?: number
          daily_plan?: Json | null
          goal: string
          id?: string
          monthly_plan?: Json | null
          questionnaire_data?: Json
          status?: string
          updated_at?: string
          user_id: string
          weekly_plan?: Json | null
          yearly_plan?: Json | null
        }
        Update: {
          created_at?: string
          current_step?: number
          daily_plan?: Json | null
          goal?: string
          id?: string
          monthly_plan?: Json | null
          questionnaire_data?: Json
          status?: string
          updated_at?: string
          user_id?: string
          weekly_plan?: Json | null
          yearly_plan?: Json | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_generated_week_plan: {
        Args: { p_actions: Json; p_week_start: string }
        Returns: Json
      }
      apply_goal_week_plan: {
        Args: { p_actions: Json; p_week_start: string }
        Returns: {
          actions_created: number
          tasks_created: number
        }[]
      }
      assign_user_to_group: { Args: { _user_id: string }; Returns: string }
      consume_edge_rate_limit: {
        Args: { p_limit: number; p_rate_key: string; p_window_seconds: number }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      get_next_group_name: { Args: never; Returns: string }
      get_user_chat_group_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      is_user_accountability_mentor: {
        Args: {
          p_member_id: string
          p_mentor_id: string
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
      is_chat_group_admin: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_chat_group_creator: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_chat_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      save_goal_weekly_review: {
        Args: {
          p_adjustments?: string
          p_blockers?: string
          p_week_start: string
          p_wins?: string
        }
        Returns: {
          adjustments: string
          blockers: string
          completed_minutes: number
          completed_tasks: number
          created_at: string
          id: string
          per_goal_summary: Json
          planned_minutes: number
          planned_tasks: number
          updated_at: string
          user_id: string
          week_start: string
          wins: string
        }
        SetofOptions: {
          from: "*"
          to: "goal_weekly_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      users_share_group: {
        Args: { _profile_id: string; _viewer_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "mentor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user", "mentor"],
    },
  },
} as const
