export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string
          name: string
          product_name: string | null
          target_roles: string[] | null
          status: 'active' | 'inactive' | 'prospect'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          product_name?: string | null
          target_roles?: string[] | null
          status?: 'active' | 'inactive' | 'prospect'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          product_name?: string | null
          target_roles?: string[] | null
          status?: 'active' | 'inactive' | 'prospect'
          created_at?: string
          updated_at?: string
        }
      }
      case_studies: {
        Row: {
          id: string
          client_id: string | null
          company_name: string
          industry: string
          challenge_tags: string[]
          result_summary: string
          recommended_roles: string[] | null
          recommended_industries: string[] | null
          availability: 'public' | 'restricted' | 'unavailable'
          created_at: string
        }
        Insert: {
          id?: string
          client_id?: string | null
          company_name: string
          industry: string
          challenge_tags: string[]
          result_summary: string
          recommended_roles?: string[] | null
          recommended_industries?: string[] | null
          availability?: 'public' | 'restricted' | 'unavailable'
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string | null
          company_name?: string
          industry?: string
          challenge_tags?: string[]
          result_summary?: string
          recommended_roles?: string[] | null
          recommended_industries?: string[] | null
          availability?: 'public' | 'restricted' | 'unavailable'
          created_at?: string
        }
      }
      target_companies: {
        Row: {
          id: string
          name: string
          industry: string
          employee_scale: string | null
          revenue_scale: string | null
          listing_type: string | null
          prefecture: string | null
          recent_topics: string | null
          topics_updated_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          industry: string
          employee_scale?: string | null
          revenue_scale?: string | null
          listing_type?: string | null
          prefecture?: string | null
          recent_topics?: string | null
          topics_updated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          industry?: string
          employee_scale?: string | null
          revenue_scale?: string | null
          listing_type?: string | null
          prefecture?: string | null
          recent_topics?: string | null
          topics_updated_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      contacts: {
        Row: {
          id: string
          company_id: string | null
          full_name: string
          department: string | null
          title: string | null
          role_level: string
          function_tag: string | null
          postal_code: string | null
          address: string | null
          info_source: string | null
          info_acquired_at: string | null
          is_verified: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          full_name: string
          department?: string | null
          title?: string | null
          role_level: string
          function_tag?: string | null
          postal_code?: string | null
          address?: string | null
          info_source?: string | null
          info_acquired_at?: string | null
          is_verified?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          full_name?: string
          department?: string | null
          title?: string | null
          role_level?: string
          function_tag?: string | null
          postal_code?: string | null
          address?: string | null
          info_source?: string | null
          info_acquired_at?: string | null
          is_verified?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      letters: {
        Row: {
          id: string
          client_id: string | null
          contact_id: string | null
          case_study_id: string | null
          why_you_angle: string
          send_trigger: string | null
          collected_context: string | null
          hypothesis: string | null
          body_text: string
          sent_at: string | null
          file_name: string | null
          contact_sequence: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id?: string | null
          contact_id?: string | null
          case_study_id?: string | null
          why_you_angle: string
          send_trigger?: string | null
          collected_context?: string | null
          hypothesis?: string | null
          body_text: string
          sent_at?: string | null
          file_name?: string | null
          contact_sequence?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string | null
          contact_id?: string | null
          case_study_id?: string | null
          why_you_angle?: string
          send_trigger?: string | null
          collected_context?: string | null
          hypothesis?: string | null
          body_text?: string
          sent_at?: string | null
          file_name?: string | null
          contact_sequence?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      reactions: {
        Row: {
          id: string
          letter_id: string | null
          reaction_type: string
          reaction_channel: string | null
          reacted_at: string
          days_to_react: number | null
          memo: string | null
          next_action: string | null
          next_action_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          letter_id?: string | null
          reaction_type: string
          reaction_channel?: string | null
          reacted_at: string
          days_to_react?: number | null
          memo?: string | null
          next_action?: string | null
          next_action_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          letter_id?: string | null
          reaction_type?: string
          reaction_channel?: string | null
          reacted_at?: string
          days_to_react?: number | null
          memo?: string | null
          next_action?: string | null
          next_action_date?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      letter_analytics: {
        Row: {
          letter_id: string
          client_name: string
          industry: string
          employee_scale: string | null
          role_level: string
          function_tag: string | null
          why_you_angle: string
          send_trigger: string | null
          case_study_company: string | null
          challenge_tags: string[] | null
          sent_at: string | null
          contact_sequence: number | null
          reaction_type: string | null
          days_to_react: number | null
          reacted_at: string | null
        }
      }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
