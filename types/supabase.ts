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
      assignments: {
        Row: {
          created_at: string | null
          due_date: string | null
          id: string
          instructions: string
          lesson_id: string | null
        }
        Insert: {
          created_at?: string | null
          due_date?: string | null
          id?: string
          instructions: string
          lesson_id?: string | null
        }
        Update: {
          created_at?: string | null
          due_date?: string | null
          id?: string
          instructions?: string
          lesson_id?: string | null
        }
        Relationships: []
      }
      blocks: {
        Row: {
          course_id: string | null
          id: string
          payload: Json | null
          position: number | null
          type: string | null
        }
        Insert: {
          course_id?: string | null
          id?: string
          payload?: Json | null
          position?: number | null
          type?: string | null
        }
        Update: {
          course_id?: string | null
          id?: string
          payload?: Json | null
          position?: number | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          created_at: string | null
          direccion: string
          fecha_escritura: string
          id: string
          nombre_fantasia: string
          nombre_legal: string
          nombre_notario: string
          nombre_representante: string
          rut: string
          rut_representante: string
        }
        Insert: {
          created_at?: string | null
          direccion: string
          fecha_escritura: string
          id?: string
          nombre_fantasia: string
          nombre_legal: string
          nombre_notario: string
          nombre_representante: string
          rut: string
          rut_representante: string
        }
        Update: {
          created_at?: string | null
          direccion?: string
          fecha_escritura?: string
          id?: string
          nombre_fantasia?: string
          nombre_legal?: string
          nombre_notario?: string
          nombre_representante?: string
          rut?: string
          rut_representante?: string
        }
        Relationships: []
      }
      contratos: {
        Row: {
          cliente_id: string
          created_at: string | null
          estado: string | null
          fecha_contrato: string
          id: string
          numero_contrato: string
          numero_cuotas: number
          precio_total_uf: number
          programa_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          estado?: string | null
          fecha_contrato: string
          id?: string
          numero_contrato: string
          numero_cuotas?: number
          precio_total_uf: number
          programa_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          estado?: string | null
          fecha_contrato?: string
          id?: string
          numero_contrato?: string
          numero_cuotas?: number
          precio_total_uf?: number
          programa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string
          id: string
          instructor_id: string
          status: string | null
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description: string
          id?: string
          instructor_id: string
          status?: string | null
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: string
          instructor_id?: string
          status?: string | null
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
          fecha_vencimiento: string
          id: string
          monto_uf: number
          numero_cuota: number
          pagada: boolean | null
        }
        Insert: {
          contrato_id: string
          created_at?: string | null
          fecha_vencimiento: string
          id?: string
          monto_uf: number
          numero_cuota: number
          pagada?: boolean | null
        }
        Update: {
          contrato_id?: string
          created_at?: string | null
          fecha_vencimiento?: string
          id?: string
          monto_uf?: number
          numero_cuota?: number
          pagada?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cuotas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
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
          instructor_id: string
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
          instructor_id: string
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
          instructor_id: string
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
      lessons: {
        Row: {
          content: string | null
          course_id: string | null
          created_at: string | null
          id: string
          module_id: string | null
          order_number: number | null
          title: string
        }
        Insert: {
          content?: string | null
          course_id?: string | null
          created_at?: string | null
          id?: string
          module_id?: string | null
          order_number?: number | null
          title: string
        }
        Update: {
          content?: string | null
          course_id?: string | null
          created_at?: string | null
          id?: string
          module_id?: string | null
          order_number?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          description: string | null
          email: string | null
          first_name: string | null
          growth_community: string | null
          id: string
          last_name: string | null
          middle_name: string | null
          name: string | null
          role: string | null
          school: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          first_name?: string | null
          growth_community?: string | null
          id?: string
          last_name?: string | null
          middle_name?: string | null
          name?: string | null
          role?: string | null
          school?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          first_name?: string | null
          growth_community?: string | null
          id?: string
          last_name?: string | null
          middle_name?: string | null
          name?: string | null
          role?: string | null
          school?: string | null
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
      schools: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      exec_sql: {
        Args: { sql: string }
        Returns: undefined
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
