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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      activity_aggregations: {
        Row: {
          activity_counts: Json | null
          aggregation_date: string
          aggregation_type: string
          created_at: string | null
          engagement_metrics: Json | null
          entity_counts: Json | null
          id: string
          peak_hour: number | null
          top_users: Json | null
          total_activities: number | null
          unique_users: number | null
          workspace_id: string | null
        }
        Insert: {
          activity_counts?: Json | null
          aggregation_date: string
          aggregation_type: string
          created_at?: string | null
          engagement_metrics?: Json | null
          entity_counts?: Json | null
          id?: string
          peak_hour?: number | null
          top_users?: Json | null
          total_activities?: number | null
          unique_users?: number | null
          workspace_id?: string | null
        }
        Update: {
          activity_counts?: Json | null
          aggregation_date?: string
          aggregation_type?: string
          created_at?: string | null
          engagement_metrics?: Json | null
          entity_counts?: Json | null
          id?: string
          peak_hour?: number | null
          top_users?: Json | null
          total_activities?: number | null
          unique_users?: number | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      activity_feed: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          created_at: string | null
          description: string | null
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          importance_score: number | null
          is_public: boolean | null
          is_system: boolean | null
          metadata: Json | null
          related_users: string[] | null
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          created_at?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          importance_score?: number | null
          is_public?: boolean | null
          is_system?: boolean | null
          metadata?: Json | null
          related_users?: string[] | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          created_at?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          importance_score?: number | null
          is_public?: boolean | null
          is_system?: boolean | null
          metadata?: Json | null
          related_users?: string[] | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      activity_subscriptions: {
        Row: {
          activity_types: Database["public"]["Enums"]["activity_type"][] | null
          created_at: string | null
          daily_digest: boolean | null
          entity_types: Database["public"]["Enums"]["entity_type"][] | null
          id: string
          importance_threshold: number | null
          is_enabled: boolean | null
          notification_methods:
            | Database["public"]["Enums"]["notification_method"][]
            | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string | null
          user_id: string | null
          weekly_digest: boolean | null
          workspace_id: string | null
        }
        Insert: {
          activity_types?: Database["public"]["Enums"]["activity_type"][] | null
          created_at?: string | null
          daily_digest?: boolean | null
          entity_types?: Database["public"]["Enums"]["entity_type"][] | null
          id?: string
          importance_threshold?: number | null
          is_enabled?: boolean | null
          notification_methods?:
            | Database["public"]["Enums"]["notification_method"][]
            | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string | null
          user_id?: string | null
          weekly_digest?: boolean | null
          workspace_id?: string | null
        }
        Update: {
          activity_types?: Database["public"]["Enums"]["activity_type"][] | null
          created_at?: string | null
          daily_digest?: boolean | null
          entity_types?: Database["public"]["Enums"]["entity_type"][] | null
          id?: string
          importance_threshold?: number | null
          is_enabled?: boolean | null
          notification_methods?:
            | Database["public"]["Enums"]["notification_method"][]
            | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string | null
          user_id?: string | null
          weekly_digest?: boolean | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      answers: {
        Row: {
          created_at: string | null
          id: string
          is_correct: boolean | null
          question_id: string | null
          text: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string | null
          text: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_feedback: {
        Row: {
          assignment_id: string
          created_at: string | null
          feedback_text: string
          grade: number | null
          id: string
          instructor_id: string | null
          provided_at: string | null
          status: string | null
          student_id: string | null
        }
        Insert: {
          assignment_id: string
          created_at?: string | null
          feedback_text: string
          grade?: number | null
          id?: string
          instructor_id?: string | null
          provided_at?: string | null
          status?: string | null
          student_id?: string | null
        }
        Update: {
          assignment_id?: string
          created_at?: string | null
          feedback_text?: string
          grade?: number | null
          id?: string
          instructor_id?: string | null
          provided_at?: string | null
          status?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_feedback_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_feedback_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_instances: {
        Row: {
          cohort_name: string | null
          community_id: string | null
          course_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          groups: Json | null
          id: string
          instructions: string | null
          school_id: number | null
          start_date: string | null
          status: string | null
          template_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          cohort_name?: string | null
          community_id?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          groups?: Json | null
          id?: string
          instructions?: string | null
          school_id?: number | null
          start_date?: string | null
          status?: string | null
          template_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          cohort_name?: string | null
          community_id?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          groups?: Json | null
          id?: string
          instructions?: string | null
          school_id?: number | null
          start_date?: string | null
          status?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_instances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_instances_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "school_progress_report"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "assignment_instances_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          content: Json | null
          created_at: string | null
          feedback: string | null
          file_url: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          group_id: string | null
          id: string
          instance_id: string | null
          status: string | null
          submission_type: string | null
          submitted_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content?: Json | null
          created_at?: string | null
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          group_id?: string | null
          id?: string
          instance_id?: string | null
          status?: string | null
          submission_type?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: Json | null
          created_at?: string | null
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          group_id?: string | null
          id?: string
          instance_id?: string | null
          status?: string | null
          submission_type?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "assignment_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_templates: {
        Row: {
          assignment_type: string | null
          block_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          instructions: string | null
          lesson_id: string | null
          max_group_size: number | null
          min_group_size: number | null
          submission_type: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assignment_type?: string | null
          block_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          instructions?: string | null
          lesson_id?: string | null
          max_group_size?: number | null
          min_group_size?: number | null
          submission_type?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assignment_type?: string | null
          block_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          instructions?: string | null
          lesson_id?: string | null
          max_group_size?: number | null
          min_group_size?: number | null
          submission_type?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_templates_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          created_at: string | null
          due_date: string | null
          due_reminder_sent: boolean | null
          id: string
          instructions: string
          lesson_id: string | null
          notification_sent: boolean | null
        }
        Insert: {
          created_at?: string | null
          due_date?: string | null
          due_reminder_sent?: boolean | null
          id?: string
          instructions: string
          lesson_id?: string | null
          notification_sent?: boolean | null
        }
        Update: {
          created_at?: string | null
          due_date?: string | null
          due_reminder_sent?: boolean | null
          id?: string
          instructions?: string
          lesson_id?: string | null
          notification_sent?: boolean | null
        }
        Relationships: []
      }
      blocks: {
        Row: {
          analytics_data: Json | null
          block_weight: number | null
          completion_tracking: Json | null
          course_id: string | null
          estimated_duration_minutes: number | null
          id: string
          interaction_required: boolean | null
          is_visible: boolean | null
          lesson_id: string | null
          payload: Json | null
          position: number | null
          type: string | null
        }
        Insert: {
          analytics_data?: Json | null
          block_weight?: number | null
          completion_tracking?: Json | null
          course_id?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          interaction_required?: boolean | null
          is_visible?: boolean | null
          lesson_id?: string | null
          payload?: Json | null
          position?: number | null
          type?: string | null
        }
        Update: {
          analytics_data?: Json | null
          block_weight?: number | null
          completion_tracking?: Json | null
          course_id?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          interaction_required?: boolean | null
          is_visible?: boolean | null
          lesson_id?: string | null
          payload?: Json | null
          position?: number | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      church_about_sections: {
        Row: {
          content: string
          created_at: string | null
          id: string
          organization_id: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          organization_id: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      church_accounts: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          parent_id: string | null
          type: Database["public"]["Enums"]["church_account_type"]
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          parent_id?: string | null
          type: Database["public"]["Enums"]["church_account_type"]
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          parent_id?: string | null
          type?: Database["public"]["Enums"]["church_account_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "church_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      church_contact_info: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          id: string
          map_embed_url: string | null
          organization_id: string
          phone: string | null
          social_links: Json | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          map_embed_url?: string | null
          organization_id: string
          phone?: string | null
          social_links?: Json | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          map_embed_url?: string | null
          organization_id?: string
          phone?: string | null
          social_links?: Json | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      church_events: {
        Row: {
          created_at: string | null
          date: string
          description: string | null
          id: string
          is_published: boolean | null
          location: string | null
          organization_id: string
          time: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          description?: string | null
          id?: string
          is_published?: boolean | null
          location?: string | null
          organization_id: string
          time?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          description?: string | null
          id?: string
          is_published?: boolean | null
          location?: string | null
          organization_id?: string
          time?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      church_hero_sections: {
        Row: {
          created_at: string | null
          cta_primary_link: string | null
          cta_primary_text: string | null
          cta_secondary_link: string | null
          cta_secondary_text: string | null
          headline: string
          id: string
          images: Json | null
          organization_id: string
          subheadline: string | null
          updated_at: string | null
          welcome_badge: string | null
        }
        Insert: {
          created_at?: string | null
          cta_primary_link?: string | null
          cta_primary_text?: string | null
          cta_secondary_link?: string | null
          cta_secondary_text?: string | null
          headline: string
          id?: string
          images?: Json | null
          organization_id: string
          subheadline?: string | null
          updated_at?: string | null
          welcome_badge?: string | null
        }
        Update: {
          created_at?: string | null
          cta_primary_link?: string | null
          cta_primary_text?: string | null
          cta_secondary_link?: string | null
          cta_secondary_text?: string | null
          headline?: string
          id?: string
          images?: Json | null
          organization_id?: string
          subheadline?: string | null
          updated_at?: string | null
          welcome_badge?: string | null
        }
        Relationships: []
      }
      church_invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["church_user_role"]
          token: string
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role: Database["public"]["Enums"]["church_user_role"]
          token: string
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["church_user_role"]
          token?: string
        }
        Relationships: []
      }
      church_meditation_favorites: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          scripture_reference: string
          scripture_text: string
          scripture_version: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          scripture_reference: string
          scripture_text: string
          scripture_version?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          scripture_reference?: string
          scripture_text?: string
          scripture_version?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_meditation_favorites_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "church_meditation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      church_meditation_preferences: {
        Row: {
          created_at: string | null
          enable_notifications: boolean | null
          evening_emotion: string | null
          id: string
          morning_emotion: string | null
          notification_time: string | null
          preferred_duration: string | null
          preferred_voice: string | null
          show_onboarding: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          enable_notifications?: boolean | null
          evening_emotion?: string | null
          id?: string
          morning_emotion?: string | null
          notification_time?: string | null
          preferred_duration?: string | null
          preferred_voice?: string | null
          show_onboarding?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          enable_notifications?: boolean | null
          evening_emotion?: string | null
          id?: string
          morning_emotion?: string | null
          notification_time?: string | null
          preferred_duration?: string | null
          preferred_voice?: string | null
          show_onboarding?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      church_meditation_recommendations: {
        Row: {
          created_at: string | null
          day_of_week: number | null
          emotion: string
          frequency: number | null
          id: string
          last_used: string | null
          time_of_day: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week?: number | null
          emotion: string
          frequency?: number | null
          id?: string
          last_used?: string | null
          time_of_day?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number | null
          emotion?: string
          frequency?: number | null
          id?: string
          last_used?: string | null
          time_of_day?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      church_meditation_sessions: {
        Row: {
          audio_url: string | null
          created_at: string | null
          duration: number | null
          emotion: string
          id: string
          meditation_text: string | null
          scripture_reference: string | null
          scripture_text: string | null
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string | null
          duration?: number | null
          emotion: string
          id?: string
          meditation_text?: string | null
          scripture_reference?: string | null
          scripture_text?: string | null
          user_id: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string | null
          duration?: number | null
          emotion?: string
          id?: string
          meditation_text?: string | null
          scripture_reference?: string | null
          scripture_text?: string | null
          user_id?: string
        }
        Relationships: []
      }
      church_meditation_streaks: {
        Row: {
          created_at: string | null
          current_streak: number | null
          id: string
          last_meditation_date: string | null
          longest_streak: number | null
          total_meditations: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_meditation_date?: string | null
          longest_streak?: number | null
          total_meditations?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_meditation_date?: string | null
          longest_streak?: number | null
          total_meditations?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      church_organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      church_prayer_requests: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_public: boolean | null
          name: string
          organization_id: string
          phone: string | null
          request: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          organization_id: string
          phone?: string | null
          request: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          organization_id?: string
          phone?: string | null
          request?: string
        }
        Relationships: []
      }
      church_presentation_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_default: boolean | null
          name: string
          organization_id: string
          slides: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          organization_id: string
          slides: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          organization_id?: string
          slides?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      church_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["church_user_role"]
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["church_user_role"]
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["church_user_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
      church_schedules: {
        Row: {
          created_at: string | null
          day_of_week: number | null
          description: string | null
          id: string
          organization_id: string
          service_name: string
          time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week?: number | null
          description?: string | null
          id?: string
          organization_id: string
          service_name: string
          time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number | null
          description?: string | null
          id?: string
          organization_id?: string
          service_name?: string
          time?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      church_sermons: {
        Row: {
          audio_url: string | null
          created_at: string | null
          date: string
          description: string | null
          id: string
          is_published: boolean | null
          organization_id: string
          speaker: string | null
          spotify_url: string | null
          title: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          audio_url?: string | null
          created_at?: string | null
          date: string
          description?: string | null
          id?: string
          is_published?: boolean | null
          organization_id: string
          speaker?: string | null
          spotify_url?: string | null
          title: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          audio_url?: string | null
          created_at?: string | null
          date?: string
          description?: string | null
          id?: string
          is_published?: boolean | null
          organization_id?: string
          speaker?: string | null
          spotify_url?: string | null
          title?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      church_services: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string
          id: string
          notes: string | null
          organization_id: string
          slides: Json
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date: string
          id?: string
          notes?: string | null
          organization_id: string
          slides: Json
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          organization_id?: string
          slides?: Json
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      church_songs: {
        Row: {
          artist: string | null
          created_at: string | null
          created_by: string | null
          id: string
          lyrics: string
          metadata: Json | null
          organization_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          artist?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          lyrics: string
          metadata?: Json | null
          organization_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          artist?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          lyrics?: string
          metadata?: Json | null
          organization_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      church_team_members: {
        Row: {
          bio: string | null
          created_at: string | null
          id: string
          image_url: string | null
          name: string
          order_index: number | null
          organization_id: string
          role: string
          updated_at: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          name: string
          order_index?: number | null
          organization_id: string
          role: string
          updated_at?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          name?: string
          order_index?: number | null
          organization_id?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      church_transaction_lines: {
        Row: {
          account_id: string
          credit: number | null
          debit: number | null
          id: string
          transaction_id: string
        }
        Insert: {
          account_id: string
          credit?: number | null
          debit?: number | null
          id?: string
          transaction_id: string
        }
        Update: {
          account_id?: string
          credit?: number | null
          debit?: number | null
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_transaction_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "church_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_transaction_lines_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "church_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      church_transactions: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string
          description: string | null
          id: string
          organization_id: string
          reference_number: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date: string
          description?: string | null
          id?: string
          organization_id: string
          reference_number?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
          organization_id?: string
          reference_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      church_website_settings: {
        Row: {
          created_at: string | null
          custom_css: string | null
          custom_js: string | null
          favicon_url: string | null
          google_analytics_id: string | null
          id: string
          meta_description: string | null
          organization_id: string
          social_image_url: string | null
          theme: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_css?: string | null
          custom_js?: string | null
          favicon_url?: string | null
          google_analytics_id?: string | null
          id?: string
          meta_description?: string | null
          organization_id: string
          social_image_url?: string | null
          theme?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_css?: string | null
          custom_js?: string | null
          favicon_url?: string | null
          google_analytics_id?: string | null
          id?: string
          meta_description?: string | null
          organization_id?: string
          social_image_url?: string | null
          theme?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          ciudad: string | null
          comuna: string | null
          comuna_notaria: string | null
          created_at: string | null
          direccion: string
          email_contacto_administrativo: string | null
          email_encargado_proyecto: string | null
          fecha_escritura: string
          id: string
          nombre_contacto_administrativo: string | null
          nombre_encargado_proyecto: string | null
          nombre_fantasia: string
          nombre_legal: string
          nombre_notario: string
          nombre_representante: string
          rut: string
          rut_representante: string
          school_id: number | null
          telefono_contacto_administrativo: string | null
          telefono_encargado_proyecto: string | null
        }
        Insert: {
          ciudad?: string | null
          comuna?: string | null
          comuna_notaria?: string | null
          created_at?: string | null
          direccion: string
          email_contacto_administrativo?: string | null
          email_encargado_proyecto?: string | null
          fecha_escritura: string
          id?: string
          nombre_contacto_administrativo?: string | null
          nombre_encargado_proyecto?: string | null
          nombre_fantasia: string
          nombre_legal: string
          nombre_notario: string
          nombre_representante: string
          rut: string
          rut_representante: string
          school_id?: number | null
          telefono_contacto_administrativo?: string | null
          telefono_encargado_proyecto?: string | null
        }
        Update: {
          ciudad?: string | null
          comuna?: string | null
          comuna_notaria?: string | null
          created_at?: string | null
          direccion?: string
          email_contacto_administrativo?: string | null
          email_encargado_proyecto?: string | null
          fecha_escritura?: string
          id?: string
          nombre_contacto_administrativo?: string | null
          nombre_encargado_proyecto?: string | null
          nombre_fantasia?: string
          nombre_legal?: string
          nombre_notario?: string
          nombre_representante?: string
          rut?: string
          rut_representante?: string
          school_id?: number | null
          telefono_contacto_administrativo?: string | null
          telefono_encargado_proyecto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "school_progress_report"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "clientes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      community_documents: {
        Row: {
          created_at: string | null
          current_version: number | null
          description: string | null
          download_count: number | null
          file_name: string
          file_size: number
          folder_id: string | null
          id: string
          is_active: boolean | null
          mime_type: string
          storage_path: string
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          uploaded_by: string
          view_count: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          current_version?: number | null
          description?: string | null
          download_count?: number | null
          file_name: string
          file_size: number
          folder_id?: string | null
          id?: string
          is_active?: boolean | null
          mime_type: string
          storage_path: string
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          uploaded_by: string
          view_count?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          current_version?: number | null
          description?: string | null
          download_count?: number | null
          file_name?: string
          file_size?: number
          folder_id?: string | null
          id?: string
          is_active?: boolean | null
          mime_type?: string
          storage_path?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          uploaded_by?: string
          view_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      community_meetings: {
        Row: {
          created_at: string | null
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          duration_minutes: number | null
          facilitator_id: string | null
          id: string
          is_active: boolean | null
          location: string | null
          meeting_date: string
          notes: string | null
          secretary_id: string | null
          status: Database["public"]["Enums"]["meeting_status"] | null
          summary: string | null
          title: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          facilitator_id?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          meeting_date: string
          notes?: string | null
          secretary_id?: string | null
          status?: Database["public"]["Enums"]["meeting_status"] | null
          summary?: string | null
          title: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          facilitator_id?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          meeting_date?: string
          notes?: string | null
          secretary_id?: string | null
          status?: Database["public"]["Enums"]["meeting_status"] | null
          summary?: string | null
          title?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_meetings_facilitator_id_fkey"
            columns: ["facilitator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_meetings_secretary_id_fkey"
            columns: ["secretary_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_messages: {
        Row: {
          author_id: string | null
          content: string
          content_html: string | null
          created_at: string | null
          edited_at: string | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          reply_to_id: string | null
          thread_id: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          author_id?: string | null
          content: string
          content_html?: string | null
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          reply_to_id?: string | null
          thread_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          author_id?: string | null
          content?: string
          content_html?: string | null
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          reply_to_id?: string | null
          thread_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string
          content: Json
          created_at: string | null
          id: string
          is_archived: boolean | null
          is_pinned: boolean | null
          type: string
          updated_at: string | null
          view_count: number | null
          visibility: string | null
          workspace_id: string
        }
        Insert: {
          author_id: string
          content: Json
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_pinned?: boolean | null
          type: string
          updated_at?: string | null
          view_count?: number | null
          visibility?: string | null
          workspace_id: string
        }
        Update: {
          author_id?: string
          content?: Json
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_pinned?: boolean | null
          type?: string
          updated_at?: string | null
          view_count?: number | null
          visibility?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_workspaces: {
        Row: {
          community_id: string
          created_at: string | null
          custom_name: string | null
          description: string | null
          id: string
          image_storage_path: string | null
          image_url: string | null
          is_active: boolean | null
          name: string | null
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          community_id: string
          created_at?: string | null
          custom_name?: string | null
          description?: string | null
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          is_active?: boolean | null
          name?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          community_id?: string
          created_at?: string | null
          custom_name?: string | null
          description?: string | null
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          is_active?: boolean | null
          name?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_workspaces_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "community_progress_report"
            referencedColumns: ["community_id"]
          },
          {
            foreignKeyName: "community_workspaces_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "growth_communities"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assignment_data: Json | null
          assignment_type: string | null
          can_assign_courses: boolean | null
          can_message_student: boolean | null
          can_view_progress: boolean | null
          community_id: string | null
          consultant_id: string
          created_at: string | null
          ends_at: string | null
          generation_id: string | null
          id: string
          is_active: boolean | null
          notification_sent: boolean | null
          school_id: number | null
          starts_at: string | null
          student_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assignment_data?: Json | null
          assignment_type?: string | null
          can_assign_courses?: boolean | null
          can_message_student?: boolean | null
          can_view_progress?: boolean | null
          community_id?: string | null
          consultant_id: string
          created_at?: string | null
          ends_at?: string | null
          generation_id?: string | null
          id?: string
          is_active?: boolean | null
          notification_sent?: boolean | null
          school_id?: number | null
          starts_at?: string | null
          student_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assignment_data?: Json | null
          assignment_type?: string | null
          can_assign_courses?: boolean | null
          can_message_student?: boolean | null
          can_view_progress?: boolean | null
          community_id?: string | null
          consultant_id?: string
          created_at?: string | null
          ends_at?: string | null
          generation_id?: string | null
          id?: string
          is_active?: boolean | null
          notification_sent?: boolean | null
          school_id?: number | null
          starts_at?: string | null
          student_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_assignments_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "community_progress_report"
            referencedColumns: ["community_id"]
          },
          {
            foreignKeyName: "consultant_assignments_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "growth_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_assignments_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "school_progress_report"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "consultant_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_extraction_feedback: {
        Row: {
          confidence: number | null
          contract_id: string | null
          corrected_value: string | null
          created_at: string | null
          created_by: string | null
          extracted_value: string | null
          field_name: string
          id: string
        }
        Insert: {
          confidence?: number | null
          contract_id?: string | null
          corrected_value?: string | null
          created_at?: string | null
          created_by?: string | null
          extracted_value?: string | null
          field_name: string
          id?: string
        }
        Update: {
          confidence?: number | null
          contract_id?: string | null
          corrected_value?: string | null
          created_at?: string | null
          created_by?: string | null
          extracted_value?: string | null
          field_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_extraction_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          anexo_fecha: string | null
          anexo_numero: number | null
          cliente_id: string
          contrato_url: string | null
          created_at: string | null
          descripcion_manual: string | null
          es_manual: boolean | null
          estado: string | null
          extraction_confidence: number | null
          extraction_data: Json | null
          extraction_timestamp: string | null
          fecha_contrato: string
          fecha_fin: string | null
          firmado: boolean | null
          id: string
          incluir_en_flujo: boolean | null
          is_anexo: boolean | null
          nombre_ciclo: string | null
          numero_contrato: string
          numero_cuotas: number
          numero_participantes: number | null
          parent_contrato_id: string | null
          pdf_extracted: boolean | null
          precio_total_uf: number
          programa_id: string | null
          tipo_moneda: string | null
        }
        Insert: {
          anexo_fecha?: string | null
          anexo_numero?: number | null
          cliente_id: string
          contrato_url?: string | null
          created_at?: string | null
          descripcion_manual?: string | null
          es_manual?: boolean | null
          estado?: string | null
          extraction_confidence?: number | null
          extraction_data?: Json | null
          extraction_timestamp?: string | null
          fecha_contrato: string
          fecha_fin?: string | null
          firmado?: boolean | null
          id?: string
          incluir_en_flujo?: boolean | null
          is_anexo?: boolean | null
          nombre_ciclo?: string | null
          numero_contrato: string
          numero_cuotas?: number
          numero_participantes?: number | null
          parent_contrato_id?: string | null
          pdf_extracted?: boolean | null
          precio_total_uf?: number
          programa_id?: string | null
          tipo_moneda?: string | null
        }
        Update: {
          anexo_fecha?: string | null
          anexo_numero?: number | null
          cliente_id?: string
          contrato_url?: string | null
          created_at?: string | null
          descripcion_manual?: string | null
          es_manual?: boolean | null
          estado?: string | null
          extraction_confidence?: number | null
          extraction_data?: Json | null
          extraction_timestamp?: string | null
          fecha_contrato?: string
          fecha_fin?: string | null
          firmado?: boolean | null
          id?: string
          incluir_en_flujo?: boolean | null
          is_anexo?: boolean | null
          nombre_ciclo?: string | null
          numero_contrato?: string
          numero_cuotas?: number
          numero_participantes?: number | null
          parent_contrato_id?: string | null
          pdf_extracted?: boolean | null
          precio_total_uf?: number
          programa_id?: string | null
          tipo_moneda?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      course_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string
          assignment_data: Json | null
          assignment_type: string | null
          course_id: string
          due_date: string | null
          id: string
          notes: string | null
          priority: string | null
          progress_percentage: number | null
          status: string | null
          teacher_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by: string
          assignment_data?: Json | null
          assignment_type?: string | null
          course_id: string
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          progress_percentage?: number | null
          status?: string | null
          teacher_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string
          assignment_data?: Json | null
          assignment_type?: string | null
          course_id?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          progress_percentage?: number | null
          status?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_enrollments: {
        Row: {
          access_expires_at: string | null
          completed_at: string | null
          completion_certificate_url: string | null
          completion_notification_sent: boolean | null
          course_id: string
          created_at: string | null
          enrolled_at: string | null
          enrolled_by: string | null
          enrollment_data: Json | null
          enrollment_type: string | null
          estimated_completion_time_seconds: number | null
          has_passed: boolean | null
          id: string
          is_completed: boolean | null
          lessons_completed: number | null
          overall_score: number | null
          passing_threshold: number | null
          progress_percentage: number | null
          status: string | null
          total_lessons: number | null
          total_time_spent_seconds: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_expires_at?: string | null
          completed_at?: string | null
          completion_certificate_url?: string | null
          completion_notification_sent?: boolean | null
          course_id: string
          created_at?: string | null
          enrolled_at?: string | null
          enrolled_by?: string | null
          enrollment_data?: Json | null
          enrollment_type?: string | null
          estimated_completion_time_seconds?: number | null
          has_passed?: boolean | null
          id?: string
          is_completed?: boolean | null
          lessons_completed?: number | null
          overall_score?: number | null
          passing_threshold?: number | null
          progress_percentage?: number | null
          status?: string | null
          total_lessons?: number | null
          total_time_spent_seconds?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_expires_at?: string | null
          completed_at?: string | null
          completion_certificate_url?: string | null
          completion_notification_sent?: boolean | null
          course_id?: string
          created_at?: string | null
          enrolled_at?: string | null
          enrolled_by?: string | null
          enrollment_data?: Json | null
          enrollment_type?: string | null
          estimated_completion_time_seconds?: number | null
          has_passed?: boolean | null
          id?: string
          is_completed?: boolean | null
          lessons_completed?: number | null
          overall_score?: number | null
          passing_threshold?: number | null
          progress_percentage?: number | null
          status?: string | null
          total_lessons?: number | null
          total_time_spent_seconds?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_enrolled_by_fkey"
            columns: ["enrolled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_prerequisites: {
        Row: {
          course_id: string
          created_at: string | null
          id: string
          is_required: boolean | null
          minimum_score: number | null
          prerequisite_course_id: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          minimum_score?: number | null
          prerequisite_course_id: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          minimum_score?: number | null
          prerequisite_course_id?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          analytics_data: Json | null
          certificate_template_url: string | null
          completion_criteria: Json | null
          created_at: string | null
          created_by: string | null
          description: string
          difficulty_level: string | null
          enrollment_limit: number | null
          estimated_duration_hours: number | null
          id: string
          instructor_id: string
          is_self_paced: boolean | null
          learning_objectives: Json | null
          prerequisites: Json | null
          status: string | null
          structure_type: string | null
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          analytics_data?: Json | null
          certificate_template_url?: string | null
          completion_criteria?: Json | null
          created_at?: string | null
          created_by?: string | null
          description: string
          difficulty_level?: string | null
          enrollment_limit?: number | null
          estimated_duration_hours?: number | null
          id?: string
          instructor_id: string
          is_self_paced?: boolean | null
          learning_objectives?: Json | null
          prerequisites?: Json | null
          status?: string | null
          structure_type?: string | null
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          analytics_data?: Json | null
          certificate_template_url?: string | null
          completion_criteria?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          difficulty_level?: string | null
          enrollment_limit?: number | null
          estimated_duration_hours?: number | null
          id?: string
          instructor_id?: string
          is_self_paced?: boolean | null
          learning_objectives?: Json | null
          prerequisites?: Json | null
          status?: string | null
          structure_type?: string | null
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      cuotas: {
        Row: {
          contrato_id: string
          created_at: string | null
          factura_filename: string | null
          factura_pagada: boolean | null
          factura_size: number | null
          factura_type: string | null
          factura_uploaded_at: string | null
          factura_url: string | null
          fecha_vencimiento: string
          id: string
          monto: number | null
          monto_uf: number
          numero_cuota: number
          pagada: boolean | null
        }
        Insert: {
          contrato_id: string
          created_at?: string | null
          factura_filename?: string | null
          factura_pagada?: boolean | null
          factura_size?: number | null
          factura_type?: string | null
          factura_uploaded_at?: string | null
          factura_url?: string | null
          fecha_vencimiento: string
          id?: string
          monto?: number | null
          monto_uf: number
          numero_cuota: number
          pagada?: boolean | null
        }
        Update: {
          contrato_id?: string
          created_at?: string | null
          factura_filename?: string | null
          factura_pagada?: boolean | null
          factura_size?: number | null
          factura_type?: string | null
          factura_uploaded_at?: string | null
          factura_url?: string | null
          fecha_vencimiento?: string
          id?: string
          monto?: number | null
          monto_uf?: number
          numero_cuota?: number
          pagada?: boolean | null
        }
        Relationships: []
      }
      deleted_blocks: {
        Row: {
          course_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          lesson_id: string | null
          module_id: string | null
          payload: Json | null
          position: number | null
          title: string | null
          type: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id: string
          lesson_id?: string | null
          module_id?: string | null
          payload?: Json | null
          position?: number | null
          title?: string | null
          type: string
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          lesson_id?: string | null
          module_id?: string | null
          payload?: Json | null
          position?: number | null
          title?: string | null
          type?: string
        }
        Relationships: []
      }
      deleted_courses: {
        Row: {
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          id: string
          instructor_id: string | null
          status: string | null
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          id: string
          instructor_id?: string | null
          status?: string | null
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          id?: string
          instructor_id?: string | null
          status?: string | null
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: []
      }
      deleted_lessons: {
        Row: {
          content: string | null
          course_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          module_id: string | null
          order_number: number | null
          title: string
        }
        Insert: {
          content?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id: string
          module_id?: string | null
          order_number?: number | null
          title: string
        }
        Update: {
          content?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          module_id?: string | null
          order_number?: number | null
          title?: string
        }
        Relationships: []
      }
      deleted_modules: {
        Row: {
          course_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          order_number: number | null
          title: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id: string
          order_number?: number | null
          title: string
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          order_number?: number | null
          title?: string
        }
        Relationships: []
      }
      dev_audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          dev_user_id: string
          id: string
          ip_address: unknown | null
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          dev_user_id: string
          id?: string
          ip_address?: unknown | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          dev_user_id?: string
          id?: string
          ip_address?: unknown | null
          user_agent?: string | null
        }
        Relationships: []
      }
      dev_role_sessions: {
        Row: {
          community_id: string | null
          created_at: string | null
          dev_user_id: string
          ended_at: string | null
          expires_at: string | null
          generation_id: string | null
          id: string
          impersonated_role: Database["public"]["Enums"]["user_role_type"]
          impersonated_user_id: string | null
          ip_address: unknown | null
          is_active: boolean | null
          school_id: number | null
          session_token: string
          started_at: string | null
          user_agent: string | null
        }
        Insert: {
          community_id?: string | null
          created_at?: string | null
          dev_user_id: string
          ended_at?: string | null
          expires_at?: string | null
          generation_id?: string | null
          id?: string
          impersonated_role: Database["public"]["Enums"]["user_role_type"]
          impersonated_user_id?: string | null
          ip_address?: unknown | null
          is_active?: boolean | null
          school_id?: number | null
          session_token: string
          started_at?: string | null
          user_agent?: string | null
        }
        Update: {
          community_id?: string | null
          created_at?: string | null
          dev_user_id?: string
          ended_at?: string | null
          expires_at?: string | null
          generation_id?: string | null
          id?: string
          impersonated_role?: Database["public"]["Enums"]["user_role_type"]
          impersonated_user_id?: string | null
          ip_address?: unknown | null
          is_active?: boolean | null
          school_id?: number | null
          session_token?: string
          started_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_role_sessions_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "community_progress_report"
            referencedColumns: ["community_id"]
          },
          {
            foreignKeyName: "dev_role_sessions_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "growth_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_role_sessions_impersonated_user_id_fkey"
            columns: ["impersonated_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_role_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "school_progress_report"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "dev_role_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_users: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_users_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_access_log: {
        Row: {
          accessed_at: string | null
          action_type: string
          document_id: string
          id: string
          ip_address: unknown | null
          user_agent: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          accessed_at?: string | null
          action_type: string
          document_id: string
          id?: string
          ip_address?: unknown | null
          user_agent?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          accessed_at?: string | null
          action_type?: string
          document_id?: string
          id?: string
          ip_address?: unknown | null
          user_agent?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_access_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "community_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folders: {
        Row: {
          created_at: string | null
          created_by: string
          folder_name: string
          id: string
          parent_folder_id: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          folder_name: string
          id?: string
          parent_folder_id?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          folder_name?: string
          id?: string
          parent_folder_id?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string | null
          document_id: string
          file_size: number
          id: string
          mime_type: string
          storage_path: string
          uploaded_by: string
          version_number: number
        }
        Insert: {
          created_at?: string | null
          document_id: string
          file_size: number
          id?: string
          mime_type: string
          storage_path: string
          uploaded_by: string
          version_number: number
        }
        Update: {
          created_at?: string | null
          document_id?: string
          file_size?: number
          id?: string
          mime_type?: string
          storage_path?: string
          uploaded_by?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "community_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          date_end: string | null
          date_start: string
          description: string | null
          id: string
          is_published: boolean | null
          link_display: string | null
          link_url: string | null
          location: string
          time: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_end?: string | null
          date_start: string
          description?: string | null
          id?: string
          is_published?: boolean | null
          link_display?: string | null
          link_url?: string | null
          location: string
          time?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_end?: string | null
          date_start?: string
          description?: string | null
          id?: string
          is_published?: boolean | null
          link_display?: string | null
          link_url?: string | null
          location?: string
          time?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      expense_items: {
        Row: {
          amount: number
          category_id: string | null
          conversion_date: string | null
          conversion_rate: number | null
          created_at: string | null
          currency: string | null
          description: string
          expense_date: string
          expense_number: string | null
          id: string
          notes: string | null
          original_amount: number | null
          receipt_filename: string | null
          receipt_url: string | null
          report_id: string | null
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          amount: number
          category_id?: string | null
          conversion_date?: string | null
          conversion_rate?: number | null
          created_at?: string | null
          currency?: string | null
          description: string
          expense_date: string
          expense_number?: string | null
          id?: string
          notes?: string | null
          original_amount?: number | null
          receipt_filename?: string | null
          receipt_url?: string | null
          report_id?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          conversion_date?: string | null
          conversion_rate?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string
          expense_date?: string
          expense_number?: string | null
          id?: string
          notes?: string | null
          original_amount?: number | null
          receipt_filename?: string | null
          receipt_url?: string | null
          report_id?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: []
      }
      expense_reports: {
        Row: {
          created_at: string | null
          description: string | null
          end_date: string
          id: string
          report_name: string
          review_comments: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string | null
          submitted_at: string | null
          submitted_by: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_date: string
          id?: string
          report_name: string
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_date?: string
          id?: string
          report_name?: string
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_reports_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_activity: {
        Row: {
          created_at: string | null
          created_by: string
          feedback_id: string
          id: string
          is_system_message: boolean | null
          message: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          feedback_id: string
          id?: string
          is_system_message?: boolean | null
          message: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          feedback_id?: string
          id?: string
          is_system_message?: boolean | null
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_activity_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_activity_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "platform_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_permissions: {
        Row: {
          granted_at: string | null
          granted_by: string
          id: string
          is_active: boolean | null
          notes: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          created_at: string | null
          grade_range: string | null
          id: string
          name: string
          school_id: number | null
        }
        Insert: {
          created_at?: string | null
          grade_range?: string | null
          id?: string
          name: string
          school_id?: number | null
        }
        Update: {
          created_at?: string | null
          grade_range?: string | null
          id?: string
          name?: string
          school_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "generations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "school_progress_report"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "generations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      group_assignment_groups: {
        Row: {
          assignment_id: string
          community_id: string
          created_at: string | null
          id: string
          is_consultant_managed: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          assignment_id: string
          community_id: string
          created_at?: string | null
          id?: string
          is_consultant_managed?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          assignment_id?: string
          community_id?: string
          created_at?: string | null
          id?: string
          is_consultant_managed?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_assignment_groups_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "community_progress_report"
            referencedColumns: ["community_id"]
          },
          {
            foreignKeyName: "group_assignment_groups_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "growth_communities"
            referencedColumns: ["id"]
          },
        ]
      }
      group_assignment_members: {
        Row: {
          assignment_id: string
          group_id: string
          id: string
          joined_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          assignment_id: string
          group_id: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          assignment_id?: string
          group_id?: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_assignment_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_assignment_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_assignment_settings: {
        Row: {
          assignment_id: string
          consultant_managed: boolean | null
          created_at: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          assignment_id: string
          consultant_managed?: boolean | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          assignment_id?: string
          consultant_managed?: boolean | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      group_assignment_submissions: {
        Row: {
          assignment_id: string
          content: string | null
          created_at: string | null
          feedback: string | null
          file_url: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          group_id: string
          id: string
          status: string | null
          submitted_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assignment_id: string
          content?: string | null
          created_at?: string | null
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          group_id: string
          id?: string
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assignment_id?: string
          content?: string | null
          created_at?: string | null
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          group_id?: string
          id?: string
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_assignment_submissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_assignment_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_communities: {
        Row: {
          created_at: string | null
          description: string | null
          generation_id: string | null
          id: string
          max_teachers: number | null
          name: string
          school_id: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          generation_id?: string | null
          id?: string
          max_teachers?: number | null
          name: string
          school_id?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          generation_id?: string | null
          id?: string
          max_teachers?: number | null
          name?: string
          school_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_communities_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "school_progress_report"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "growth_communities_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      instructors: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id?: string
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      learning_path_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string
          group_id: string | null
          id: string
          path_id: string
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by: string
          group_id?: string | null
          id?: string
          path_id: string
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string
          group_id?: string | null
          id?: string
          path_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_learning_path_assignments_assigned_by"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_learning_path_assignments_path_id"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_learning_path_assignments_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_path_courses: {
        Row: {
          course_id: string
          created_at: string | null
          id: string
          is_required: boolean | null
          learning_path_id: string
          sequence_order: number
          unlock_criteria: Json | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          learning_path_id: string
          sequence_order: number
          unlock_criteria?: Json | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          learning_path_id?: string
          sequence_order?: number
          unlock_criteria?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_path_courses_learning_path_id_fkey"
            columns: ["learning_path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_paths: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          generation_id: string | null
          id: string
          is_active: boolean | null
          name: string
          path_data: Json | null
          school_id: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          generation_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          path_data?: Json | null
          school_id?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          generation_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          path_data?: Json | null
          school_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_paths_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_paths_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "school_progress_report"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "learning_paths_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_assignment_submissions: {
        Row: {
          assignment_id: string
          attachment_urls: Json | null
          attempt_number: number | null
          content: string | null
          created_at: string | null
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          is_late: boolean | null
          score: number | null
          status: string
          student_id: string
          submitted_at: string | null
          updated_at: string | null
        }
        Insert: {
          assignment_id: string
          attachment_urls?: Json | null
          attempt_number?: number | null
          content?: string | null
          created_at?: string | null
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_late?: boolean | null
          score?: number | null
          status?: string
          student_id: string
          submitted_at?: string | null
          updated_at?: string | null
        }
        Update: {
          assignment_id?: string
          attachment_urls?: Json | null
          attempt_number?: number | null
          content?: string | null
          created_at?: string | null
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_late?: boolean | null
          score?: number | null
          status?: string
          student_id?: string
          submitted_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "lesson_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_assignment_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_assignment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_assignments: {
        Row: {
          allow_late_submission: boolean | null
          assigned_to_community_id: string | null
          assignment_for: string | null
          assignment_type: string
          course_id: string | null
          created_at: string | null
          created_by: string
          description: string | null
          due_date: string | null
          group_assignments: Json | null
          id: string
          instructions: string | null
          is_published: boolean | null
          lesson_id: string | null
          max_attempts: number | null
          max_group_size: number | null
          min_group_size: number | null
          points: number | null
          require_all_members_submit: boolean | null
          resources: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          allow_late_submission?: boolean | null
          assigned_to_community_id?: string | null
          assignment_for?: string | null
          assignment_type?: string
          course_id?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          due_date?: string | null
          group_assignments?: Json | null
          id?: string
          instructions?: string | null
          is_published?: boolean | null
          lesson_id?: string | null
          max_attempts?: number | null
          max_group_size?: number | null
          min_group_size?: number | null
          points?: number | null
          require_all_members_submit?: boolean | null
          resources?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          allow_late_submission?: boolean | null
          assigned_to_community_id?: string | null
          assignment_for?: string | null
          assignment_type?: string
          course_id?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          due_date?: string | null
          group_assignments?: Json | null
          id?: string
          instructions?: string | null
          is_published?: boolean | null
          lesson_id?: string | null
          max_attempts?: number | null
          max_group_size?: number | null
          min_group_size?: number | null
          points?: number | null
          require_all_members_submit?: boolean | null
          resources?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_assignments_assigned_to_community_id_fkey"
            columns: ["assigned_to_community_id"]
            isOneToOne: false
            referencedRelation: "community_progress_report"
            referencedColumns: ["community_id"]
          },
          {
            foreignKeyName: "lesson_assignments_assigned_to_community_id_fkey"
            columns: ["assigned_to_community_id"]
            isOneToOne: false
            referencedRelation: "growth_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_assignments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_completion_summary: {
        Row: {
          blocks_completed: number | null
          completion_date: string | null
          course_id: string
          created_at: string | null
          first_accessed_at: string | null
          has_passed_assessments: boolean | null
          id: string
          is_completed: boolean | null
          last_accessed_at: string | null
          lesson_id: string
          progress_percentage: number | null
          quiz_attempts: number | null
          quiz_score: number | null
          total_blocks: number | null
          total_time_spent_seconds: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          blocks_completed?: number | null
          completion_date?: string | null
          course_id: string
          created_at?: string | null
          first_accessed_at?: string | null
          has_passed_assessments?: boolean | null
          id?: string
          is_completed?: boolean | null
          last_accessed_at?: string | null
          lesson_id: string
          progress_percentage?: number | null
          quiz_attempts?: number | null
          quiz_score?: number | null
          total_blocks?: number | null
          total_time_spent_seconds?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          blocks_completed?: number | null
          completion_date?: string | null
          course_id?: string
          created_at?: string | null
          first_accessed_at?: string | null
          has_passed_assessments?: boolean | null
          id?: string
          is_completed?: boolean | null
          last_accessed_at?: string | null
          lesson_id?: string
          progress_percentage?: number | null
          quiz_attempts?: number | null
          quiz_score?: number | null
          total_blocks?: number | null
          total_time_spent_seconds?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_completion_summary_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_completion_summary_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          block_id: string | null
          completed_at: string | null
          completion_data: Json | null
          created_at: string | null
          id: string
          lesson_id: string | null
          time_spent: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          block_id?: string | null
          completed_at?: string | null
          completion_data?: Json | null
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          time_spent?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          block_id?: string | null
          completed_at?: string | null
          completion_data?: Json | null
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          time_spent?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          analytics_data: Json | null
          completion_criteria: Json | null
          content: string | null
          course_id: string | null
          created_at: string | null
          difficulty_level: string | null
          downloadable_files: Json | null
          entry_quiz: Json | null
          estimated_duration_minutes: number | null
          exit_quiz: Json | null
          has_entry_quiz: boolean | null
          has_exit_quiz: boolean | null
          has_files: boolean | null
          id: string
          is_mandatory: boolean | null
          lesson_type: string | null
          module_id: string | null
          order_number: number | null
          prerequisites: Json | null
          title: string
        }
        Insert: {
          analytics_data?: Json | null
          completion_criteria?: Json | null
          content?: string | null
          course_id?: string | null
          created_at?: string | null
          difficulty_level?: string | null
          downloadable_files?: Json | null
          entry_quiz?: Json | null
          estimated_duration_minutes?: number | null
          exit_quiz?: Json | null
          has_entry_quiz?: boolean | null
          has_exit_quiz?: boolean | null
          has_files?: boolean | null
          id?: string
          is_mandatory?: boolean | null
          lesson_type?: string | null
          module_id?: string | null
          order_number?: number | null
          prerequisites?: Json | null
          title: string
        }
        Update: {
          analytics_data?: Json | null
          completion_criteria?: Json | null
          content?: string | null
          course_id?: string | null
          created_at?: string | null
          difficulty_level?: string | null
          downloadable_files?: Json | null
          entry_quiz?: Json | null
          estimated_duration_minutes?: number | null
          exit_quiz?: Json | null
          has_entry_quiz?: boolean | null
          has_exit_quiz?: boolean | null
          has_files?: boolean | null
          id?: string
          is_mandatory?: boolean | null
          lesson_type?: string | null
          module_id?: string | null
          order_number?: number | null
          prerequisites?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_agreements: {
        Row: {
          agreement_text: string
          category: string | null
          created_at: string | null
          id: string
          meeting_id: string
          order_index: number | null
          updated_at: string | null
        }
        Insert: {
          agreement_text: string
          category?: string | null
          created_at?: string | null
          id?: string
          meeting_id: string
          order_index?: number | null
          updated_at?: string | null
        }
        Update: {
          agreement_text?: string
          category?: string | null
          created_at?: string | null
          id?: string
          meeting_id?: string
          order_index?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_agreements_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "community_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_attachments: {
        Row: {
          created_at: string | null
          file_path: string
          file_size: number
          file_type: string
          filename: string
          id: string
          meeting_id: string
          uploaded_at: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string | null
          file_path: string
          file_size: number
          file_type: string
          filename: string
          id?: string
          meeting_id: string
          uploaded_at?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string | null
          file_path?: string
          file_size?: number
          file_type?: string
          filename?: string
          id?: string
          meeting_id?: string
          uploaded_at?: string | null
          uploaded_by?: string
        }
        Relationships: []
      }
      meeting_attendees: {
        Row: {
          attendance_status: string | null
          created_at: string | null
          id: string
          meeting_id: string
          notes: string | null
          role: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attendance_status?: string | null
          created_at?: string | null
          id?: string
          meeting_id: string
          notes?: string | null
          role?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attendance_status?: string | null
          created_at?: string | null
          id?: string
          meeting_id?: string
          notes?: string | null
          role?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "community_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_commitments: {
        Row: {
          assigned_to: string
          commitment_text: string
          completed_at: string | null
          created_at: string | null
          due_date: string | null
          id: string
          meeting_id: string
          notes: string | null
          progress_percentage: number | null
          status: Database["public"]["Enums"]["task_status"] | null
          updated_at: string | null
        }
        Insert: {
          assigned_to: string
          commitment_text: string
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          meeting_id: string
          notes?: string | null
          progress_percentage?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string
          commitment_text?: string
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string
          notes?: string | null
          progress_percentage?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_commitments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_commitments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "community_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_tasks: {
        Row: {
          actual_hours: number | null
          assigned_to: string
          category: string | null
          completed_at: string | null
          created_at: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          meeting_id: string
          notes: string | null
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          progress_percentage: number | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_description: string | null
          task_title: string
          updated_at: string | null
        }
        Insert: {
          actual_hours?: number | null
          assigned_to: string
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          meeting_id: string
          notes?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          progress_percentage?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_description?: string | null
          task_title: string
          updated_at?: string | null
        }
        Update: {
          actual_hours?: number | null
          assigned_to?: string
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          meeting_id?: string
          notes?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          progress_percentage?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_description?: string | null
          task_title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "community_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "meeting_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_permissions: {
        Row: {
          can_view: boolean | null
          menu_item_id: string
          role_type: string
        }
        Insert: {
          can_view?: boolean | null
          menu_item_id: string
          role_type: string
        }
        Update: {
          can_view?: boolean | null
          menu_item_id?: string
          role_type?: string
        }
        Relationships: []
      }
      message_activity_log: {
        Row: {
          action_type: Database["public"]["Enums"]["message_activity_type"]
          created_at: string | null
          id: string
          ip_address: unknown | null
          message_id: string | null
          metadata: Json | null
          thread_id: string | null
          user_agent: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["message_activity_type"]
          created_at?: string | null
          id?: string
          ip_address?: unknown | null
          message_id?: string | null
          metadata?: Json | null
          thread_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["message_activity_type"]
          created_at?: string | null
          id?: string
          ip_address?: unknown | null
          message_id?: string | null
          metadata?: Json | null
          thread_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_activity_log_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string | null
          description: string | null
          download_count: number | null
          file_name: string
          file_size: number
          id: string
          is_active: boolean | null
          message_id: string | null
          mime_type: string
          storage_path: string
          thumbnail_path: string | null
          uploaded_by: string | null
          view_count: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          download_count?: number | null
          file_name: string
          file_size: number
          id?: string
          is_active?: boolean | null
          message_id?: string | null
          mime_type: string
          storage_path: string
          thumbnail_path?: string | null
          uploaded_by?: string | null
          view_count?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          download_count?: number | null
          file_name?: string
          file_size?: number
          id?: string
          is_active?: boolean | null
          message_id?: string | null
          mime_type?: string
          storage_path?: string
          thumbnail_path?: string | null
          uploaded_by?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      message_mentions: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          mention_text: string
          mentioned_user_id: string | null
          message_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          mention_text: string
          mentioned_user_id?: string | null
          message_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          mention_text?: string
          mentioned_user_id?: string | null
          message_id?: string | null
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          message_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          message_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          message_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      message_threads: {
        Row: {
          created_at: string | null
          created_by: string | null
          custom_category_name: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          is_locked: boolean | null
          is_pinned: boolean | null
          last_message_at: string | null
          message_count: number | null
          participant_count: number | null
          thread_title: string
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          custom_category_name?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          is_locked?: boolean | null
          is_pinned?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          participant_count?: number | null
          thread_title: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          custom_category_name?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          is_locked?: boolean | null
          is_pinned?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          participant_count?: number | null
          thread_title?: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      metadata_sync_log: {
        Row: {
          id: string
          new_role: string | null
          old_role: string | null
          sync_completed_at: string | null
          sync_requested_at: string | null
          sync_status: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          new_role?: string | null
          old_role?: string | null
          sync_completed_at?: string | null
          sync_requested_at?: string | null
          sync_status?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          new_role?: string | null
          old_role?: string | null
          sync_completed_at?: string | null
          sync_requested_at?: string | null
          sync_status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metadata_sync_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          course_id: string | null
          created_at: string | null
          description: string | null
          id: string
          order: number | null
          order_number: number | null
          title: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          order?: number | null
          order_number?: number | null
          title: string
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          order?: number | null
          order_number?: number | null
          title?: string
        }
        Relationships: []
      }
      news_articles: {
        Row: {
          author_id: string | null
          content: Json
          content_html: string
          created_at: string | null
          display_date: string | null
          featured_image: string | null
          id: string
          is_published: boolean | null
          slug: string
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          content: Json
          content_html: string
          created_at?: string | null
          display_date?: string | null
          featured_image?: string | null
          id?: string
          is_published?: boolean | null
          slug: string
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          content?: Json
          content_html?: string
          created_at?: string | null
          display_date?: string | null
          featured_image?: string | null
          id?: string
          is_published?: boolean | null
          slug?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          event_data: Json
          event_type: string
          id: string
          notifications_created: number | null
          processed_at: string | null
          status: string | null
          trigger_id: string | null
        }
        Insert: {
          event_data: Json
          event_type: string
          id?: string
          notifications_created?: number | null
          processed_at?: string | null
          status?: string | null
          trigger_id?: string | null
        }
        Update: {
          event_data?: Json
          event_type?: string
          id?: string
          notifications_created?: number | null
          processed_at?: string | null
          status?: string | null
          trigger_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "notification_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_triggers: {
        Row: {
          category: string
          created_at: string | null
          event_type: string
          id: string
          is_active: boolean | null
          notification_template: Json
          trigger_condition: Json | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          event_type: string
          id?: string
          is_active?: boolean | null
          notification_template: Json
          trigger_condition?: Json | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          event_type?: string
          id?: string
          is_active?: boolean | null
          notification_template?: Json
          trigger_condition?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_types: {
        Row: {
          category: string
          created_at: string | null
          default_enabled: boolean | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          category: string
          created_at?: string | null
          default_enabled?: boolean | null
          description?: string | null
          id: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string | null
          default_enabled?: boolean | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_notifications_type"
            columns: ["type"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pasantias_programs: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          pdf_url: string | null
          price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          pdf_url?: string | null
          price?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          pdf_url?: string | null
          price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      pasantias_quote_groups: {
        Row: {
          accommodation_total: number | null
          arrival_date: string
          created_at: string | null
          departure_date: string
          flight_price: number | null
          flight_total: number | null
          group_name: string | null
          id: string
          nights: number | null
          num_participants: number
          quote_id: string
          room_price_per_night: number | null
          room_type: string
          updated_at: string | null
        }
        Insert: {
          accommodation_total?: number | null
          arrival_date: string
          created_at?: string | null
          departure_date: string
          flight_price?: number | null
          flight_total?: number | null
          group_name?: string | null
          id?: string
          nights?: number | null
          num_participants?: number
          quote_id: string
          room_price_per_night?: number | null
          room_type: string
          updated_at?: string | null
        }
        Update: {
          accommodation_total?: number | null
          arrival_date?: string
          created_at?: string | null
          departure_date?: string
          flight_price?: number | null
          flight_total?: number | null
          group_name?: string | null
          id?: string
          nights?: number | null
          num_participants?: number
          quote_id?: string
          room_price_per_night?: number | null
          room_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pasantias_quote_groups_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "pasantias_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      pasantias_quotes: {
        Row: {
          accepted_at: string | null
          accommodation_total: number | null
          apply_early_bird_discount: boolean | null
          arrival_date: string
          client_email: string | null
          client_institution: string | null
          client_name: string
          client_phone: string | null
          created_at: string | null
          created_by: string | null
          departure_date: string
          discount_amount: number | null
          double_room_price: number | null
          early_bird_payment_date: string | null
          flight_notes: string | null
          flight_price: number | null
          grand_total: number | null
          id: string
          internal_notes: string | null
          nights: number | null
          notes: string | null
          num_pasantes: number
          original_program_total: number | null
          program_total: number | null
          quote_number: number
          room_type: string
          selected_programs: string[] | null
          single_room_price: number | null
          status: string | null
          total_per_person: number | null
          updated_at: string | null
          updated_by: string | null
          use_groups: boolean | null
          valid_until: string | null
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accommodation_total?: number | null
          apply_early_bird_discount?: boolean | null
          arrival_date: string
          client_email?: string | null
          client_institution?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          departure_date: string
          discount_amount?: number | null
          double_room_price?: number | null
          early_bird_payment_date?: string | null
          flight_notes?: string | null
          flight_price?: number | null
          grand_total?: number | null
          id?: string
          internal_notes?: string | null
          nights?: number | null
          notes?: string | null
          num_pasantes?: number
          original_program_total?: number | null
          program_total?: number | null
          quote_number?: number
          room_type: string
          selected_programs?: string[] | null
          single_room_price?: number | null
          status?: string | null
          total_per_person?: number | null
          updated_at?: string | null
          updated_by?: string | null
          use_groups?: boolean | null
          valid_until?: string | null
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accommodation_total?: number | null
          apply_early_bird_discount?: boolean | null
          arrival_date?: string
          client_email?: string | null
          client_institution?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          departure_date?: string
          discount_amount?: number | null
          double_room_price?: number | null
          early_bird_payment_date?: string | null
          flight_notes?: string | null
          flight_price?: number | null
          grand_total?: number | null
          id?: string
          internal_notes?: string | null
          nights?: number | null
          notes?: string | null
          num_pasantes?: number
          original_program_total?: number | null
          program_total?: number | null
          quote_number?: number
          room_type?: string
          selected_programs?: string[] | null
          single_room_price?: number | null
          status?: string | null
          total_per_person?: number | null
          updated_at?: string | null
          updated_by?: string | null
          use_groups?: boolean | null
          valid_until?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pasantias_quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasantias_quotes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_audit_log: {
        Row: {
          action: string
          created_at: string
          diff: Json | null
          id: string
          is_test: boolean
          new_value: Json | null
          old_value: Json | null
          performed_by: string | null
          permission_key: string | null
          reason: string | null
          role_type: string | null
          test_run_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          diff?: Json | null
          id?: string
          is_test?: boolean
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string | null
          permission_key?: string | null
          reason?: string | null
          role_type?: string | null
          test_run_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          diff?: Json | null
          id?: string
          is_test?: boolean
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string | null
          permission_key?: string | null
          reason?: string | null
          role_type?: string | null
          test_run_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          key: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      platform_feedback: {
        Row: {
          browser_info: Json | null
          created_at: string | null
          created_by: string
          description: string
          id: string
          page_url: string | null
          resolution_notes: string | null
          resolved_at: string | null
          screenshot_filename: string | null
          screenshot_url: string | null
          status: string
          title: string | null
          type: string
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          browser_info?: Json | null
          created_at?: string | null
          created_by: string
          description: string
          id?: string
          page_url?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          screenshot_filename?: string | null
          screenshot_url?: string | null
          status?: string
          title?: string | null
          type?: string
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          browser_info?: Json | null
          created_at?: string | null
          created_by?: string
          description?: string
          id?: string
          page_url?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          screenshot_filename?: string | null
          screenshot_url?: string | null
          status?: string
          title?: string | null
          type?: string
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          id: string
          is_edited: boolean | null
          parent_comment_id: string | null
          post_id: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          id?: string
          is_edited?: boolean | null
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          id?: string
          is_edited?: boolean | null
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      post_hashtags: {
        Row: {
          created_at: string | null
          hashtag: string
          id: string
          post_id: string
        }
        Insert: {
          created_at?: string | null
          hashtag: string
          id?: string
          post_id: string
        }
        Update: {
          created_at?: string | null
          hashtag?: string
          id?: string
          post_id?: string
        }
        Relationships: []
      }
      post_media: {
        Row: {
          caption: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          order_index: number | null
          post_id: string
          storage_path: string | null
          thumbnail_url: string | null
          type: string
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          order_index?: number | null
          post_id: string
          storage_path?: string | null
          thumbnail_url?: string | null
          type: string
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          order_index?: number | null
          post_id?: string
          storage_path?: string | null
          thumbnail_url?: string | null
          type?: string
          url?: string
        }
        Relationships: []
      }
      post_mentions: {
        Row: {
          created_at: string | null
          id: string
          mentioned_user_id: string
          post_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          mentioned_user_id: string
          post_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          mentioned_user_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          reaction_type?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approval_status: string | null
          avatar_url: string | null
          avg_quiz_score: number | null
          community_id: string | null
          courses_completed: number | null
          created_at: string | null
          description: string | null
          email: string | null
          first_name: string | null
          generation_id: string | null
          growth_community: string | null
          id: string
          last_active_at: string | null
          last_name: string | null
          learning_preferences: Json | null
          lessons_completed: number | null
          middle_name: string | null
          must_change_password: boolean | null
          name: string | null
          notification_preferences: Json | null
          school: string | null
          school_id: number | null
          timezone: string | null
          total_learning_time_seconds: number | null
        }
        Insert: {
          approval_status?: string | null
          avatar_url?: string | null
          avg_quiz_score?: number | null
          community_id?: string | null
          courses_completed?: number | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          first_name?: string | null
          generation_id?: string | null
          growth_community?: string | null
          id?: string
          last_active_at?: string | null
          last_name?: string | null
          learning_preferences?: Json | null
          lessons_completed?: number | null
          middle_name?: string | null
          must_change_password?: boolean | null
          name?: string | null
          notification_preferences?: Json | null
          school?: string | null
          school_id?: number | null
          timezone?: string | null
          total_learning_time_seconds?: number | null
        }
        Update: {
          approval_status?: string | null
          avatar_url?: string | null
          avg_quiz_score?: number | null
          community_id?: string | null
          courses_completed?: number | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          first_name?: string | null
          generation_id?: string | null
          growth_community?: string | null
          id?: string
          last_active_at?: string | null
          last_name?: string | null
          learning_preferences?: Json | null
          lessons_completed?: number | null
          middle_name?: string | null
          must_change_password?: boolean | null
          name?: string | null
          notification_preferences?: Json | null
          school?: string | null
          school_id?: number | null
          timezone?: string | null
          total_learning_time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "community_progress_report"
            referencedColumns: ["community_id"]
          },
          {
            foreignKeyName: "profiles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "growth_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "school_progress_report"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_role_backup: {
        Row: {
          created_at: string | null
          id: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          role?: string | null
        }
        Relationships: []
      }
      programas: {
        Row: {
          activo: boolean | null
          codigo_servicio: string | null
          created_at: string | null
          descripcion: string | null
          horas_totales: number | null
          id: string
          modalidad: string | null
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          codigo_servicio?: string | null
          created_at?: string | null
          descripcion?: string | null
          horas_totales?: number | null
          id?: string
          modalidad?: string | null
          nombre: string
        }
        Update: {
          activo?: boolean | null
          codigo_servicio?: string | null
          created_at?: string | null
          descripcion?: string | null
          horas_totales?: number | null
          id?: string
          modalidad?: string | null
          nombre?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          keys: Json
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          keys: Json
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          keys?: Json
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      questions: {
        Row: {
          created_at: string | null
          id: string
          order: number | null
          quiz_id: string | null
          text: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          order?: number | null
          quiz_id?: string | null
          text: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          order?: number | null
          quiz_id?: string | null
          text?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_submissions: {
        Row: {
          answers: Json
          attempt_number: number | null
          auto_gradable_points: number
          auto_graded_score: number | null
          block_id: string
          course_id: string
          general_feedback: string | null
          graded_at: string | null
          graded_by: string | null
          grading_feedback: Json | null
          grading_status: string
          id: string
          lesson_id: string
          manual_gradable_points: number
          manual_graded_score: number | null
          open_responses: Json | null
          review_status: string | null
          student_id: string
          submitted_at: string | null
          time_spent: number | null
          total_possible_points: number
        }
        Insert: {
          answers: Json
          attempt_number?: number | null
          auto_gradable_points: number
          auto_graded_score?: number | null
          block_id: string
          course_id: string
          general_feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          grading_feedback?: Json | null
          grading_status?: string
          id?: string
          lesson_id: string
          manual_gradable_points: number
          manual_graded_score?: number | null
          open_responses?: Json | null
          review_status?: string | null
          student_id: string
          submitted_at?: string | null
          time_spent?: number | null
          total_possible_points: number
        }
        Update: {
          answers?: Json
          attempt_number?: number | null
          auto_gradable_points?: number
          auto_graded_score?: number | null
          block_id?: string
          course_id?: string
          general_feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          grading_feedback?: Json | null
          grading_status?: string
          id?: string
          lesson_id?: string
          manual_gradable_points?: number
          manual_graded_score?: number | null
          open_responses?: Json | null
          review_status?: string | null
          student_id?: string
          submitted_at?: string | null
          time_spent?: number | null
          total_possible_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_submissions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string | null
          id: string
          instructions: string | null
          lesson_id: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          instructions?: string | null
          lesson_id?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          instructions?: string | null
          lesson_id?: string | null
          title?: string
        }
        Relationships: []
      }
      red_escuelas: {
        Row: {
          agregado_por: string
          fecha_agregada: string | null
          id: string
          red_id: string
          school_id: number
        }
        Insert: {
          agregado_por: string
          fecha_agregada?: string | null
          id?: string
          red_id: string
          school_id: number
        }
        Update: {
          agregado_por?: string
          fecha_agregada?: string | null
          id?: string
          red_id?: string
          school_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "red_escuelas_red_id_fkey"
            columns: ["red_id"]
            isOneToOne: false
            referencedRelation: "redes_de_colegios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "red_escuelas_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "school_progress_report"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "red_escuelas_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      redes_de_colegios: {
        Row: {
          created_at: string | null
          created_by: string
          descripcion: string | null
          id: string
          last_updated_by: string | null
          nombre: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          descripcion?: string | null
          id?: string
          last_updated_by?: string | null
          nombre: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          descripcion?: string | null
          id?: string
          last_updated_by?: string | null
          nombre?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          active: boolean | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          granted: boolean
          id: string
          is_test: boolean | null
          permission_key: string
          reason: string | null
          role_type: string
          test_run_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          granted: boolean
          id?: string
          is_test?: boolean | null
          permission_key: string
          reason?: string | null
          role_type: string
          test_run_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          granted?: boolean
          id?: string
          is_test?: boolean | null
          permission_key?: string
          reason?: string | null
          role_type?: string
          test_run_id?: string | null
        }
        Relationships: []
      }
      role_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          type?: string
        }
        Relationships: []
      }
      saved_posts: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          cliente_id: string | null
          has_generations: boolean | null
          id: number
          name: string
        }
        Insert: {
          cliente_id?: string | null
          has_generations?: boolean | null
          id?: number
          name: string
        }
        Update: {
          cliente_id?: string | null
          has_generations?: boolean | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      student_answers: {
        Row: {
          answer_id: string | null
          answered_at: string | null
          id: string
          is_correct: boolean | null
          question_id: string | null
          submission_id: string | null
        }
        Insert: {
          answer_id?: string | null
          answered_at?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string | null
          submission_id?: string | null
        }
        Update: {
          answer_id?: string | null
          answered_at?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string | null
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_answers_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          assignment_id: string | null
          id: string
          notes: string | null
          submission_url: string | null
          submitted_at: string | null
          user_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          id?: string
          notes?: string | null
          submission_url?: string | null
          submitted_at?: string | null
          user_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          id?: string
          notes?: string | null
          submission_url?: string | null
          submitted_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      superadmins: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          reason: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          reason: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          reason?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      supervisor_auditorias: {
        Row: {
          accion: string
          created_at: string | null
          detalles: Json | null
          id: string
          red_id: string | null
          school_id: number | null
          supervisor_id: string
        }
        Insert: {
          accion: string
          created_at?: string | null
          detalles?: Json | null
          id?: string
          red_id?: string | null
          school_id?: number | null
          supervisor_id: string
        }
        Update: {
          accion?: string
          created_at?: string | null
          detalles?: Json | null
          id?: string
          red_id?: string | null
          school_id?: number | null
          supervisor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_auditorias_red_id_fkey"
            columns: ["red_id"]
            isOneToOne: false
            referencedRelation: "redes_de_colegios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_auditorias_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "school_progress_report"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "supervisor_auditorias_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      system_updates: {
        Row: {
          created_at: string | null
          description: string
          features: Json | null
          id: string
          importance: string | null
          is_published: boolean | null
          published_at: string | null
          published_by: string | null
          target_users: string | null
          title: string
          version: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          features?: Json | null
          id?: string
          importance?: string | null
          is_published?: boolean | null
          published_at?: string | null
          published_by?: string | null
          target_users?: string | null
          title: string
          version?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          features?: Json | null
          id?: string
          importance?: string | null
          is_published?: boolean | null
          published_at?: string | null
          published_by?: string | null
          target_users?: string | null
          title?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_updates_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      test_mode_state: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          enabled_at: string | null
          expires_at: string | null
          last_request_at: string | null
          request_count: number | null
          test_run_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          enabled_at?: string | null
          expires_at?: string | null
          last_request_at?: string | null
          request_count?: number | null
          test_run_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          enabled_at?: string | null
          expires_at?: string | null
          last_request_at?: string | null
          request_count?: number | null
          test_run_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_mentions: {
        Row: {
          author_id: string | null
          content: string | null
          context: string
          created_at: string | null
          discussion_id: string | null
          id: string
          mentioned_user_id: string | null
        }
        Insert: {
          author_id?: string | null
          content?: string | null
          context: string
          created_at?: string | null
          discussion_id?: string | null
          id?: string
          mentioned_user_id?: string | null
        }
        Update: {
          author_id?: string | null
          content?: string | null
          context?: string
          created_at?: string | null
          discussion_id?: string | null
          id?: string
          mentioned_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_mentions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          created_at: string | null
          email_enabled: boolean | null
          id: string
          in_app_enabled: boolean | null
          notification_type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          in_app_enabled?: boolean | null
          notification_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          in_app_enabled?: boolean | null
          notification_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_preferences_type"
            columns: ["notification_type"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          idempotency_key: string | null
          importance: string | null
          is_read: boolean | null
          notification_type_id: string | null
          read_at: string | null
          related_url: string | null
          title: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          idempotency_key?: string | null
          importance?: string | null
          is_read?: boolean | null
          notification_type_id?: string | null
          read_at?: string | null
          related_url?: string | null
          title: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          idempotency_key?: string | null
          importance?: string | null
          is_read?: boolean | null
          notification_type_id?: string | null
          read_at?: string | null
          related_url?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_notification_type_id_fkey"
            columns: ["notification_type_id"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progress: {
        Row: {
          attempts: number | null
          block_id: string | null
          completion_date: string | null
          created_at: string | null
          id: string
          interaction_count: number | null
          is_completed: boolean | null
          last_interaction: string | null
          lesson_id: string
          max_score: number | null
          progress_data: Json | null
          score: number | null
          time_spent_seconds: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number | null
          block_id?: string | null
          completion_date?: string | null
          created_at?: string | null
          id?: string
          interaction_count?: number | null
          is_completed?: boolean | null
          last_interaction?: string | null
          lesson_id: string
          max_score?: number | null
          progress_data?: Json | null
          score?: number | null
          time_spent_seconds?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number | null
          block_id?: string | null
          completion_date?: string | null
          created_at?: string | null
          id?: string
          interaction_count?: number | null
          is_completed?: boolean | null
          last_interaction?: string | null
          lesson_id?: string
          max_score?: number | null
          progress_data?: Json | null
          score?: number | null
          time_spent_seconds?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          community_id: string | null
          created_at: string | null
          feedback_scope: Json | null
          generation_id: string | null
          id: string
          is_active: boolean | null
          reporting_scope: Json | null
          role_type: Database["public"]["Enums"]["user_role_type"]
          school_id: number | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          community_id?: string | null
          created_at?: string | null
          feedback_scope?: Json | null
          generation_id?: string | null
          id?: string
          is_active?: boolean | null
          reporting_scope?: Json | null
          role_type: Database["public"]["Enums"]["user_role_type"]
          school_id?: number | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          community_id?: string | null
          created_at?: string | null
          feedback_scope?: Json | null
          generation_id?: string | null
          id?: string
          is_active?: boolean | null
          reporting_scope?: Json | null
          role_type?: Database["public"]["Enums"]["user_role_type"]
          school_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "community_progress_report"
            referencedColumns: ["community_id"]
          },
          {
            foreignKeyName: "user_roles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "growth_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "school_progress_report"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_activities: {
        Row: {
          activity_data: Json | null
          activity_type: string
          created_at: string | null
          id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          activity_data?: Json | null
          activity_type: string
          created_at?: string | null
          id?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          activity_data?: Json | null
          activity_type?: string
          created_at?: string | null
          id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_messages: {
        Row: {
          content: string
          context: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          notification_sent: boolean | null
          recipient_id: string | null
          sender_id: string | null
          sent_at: string | null
          subject: string | null
          thread_id: string | null
        }
        Insert: {
          content: string
          context?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          notification_sent?: boolean | null
          recipient_id?: string | null
          sender_id?: string | null
          sent_at?: string | null
          subject?: string | null
          thread_id?: string | null
        }
        Update: {
          content?: string
          context?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          notification_sent?: boolean | null
          recipient_id?: string | null
          sender_id?: string | null
          sent_at?: string | null
          subject?: string | null
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      community_progress_report: {
        Row: {
          active_last_30_days: number | null
          active_last_7_days: number | null
          avg_progress_percentage: number | null
          avg_quiz_score: number | null
          avg_time_per_teacher_seconds: number | null
          community_id: string | null
          community_name: string | null
          courses_completed: number | null
          first_enrollment_date: string | null
          generation_id: string | null
          generation_name: string | null
          last_activity_date: string | null
          lessons_completed: number | null
          school_id: number | null
          school_name: string | null
          teachers_with_completed_courses: number | null
          total_courses_assigned: number | null
          total_lessons_accessed: number | null
          total_quiz_attempts: number | null
          total_teachers: number | null
          total_time_spent_seconds: number | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_communities_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "school_progress_report"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "growth_communities_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_stats: {
        Row: {
          bug_count: number | null
          feedback_count: number | null
          idea_count: number | null
          in_progress_count: number | null
          new_count: number | null
          resolved_count: number | null
          seen_count: number | null
        }
        Relationships: []
      }
      group_assignments_with_status: {
        Row: {
          assignment_id: string | null
          community_id: string | null
          feedback: string | null
          grade: number | null
          graded_at: string | null
          group_id: string | null
          group_member_count: number | null
          group_name: string | null
          status: string | null
          submitted_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_assignment_groups_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "community_progress_report"
            referencedColumns: ["community_id"]
          },
          {
            foreignKeyName: "group_assignment_groups_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "growth_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_assignment_submissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_assignment_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_quiz_reviews: {
        Row: {
          block_id: string | null
          course_id: string | null
          course_title: string | null
          id: string | null
          lesson_id: string | null
          lesson_title: string | null
          open_responses: Json | null
          reviewer_workload: number | null
          student_email: string | null
          student_id: string | null
          student_name: string | null
          submitted_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_submissions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts_with_engagement: {
        Row: {
          author_id: string | null
          comment_count: number | null
          content: Json | null
          created_at: string | null
          id: string | null
          is_archived: boolean | null
          is_pinned: boolean | null
          media_count: number | null
          reaction_count: number | null
          type: string | null
          updated_at: string | null
          view_count: number | null
          visibility: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_statistics: {
        Row: {
          block_id: string | null
          lesson_id: string | null
          needs_review: number | null
          passed: number | null
          pending_reviews: number | null
          total_submissions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_submissions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      school_progress_report: {
        Row: {
          active_last_30_days: number | null
          active_last_7_days: number | null
          assigned_consultants: number | null
          avg_progress_percentage: number | null
          avg_quiz_score: number | null
          avg_time_per_user_seconds: number | null
          courses_completed: number | null
          first_enrollment_date: string | null
          innova_teachers: number | null
          last_activity_date: string | null
          leadership_members: number | null
          school_id: number | null
          school_name: string | null
          students_with_consultants: number | null
          total_communities: number | null
          total_courses_assigned: number | null
          total_generations: number | null
          total_quiz_attempts: number | null
          total_time_spent_seconds: number | null
          total_users: number | null
          tractor_teachers: number | null
          users_with_completed_courses: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_feedback_activity: {
        Args: {
          p_feedback_id: string
          p_is_system?: boolean
          p_message: string
          p_user_id: string
        }
        Returns: string
      }
      auth_get_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      auth_has_school_access: {
        Args: { p_school_id: number }
        Returns: boolean
      }
      auth_is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      auth_is_course_student: {
        Args: { p_course_id: string }
        Returns: boolean
      }
      auth_is_course_teacher: {
        Args: { p_course_id: string }
        Returns: boolean
      }
      auth_is_superadmin: {
        Args: { check_user_id: string }
        Returns: boolean
      }
      auth_is_teacher: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      batch_assign_learning_path: {
        Args: {
          p_assigned_by: string
          p_group_ids: string[]
          p_path_id: string
          p_user_ids: string[]
        }
        Returns: Json
      }
      calculate_quiz_score: {
        Args: { submission_id: string }
        Returns: {
          final_score: number
          is_fully_graded: boolean
          percentage: number
        }[]
      }
      can_access_workspace: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: boolean
      }
      check_duplicate_notification: {
        Args: {
          p_description: string
          p_time_window_seconds?: number
          p_title: string
          p_user_id: string
        }
        Returns: boolean
      }
      cleanup_expired_dev_sessions: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_expired_test_runs: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cleanup_orphaned_communities: {
        Args: Record<PropertyKey, never>
        Returns: {
          deleted_generation_id: string
          deleted_id: string
          deleted_name: string
          deleted_school_id: string
        }[]
      }
      create_activity: {
        Args: {
          p_activity_type: Database["public"]["Enums"]["activity_type"]
          p_description?: string
          p_entity_id?: string
          p_entity_type: Database["public"]["Enums"]["entity_type"]
          p_importance_score?: number
          p_metadata?: Json
          p_related_users?: string[]
          p_tags?: string[]
          p_title?: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_assignment_template_from_block: {
        Args: {
          p_block_data: Json
          p_block_id: string
          p_created_by: string
          p_lesson_id: string
        }
        Returns: string
      }
      create_document_version: {
        Args: {
          document_uuid: string
          new_file_size: number
          new_mime_type: string
          new_storage_path: string
          user_uuid: string
        }
        Returns: number
      }
      create_full_learning_path: {
        Args: {
          p_course_ids: string[]
          p_created_by: string
          p_description: string
          p_name: string
        }
        Returns: Json
      }
      create_notification: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_message: string
          p_metadata?: Json
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_notification_safe: {
        Args: {
          p_category?: string
          p_description: string
          p_idempotency_key?: string
          p_importance?: string
          p_notification_type_id?: string
          p_related_url?: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      create_sample_notifications_for_user: {
        Args: { p_user_id: string }
        Returns: number
      }
      create_user_notification: {
        Args: {
          p_description?: string
          p_notification_type_id: string
          p_related_url?: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      end_dev_impersonation: {
        Args: {
          p_dev_user_id: string
          p_ip_address?: unknown
          p_user_agent?: string
        }
        Returns: boolean
      }
      exec_sql: {
        Args: { sql: string }
        Returns: undefined
      }
      extract_mentions: {
        Args: { p_content: string }
        Returns: string[]
      }
      generate_notification_idempotency_key: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_timestamp?: string
          p_user_id: string
        }
        Returns: string
      }
      get_active_dev_impersonation: {
        Args: { user_uuid: string }
        Returns: {
          community_id: string
          expires_at: string
          generation_id: string
          impersonated_role: Database["public"]["Enums"]["user_role_type"]
          impersonated_user_id: string
          school_id: number
          session_token: string
        }[]
      }
      get_active_triggers: {
        Args: { p_event_type: string }
        Returns: {
          category: string
          conditions: Json
          template: Json
          trigger_id: string
        }[]
      }
      get_activity_stats: {
        Args: { p_workspace_id?: string }
        Returns: Json
      }
      get_all_auth_users: {
        Args: Record<PropertyKey, never>
        Returns: {
          approval_status: string
          created_at: string
          email: string
          email_confirmed_at: string
          first_name: string
          id: string
          last_name: string
          last_sign_in_at: string
          role_type: string
          school_id: number
          school_name: string
        }[]
      }
      get_available_assignment_templates: {
        Args: { p_course_id: string }
        Returns: {
          assignment_type: string
          created_at: string
          lesson_id: string
          lesson_title: string
          module_title: string
          template_id: string
          template_title: string
        }[]
      }
      get_document_statistics: {
        Args: { workspace_uuid: string }
        Returns: Json
      }
      get_effective_permissions: {
        Args: { p_role_type: string; p_test_run_id?: string }
        Returns: {
          granted: boolean
          permission_key: string
          source: string
        }[]
      }
      get_effective_user_role: {
        Args: { user_uuid: string }
        Returns: Database["public"]["Enums"]["user_role_type"]
      }
      get_emotion_recommendations: {
        Args: { p_user_id: string }
        Returns: {
          emotion: string
          score: number
        }[]
      }
      get_folder_breadcrumb: {
        Args: { folder_uuid: string }
        Returns: Json
      }
      get_meeting_stats: {
        Args: { p_workspace_id: string }
        Returns: {
          completed_commitments: number
          completed_meetings: number
          completed_tasks: number
          overdue_commitments: number
          overdue_tasks: number
          total_commitments: number
          total_meetings: number
          total_tasks: number
          upcoming_meetings: number
        }[]
      }
      get_or_create_community_for_leader: {
        Args: {
          p_generation_id?: string
          p_leader_id: string
          p_school_id: string
        }
        Returns: string
      }
      get_or_create_community_workspace: {
        Args: { p_community_id: string }
        Returns: string
      }
      get_overdue_items: {
        Args: { p_user_id?: string; p_workspace_id?: string }
        Returns: {
          assigned_to: string
          days_overdue: number
          due_date: string
          item_id: string
          item_type: string
          meeting_title: string
          title: string
        }[]
      }
      get_recent_document_activity: {
        Args: { limit_count?: number; workspace_uuid: string }
        Returns: {
          accessed_at: string
          action_type: string
          document_id: string
          document_title: string
          user_id: string
        }[]
      }
      get_reportable_users: {
        Args: { requesting_user_id: string }
        Returns: {
          can_assign_courses: boolean
          can_view: boolean
          community_name: string
          generation_name: string
          relationship_type: string
          school_name: string
          user_email: string
          user_id: string
          user_name: string
          user_role: string
        }[]
      }
      get_reportable_users_enhanced: {
        Args: { requesting_user_id: string }
        Returns: {
          assignment_scope: string
          assignment_type: string
          can_view_progress: boolean
          community_id: string
          email: string
          first_name: string
          generation_id: string
          last_name: string
          role: string
          school_id: string
          user_id: string
        }[]
      }
      get_school_user_counts: {
        Args: Record<PropertyKey, never>
        Returns: {
          school_id: number
          user_count: number
        }[]
      }
      get_thread_statistics: {
        Args: { p_thread_id: string }
        Returns: Json
      }
      get_unread_notification_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_admin_status: {
        Args: { user_uuid: string }
        Returns: boolean
      }
      get_user_messaging_permissions: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: Json
      }
      get_user_workspace_role: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: string
      }
      get_users_needing_metadata_sync: {
        Args: Record<PropertyKey, never>
        Returns: {
          needs_sync: boolean
          profile_role: string
          user_id: string
        }[]
      }
      get_workspace_messaging_stats: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      grade_quiz_feedback: {
        Args: {
          p_general_feedback: string
          p_graded_by: string
          p_question_feedback: Json
          p_review_status: string
          p_submission_id: string
        }
        Returns: undefined
      }
      grade_quiz_open_responses: {
        Args: {
          p_graded_by: string
          p_grading_data: Json
          p_submission_id: string
        }
        Returns: boolean
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      has_feedback_permission: {
        Args: { check_user_id: string }
        Returns: boolean
      }
      increment_document_counter: {
        Args: {
          counter_type: string
          document_uuid: string
          user_uuid?: string
        }
        Returns: undefined
      }
      increment_post_view_count: {
        Args: { post_id: string }
        Returns: undefined
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_dev_user: {
        Args: { user_uuid: string }
        Returns: boolean
      }
      is_global_admin: {
        Args: { user_uuid: string }
        Returns: boolean
      }
      log_notification_event: {
        Args: {
          p_event_data: Json
          p_event_type: string
          p_notifications_count?: number
          p_status?: string
          p_trigger_id?: string
        }
        Returns: string
      }
      mark_all_notifications_read: {
        Args: { p_user_id: string }
        Returns: number
      }
      mark_notification_read: {
        Args:
          | { notification_id: string }
          | { p_notification_id: string; p_user_id: string }
        Returns: boolean
      }
      migrate_assignments_to_enrollments: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      refresh_user_roles_cache: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      start_dev_impersonation: {
        Args: {
          p_community_id?: string
          p_dev_user_id: string
          p_generation_id?: string
          p_impersonated_role: Database["public"]["Enums"]["user_role_type"]
          p_impersonated_user_id?: string
          p_ip_address?: unknown
          p_school_id?: number
          p_user_agent?: string
        }
        Returns: string
      }
      submit_quiz: {
        Args: {
          p_answers: Json
          p_block_id: string
          p_course_id: string
          p_lesson_id: string
          p_quiz_data: Json
          p_student_id: string
          p_time_spent?: number
        }
        Returns: string
      }
      transition_school_to_no_generations: {
        Args: { p_school_id: string }
        Returns: {
          affected_communities: number
          affected_generations: number
          affected_users: number
        }[]
      }
      update_full_learning_path: {
        Args: {
          p_course_ids: string[]
          p_description: string
          p_name: string
          p_path_id: string
          p_updated_by: string
        }
        Returns: Json
      }
      update_meditation_streak: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      update_overdue_status: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      user_church_organization_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      activity_type:
        | "meeting_created"
        | "meeting_updated"
        | "meeting_completed"
        | "meeting_deleted"
        | "agreement_added"
        | "agreement_updated"
        | "commitment_made"
        | "commitment_completed"
        | "task_assigned"
        | "task_completed"
        | "task_updated"
        | "attendee_added"
        | "document_uploaded"
        | "document_updated"
        | "document_downloaded"
        | "document_shared"
        | "document_deleted"
        | "folder_created"
        | "folder_updated"
        | "folder_deleted"
        | "version_created"
        | "access_granted"
        | "access_revoked"
        | "message_sent"
        | "message_edited"
        | "message_deleted"
        | "thread_created"
        | "thread_updated"
        | "reaction_added"
        | "mention_created"
        | "attachment_uploaded"
        | "user_joined"
        | "user_left"
        | "role_changed"
        | "login_tracked"
        | "profile_updated"
        | "workspace_created"
        | "workspace_updated"
        | "settings_changed"
        | "bulk_operation"
        | "notification_sent"
        | "report_generated"
        | "backup_created"
        | "maintenance_performed"
      church_account_type:
        | "asset"
        | "liability"
        | "equity"
        | "revenue"
        | "expense"
      church_transaction_type: "income" | "expense" | "transfer"
      church_user_role: "admin" | "treasurer" | "presenter" | "member"
      entity_type:
        | "meeting"
        | "agreement"
        | "commitment"
        | "task"
        | "attendee"
        | "document"
        | "folder"
        | "version"
        | "access_permission"
        | "message"
        | "thread"
        | "reaction"
        | "mention"
        | "attachment"
        | "user"
        | "workspace"
        | "notification"
        | "report"
        | "system"
      meeting_status:
        | "programada"
        | "en_progreso"
        | "completada"
        | "cancelada"
        | "pospuesta"
      message_activity_type:
        | "message_sent"
        | "message_edited"
        | "message_deleted"
        | "thread_created"
        | "reaction_added"
        | "mention_created"
        | "attachment_uploaded"
      notification_method: "in_app" | "email" | "push" | "sms"
      task_priority: "baja" | "media" | "alta" | "critica"
      task_status:
        | "pendiente"
        | "en_progreso"
        | "completado"
        | "vencido"
        | "cancelado"
      user_role_type:
        | "admin"
        | "consultor"
        | "equipo_directivo"
        | "lider_generacion"
        | "lider_comunidad"
        | "docente"
        | "supervisor_de_red"
        | "community_manager"
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
    Enums: {
      activity_type: [
        "meeting_created",
        "meeting_updated",
        "meeting_completed",
        "meeting_deleted",
        "agreement_added",
        "agreement_updated",
        "commitment_made",
        "commitment_completed",
        "task_assigned",
        "task_completed",
        "task_updated",
        "attendee_added",
        "document_uploaded",
        "document_updated",
        "document_downloaded",
        "document_shared",
        "document_deleted",
        "folder_created",
        "folder_updated",
        "folder_deleted",
        "version_created",
        "access_granted",
        "access_revoked",
        "message_sent",
        "message_edited",
        "message_deleted",
        "thread_created",
        "thread_updated",
        "reaction_added",
        "mention_created",
        "attachment_uploaded",
        "user_joined",
        "user_left",
        "role_changed",
        "login_tracked",
        "profile_updated",
        "workspace_created",
        "workspace_updated",
        "settings_changed",
        "bulk_operation",
        "notification_sent",
        "report_generated",
        "backup_created",
        "maintenance_performed",
      ],
      church_account_type: [
        "asset",
        "liability",
        "equity",
        "revenue",
        "expense",
      ],
      church_transaction_type: ["income", "expense", "transfer"],
      church_user_role: ["admin", "treasurer", "presenter", "member"],
      entity_type: [
        "meeting",
        "agreement",
        "commitment",
        "task",
        "attendee",
        "document",
        "folder",
        "version",
        "access_permission",
        "message",
        "thread",
        "reaction",
        "mention",
        "attachment",
        "user",
        "workspace",
        "notification",
        "report",
        "system",
      ],
      meeting_status: [
        "programada",
        "en_progreso",
        "completada",
        "cancelada",
        "pospuesta",
      ],
      message_activity_type: [
        "message_sent",
        "message_edited",
        "message_deleted",
        "thread_created",
        "reaction_added",
        "mention_created",
        "attachment_uploaded",
      ],
      notification_method: ["in_app", "email", "push", "sms"],
      task_priority: ["baja", "media", "alta", "critica"],
      task_status: [
        "pendiente",
        "en_progreso",
        "completado",
        "vencido",
        "cancelado",
      ],
      user_role_type: [
        "admin",
        "consultor",
        "equipo_directivo",
        "lider_generacion",
        "lider_comunidad",
        "docente",
        "supervisor_de_red",
        "community_manager",
      ],
    },
  },
} as const
