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
      accountability_groups: {
        Row: {
          cohort_id: string
          created_at: string
          id: string
          mentor_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          cohort_id: string
          created_at?: string
          id?: string
          mentor_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          cohort_id?: string
          created_at?: string
          id?: string
          mentor_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountability_groups_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "program_cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      accountability_lab_preferences: {
        Row: {
          availability: string[]
          commitment_accepted: boolean
          created_at: string
          enrollment_id: string
          goal_areas: string[]
          joined_at: string | null
          updated_at: string
        }
        Insert: {
          availability?: string[]
          commitment_accepted?: boolean
          created_at?: string
          enrollment_id: string
          goal_areas?: string[]
          joined_at?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string[]
          commitment_accepted?: boolean
          created_at?: string
          enrollment_id?: string
          goal_areas?: string[]
          joined_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountability_lab_preferences_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: true
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
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
          accountability_group_id: string | null
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
          accountability_group_id?: string | null
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
          accountability_group_id?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_channel?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_groups_accountability_group_id_fkey"
            columns: ["accountability_group_id"]
            isOneToOne: false
            referencedRelation: "accountability_groups"
            referencedColumns: ["id"]
          },
        ]
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
          deadline_time: string
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
          deadline_time?: string
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
          deadline_time?: string
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
          enrollment_id: string | null
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
          enrollment_id?: string | null
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
          enrollment_id?: string | null
          id?: string
          original_goals?: string
          refined_goals?: string | null
          updated_at?: string
          user_id?: string | null
          user_responses?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_analyses_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
        ]
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
      goal_dependencies: {
        Row: {
          created_at: string
          dependent_goal_id: string
          id: string
          note: string
          prerequisite_goal_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dependent_goal_id: string
          id?: string
          note?: string
          prerequisite_goal_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dependent_goal_id?: string
          id?: string
          note?: string
          prerequisite_goal_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_dependencies_dependent_goal_id_fkey"
            columns: ["dependent_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_dependencies_prerequisite_goal_id_fkey"
            columns: ["prerequisite_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
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
          enrollment_id: string | null
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
          enrollment_id?: string | null
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
          enrollment_id?: string | null
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
            foreignKeyName: "goals_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_source_analysis_id_fkey"
            columns: ["source_analysis_id"]
            isOneToOne: false
            referencedRelation: "goal_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      life_area_focus: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          focus_statement: string
          id: string
          life_area: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_order?: number
          focus_statement?: string
          id?: string
          life_area: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          focus_statement?: string
          id?: string
          life_area?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "life_area_focus_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentorship_requests: {
        Row: {
          accountability_rules_accepted: boolean
          accountability_rules_accepted_at: string | null
          areas: string
          created_at: string
          enrollment_id: string | null
          experience: string | null
          goals: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accountability_rules_accepted?: boolean
          accountability_rules_accepted_at?: string | null
          areas: string
          created_at?: string
          enrollment_id?: string | null
          experience?: string | null
          goals: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accountability_rules_accepted?: boolean
          accountability_rules_accepted_at?: string | null
          areas?: string
          created_at?: string
          enrollment_id?: string | null
          experience?: string | null
          goals?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentorship_requests_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
        ]
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
      platform_configuration: {
        Row: {
          accountability_lab_start_date: string
          id: string
          ui2_default: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accountability_lab_start_date?: string
          id: string
          ui2_default?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accountability_lab_start_date?: string
          id?: string
          ui2_default?: boolean
          updated_at?: string
          updated_by?: string | null
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
      program_accountability_memberships: {
        Row: {
          created_at: string
          enrollment_id: string
          group_id: string
          id: string
          joined_at: string
          left_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enrollment_id: string
          group_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enrollment_id?: string
          group_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_accountability_memberships_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_accountability_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "accountability_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      program_cohorts: {
        Row: {
          cohort_year: number
          created_at: string
          ends_on: string | null
          id: string
          is_current: boolean
          name: string
          program_event_id: string | null
          program_key: string
          slug: string
          starts_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cohort_year: number
          created_at?: string
          ends_on?: string | null
          id?: string
          is_current?: boolean
          name: string
          program_event_id?: string | null
          program_key: string
          slug: string
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cohort_year?: number
          created_at?: string
          ends_on?: string | null
          id?: string
          is_current?: boolean
          name?: string
          program_event_id?: string | null
          program_key?: string
          slug?: string
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_cohorts_program_event_id_fkey"
            columns: ["program_event_id"]
            isOneToOne: false
            referencedRelation: "program_events"
            referencedColumns: ["id"]
          },
        ]
      }
      program_enrollments: {
        Row: {
          activated_at: string | null
          cohort_id: string
          completed_at: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          registered_at: string
          source_submission_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activated_at?: string | null
          cohort_id: string
          completed_at?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          registered_at?: string
          source_submission_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activated_at?: string | null
          cohort_id?: string
          completed_at?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          registered_at?: string
          source_submission_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_enrollments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "program_cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_enrollments_source_submission_id_fkey"
            columns: ["source_submission_id"]
            isOneToOne: true
            referencedRelation: "program_form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      program_events: {
        Row: {
          benefits: Json
          created_at: string
          currency: string
          discount_deadline: string | null
          discounted_price: number
          ends_at: string
          id: string
          original_price: number
          platform: string
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
          discount_deadline?: string | null
          discounted_price: number
          ends_at: string
          id?: string
          original_price: number
          platform?: string
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
          discount_deadline?: string | null
          discounted_price?: number
          ends_at?: string
          id?: string
          original_price?: number
          platform?: string
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
          cohort_id: string | null
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
          cohort_id?: string | null
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
          cohort_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "program_forms_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "program_cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      program_participant_status: {
        Row: {
          certificate_code: string | null
          certificate_eligible: boolean
          certificate_issued_at: string | null
          completion_status: string
          form_id: string
          submission_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          certificate_code?: string | null
          certificate_eligible?: boolean
          certificate_issued_at?: string | null
          completion_status?: string
          form_id: string
          submission_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          certificate_code?: string | null
          certificate_eligible?: boolean
          certificate_issued_at?: string | null
          completion_status?: string
          form_id?: string
          submission_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_participant_status_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "program_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_participant_status_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "program_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_payment_settings: {
        Row: {
          account_name: string
          account_number: string
          amount_minor: number
          bank_name: string
          currency: string
          form_id: string
          manual_enabled: boolean
          manual_instructions: string
          paystack_enabled: boolean
          updated_at: string
          updated_by: string | null
          whatsapp_group_url: string
        }
        Insert: {
          account_name?: string
          account_number?: string
          amount_minor?: number
          bank_name?: string
          currency?: string
          form_id: string
          manual_enabled?: boolean
          manual_instructions?: string
          paystack_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          whatsapp_group_url?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          amount_minor?: number
          bank_name?: string
          currency?: string
          form_id?: string
          manual_enabled?: boolean
          manual_instructions?: string
          paystack_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          whatsapp_group_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_payment_settings_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: true
            referencedRelation: "program_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      program_payments: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          form_id: string
          manual_reference: string | null
          method: string
          paid_at: string | null
          proof_content_type: string | null
          proof_path: string | null
          proof_uploaded_at: string | null
          provider_reference: string | null
          rejection_reason: string | null
          status: string
          submission_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency?: string
          form_id: string
          manual_reference?: string | null
          method: string
          paid_at?: string | null
          proof_content_type?: string | null
          proof_path?: string | null
          proof_uploaded_at?: string | null
          provider_reference?: string | null
          rejection_reason?: string | null
          status?: string
          submission_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          form_id?: string
          manual_reference?: string | null
          method?: string
          paid_at?: string | null
          proof_content_type?: string | null
          proof_path?: string | null
          proof_uploaded_at?: string | null
          provider_reference?: string | null
          rejection_reason?: string | null
          status?: string
          submission_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_payments_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "program_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_payments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "program_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_referral_codes: {
        Row: {
          code: string
          created_at: string
          form_id: string
          submission_id: string
        }
        Insert: {
          code: string
          created_at?: string
          form_id: string
          submission_id: string
        }
        Update: {
          code?: string
          created_at?: string
          form_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_referral_codes_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "program_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_referral_codes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "program_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_referral_visits: {
        Row: {
          click_count: number
          created_at: string
          first_clicked_at: string
          form_id: string
          id: string
          last_clicked_at: string
          promoter_id: string | null
          referral_code: string
          referred_submission_id: string | null
          referrer_submission_id: string | null
          registration_session_id: string | null
          visitor_token: string
        }
        Insert: {
          click_count?: number
          created_at?: string
          first_clicked_at?: string
          form_id: string
          id?: string
          last_clicked_at?: string
          promoter_id?: string | null
          referral_code: string
          referred_submission_id?: string | null
          referrer_submission_id?: string | null
          registration_session_id?: string | null
          visitor_token: string
        }
        Update: {
          click_count?: number
          created_at?: string
          first_clicked_at?: string
          form_id?: string
          id?: string
          last_clicked_at?: string
          promoter_id?: string | null
          referral_code?: string
          referred_submission_id?: string | null
          referrer_submission_id?: string | null
          registration_session_id?: string | null
          visitor_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_referral_visits_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "program_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_referral_visits_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "program_referral_promoters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_referral_visits_referred_submission_id_fkey"
            columns: ["referred_submission_id"]
            isOneToOne: false
            referencedRelation: "program_form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_referral_visits_referrer_submission_id_fkey"
            columns: ["referrer_submission_id"]
            isOneToOne: false
            referencedRelation: "program_form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_referral_visits_registration_session_id_fkey"
            columns: ["registration_session_id"]
            isOneToOne: false
            referencedRelation: "program_form_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_referral_promoters: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          display_name: string
          form_id: string
          id: string
          phone: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          display_name: string
          form_id: string
          id?: string
          phone: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          form_id?: string
          id?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_referral_promoters_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "program_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      program_submission_referrals: {
        Row: {
          created_at: string
          form_id: string
          promoter_id: string | null
          referral_code: string
          referred_submission_id: string
          referrer_submission_id: string | null
        }
        Insert: {
          created_at?: string
          form_id: string
          promoter_id?: string | null
          referral_code: string
          referred_submission_id: string
          referrer_submission_id?: string | null
        }
        Update: {
          created_at?: string
          form_id?: string
          promoter_id?: string | null
          referral_code?: string
          referred_submission_id?: string
          referrer_submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_submission_referrals_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "program_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_submission_referrals_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "program_referral_promoters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_submission_referrals_referred_submission_id_fkey"
            columns: ["referred_submission_id"]
            isOneToOne: true
            referencedRelation: "program_form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_submission_referrals_referrer_submission_id_fkey"
            columns: ["referrer_submission_id"]
            isOneToOne: false
            referencedRelation: "program_form_submissions"
            referencedColumns: ["id"]
          },
        ]
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
      user_planning_vision: {
        Row: {
          created_at: string
          updated_at: string
          user_id: string
          vision_statement: string
          year_theme: string
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id: string
          vision_statement?: string
          year_theme?: string
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
          vision_statement?: string
          year_theme?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_planning_vision_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      admin_bulk_assign_enrollments_to_group: {
        Args: { p_enrollment_ids: string[]; p_group_id: string }
        Returns: Json
      }
      admin_bulk_assign_users_to_group: {
        Args: { p_group_id: string; p_user_ids: string[] }
        Returns: Json
      }
      admin_create_referral_promoter: {
        Args: { p_display_name: string; p_form_id: string; p_phone: string }
        Returns: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          display_name: string
          form_id: string
          id: string
          phone: string
        }
        SetofOptions: {
          from: "*"
          to: "program_referral_promoters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_program_participant_status: {
        Args: {
          p_completion_status: string
          p_issue_certificate?: boolean
          p_submission_id: string
        }
        Returns: {
          certificate_code: string | null
          certificate_eligible: boolean
          certificate_issued_at: string | null
          completion_status: string
          form_id: string
          submission_id: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "program_participant_status"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_program_payment_status:
        | {
            Args: { p_status: string; p_submission_id: string }
            Returns: {
              amount_minor: number
              created_at: string
              currency: string
              form_id: string
              manual_reference: string | null
              method: string
              paid_at: string | null
              proof_content_type: string | null
              proof_path: string | null
              proof_uploaded_at: string | null
              provider_reference: string | null
              rejection_reason: string | null
              status: string
              submission_id: string
              updated_at: string
              verified_at: string | null
              verified_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "program_payments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_rejection_reason?: string
              p_status: string
              p_submission_id: string
            }
            Returns: {
              amount_minor: number
              created_at: string
              currency: string
              form_id: string
              manual_reference: string | null
              method: string
              paid_at: string | null
              proof_content_type: string | null
              proof_path: string | null
              proof_uploaded_at: string | null
              provider_reference: string | null
              rejection_reason: string | null
              status: string
              submission_id: string
              updated_at: string
              verified_at: string | null
              verified_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "program_payments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      admin_sync_accountability_chats: { Args: never; Returns: Json }
      apply_generated_week_plan: {
        Args: { p_actions: Json; p_week_start: string }
        Returns: Json
      }
      apply_goal_ai_refinement: {
        Args: {
          p_effort_periods?: Json
          p_goal_id: string
          p_goal_patch: Json
          p_milestones?: Json
          p_replace_effort_periods?: boolean
        }
        Returns: {
          coaching_context: Json
          created_at: string
          description: string
          effort_source: string
          end_date: string | null
          enrollment_id: string | null
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
        SetofOptions: {
          from: "*"
          to: "goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_goal_week_plan: {
        Args: { p_actions: Json; p_week_start: string }
        Returns: {
          actions_created: number
          tasks_created: number
        }[]
      }
      apply_split_replan: {
        Args: { p_splits: Json; p_task_id: string }
        Returns: Json
      }
      assign_current_user_to_accountability_group: {
        Args: never
        Returns: string
      }
      assign_enrollment_to_available_group: {
        Args: { p_enrollment_id: string }
        Returns: string
      }
      assign_user_to_group: { Args: { _user_id: string }; Returns: string }
      can_activate_goals_account: {
        Args: { p_email: string }
        Returns: boolean
      }
      consume_edge_rate_limit: {
        Args: { p_limit: number; p_rate_key: string; p_window_seconds: number }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      current_user_has_app_access: { Args: never; Returns: boolean }
      ensure_accountability_chat: {
        Args: { p_group_id: string }
        Returns: string
      }
      ensure_program_enrollment_from_submission: {
        Args: { p_submission_id: string }
        Returns: string
      }
      ensure_program_referral_code: {
        Args: { p_form_id: string; p_submission_id: string }
        Returns: string
      }
      attach_program_referral_visit: {
        Args: {
          p_referral_code: string
          p_session_token: string
          p_visitor_token: string
        }
        Returns: boolean
      }
      get_program_referral_funnel_admin: {
        Args: { p_form_id: string }
        Returns: {
          activated_accounts: number
          certified_referrals: number
          completed_training: number
          display_name: string
          paid_referrals: number
          pending_payments: number
          pending_registrations: number
          promoter_id: string | null
          referral_code: string
          referrer_submission_id: string | null
          registration_starts: number
          submitted_registrations: number
          total_clicks: number
          unique_visitors: number
        }[]
      }
      record_program_referral_click: {
        Args: {
          p_code: string
          p_visitor_token?: string
        }
        Returns: Json
      }
      record_program_referral_v2: {
        Args: {
          p_referral_code: string
          p_session_token: string
          p_visitor_token?: string
        }
        Returns: boolean
      }
      get_accountability_program_trends: {
        Args: { p_week_start: string }
        Returns: Json
      }
      get_next_group_name: { Args: never; Returns: string }
      get_next_group_name_for_cohort: {
        Args: { p_cohort_id: string }
        Returns: string
      }
      get_program_form_performance: {
        Args: { p_form_ids: string[] }
        Returns: {
          form_id: string
          submissions: number
          visits: number
        }[]
      }
      get_program_payment_state: {
        Args: { p_session_token: string }
        Returns: Json
      }
      get_program_referral_code: {
        Args: { p_session_token: string }
        Returns: string
      }
      get_program_referral_leaderboard: {
        Args: { p_form_id: string }
        Returns: {
          completed_referrals: number
          referral_code: string
          referrer_submission_id: string
          total_referrals: number
        }[]
      }
      get_program_referral_leaderboard_v2: {
        Args: { p_form_id: string }
        Returns: {
          completed_referrals: number
          display_name: string
          promoter_id: string
          referral_code: string
          referrer_submission_id: string
          total_referrals: number
        }[]
      }
      get_user_chat_group_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
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
      is_user_accountability_mentor: {
        Args: { p_member_id: string; p_mentor_id: string }
        Returns: boolean
      }
      join_current_accountability_lab: {
        Args: { p_availability: string[] }
        Returns: Json
      }
      link_current_user_enrollments: { Args: never; Returns: Json }
      record_program_referral: {
        Args: { p_referral_code: string; p_session_token: string }
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
      search_program_referrers: {
        Args: { p_form_id: string; p_query: string }
        Returns: {
          display_name: string
          referral_code: string
        }[]
      }
      submit_manual_program_payment: {
        Args: { p_manual_reference: string; p_session_token: string }
        Returns: Json
      }
      submit_manual_program_payment_with_proof: {
        Args: {
          p_manual_reference: string
          p_proof_content_type: string
          p_proof_path: string
          p_session_token: string
        }
        Returns: Json
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
