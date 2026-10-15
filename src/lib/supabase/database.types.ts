export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      bookmarks: {
        Row: {
          created_at: string;
          design_id: string;
          owner_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          design_id: string;
          owner_id: string;
        };
        Update: {
          created_at?: string;
          design_id?: string;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookmarks_design_id_fkey";
            columns: ["design_id"];
            isOneToOne: false;
            referencedRelation: "designs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookmarks_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      design_files: {
        Row: {
          bytes: number;
          created_at: string;
          design_id: string;
          extension: string;
          id: string;
          kind: string;
          name: string;
          object_key: string;
          orientation: string;
          position: number;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          bytes: number;
          created_at?: string;
          design_id: string;
          extension: string;
          id?: string;
          kind: string;
          name: string;
          object_key: string;
          orientation?: string;
          position?: number;
          status?: string;
        };
        Update: {
          bytes?: number;
          created_at?: string;
          design_id?: string;
          extension?: string;
          id?: string;
          kind?: string;
          name?: string;
          object_key?: string;
          orientation?: string;
          position?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "design_files_design_id_fkey";
            columns: ["design_id"];
            isOneToOne: false;
            referencedRelation: "designs";
            referencedColumns: ["id"];
          },
        ];
      };
      designs: {
        Row: {
          created_at: string;
          description: string;
          design_method: string;
          hold_type: string;
          id: string;
          license: string;
          material: string;
          mounting: string;
          owner_id: string;
          post_processing: string;
          print_notes: string;
          problem_grade: number | null;
          published_at: string | null;
          size: string;
          special_process: string | null;
          status: string;
          tags: string[];
          texture_notes: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description: string;
          design_method: string;
          hold_type: string;
          id?: string;
          license: string;
          material: string;
          mounting: string;
          owner_id: string;
          post_processing?: string;
          print_notes?: string;
          problem_grade?: number | null;
          published_at?: string | null;
          size: string;
          special_process?: string | null;
          status?: string;
          tags?: string[];
          texture_notes?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          design_method?: string;
          hold_type?: string;
          id?: string;
          license?: string;
          material?: string;
          mounting?: string;
          owner_id?: string;
          post_processing?: string;
          print_notes?: string;
          problem_grade?: number | null;
          published_at?: string | null;
          size?: string;
          special_process?: string | null;
          status?: string;
          tags?: string[];
          texture_notes?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "designs_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          author_id: string | null;
          body: string;
          contact: string;
          created_at: string;
          id: string;
          page: string;
        };
        ComputedFields: never;
        Insert: {
          author_id?: string | null;
          body: string;
          contact?: string;
          created_at?: string;
          id?: string;
          page?: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          contact?: string;
          created_at?: string;
          id?: string;
          page?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lab_presets: {
        Row: {
          created_at: string;
          id: string;
          lab: string;
          name: string;
          owner_id: string;
          search: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          lab: string;
          name: string;
          owner_id: string;
          search?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          lab?: string;
          name?: string;
          owner_id?: string;
          search?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lab_presets_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      phone_photos: {
        Row: {
          bytes: number;
          created_at: string;
          extension: string;
          id: string;
          name: string;
          object_key: string;
          session_id: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          bytes: number;
          created_at?: string;
          extension: string;
          id?: string;
          name: string;
          object_key: string;
          session_id: string;
          status?: string;
        };
        Update: {
          bytes?: number;
          created_at?: string;
          extension?: string;
          id?: string;
          name?: string;
          object_key?: string;
          session_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "phone_photos_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "phone_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      phone_sessions: {
        Row: {
          created_at: string;
          design_id: string | null;
          expires_at: string;
          id: string;
          owner_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          design_id?: string | null;
          expires_at?: string;
          id?: string;
          owner_id: string;
        };
        Update: {
          created_at?: string;
          design_id?: string | null;
          expires_at?: string;
          id?: string;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "phone_sessions_design_id_fkey";
            columns: ["design_id"];
            isOneToOne: false;
            referencedRelation: "designs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_sessions_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string;
          created_at: string;
          display_name: string;
          id: string;
          onboarded_at: string | null;
          updated_at: string;
          upload_limit_bytes: number;
          upload_limit_designs: number;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          bio?: string;
          created_at?: string;
          display_name: string;
          id: string;
          onboarded_at?: string | null;
          updated_at?: string;
          upload_limit_bytes?: number;
          upload_limit_designs?: number;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          onboarded_at?: string | null;
          updated_at?: string;
          upload_limit_bytes?: number;
          upload_limit_designs?: number;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          design_id: string;
          id: string;
          material: string;
          post_processing: string;
          print_settings: string;
          problem_grade: number | null;
          rating: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          design_id: string;
          id?: string;
          material?: string;
          post_processing?: string;
          print_settings?: string;
          problem_grade?: number | null;
          rating: number;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          design_id?: string;
          id?: string;
          material?: string;
          post_processing?: string;
          print_settings?: string;
          problem_grade?: number | null;
          rating?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_design_id_fkey";
            columns: ["design_id"];
            isOneToOne: false;
            referencedRelation: "designs";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
