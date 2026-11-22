// Gerado pelo Supabase (generate_typescript_types). Não editar à mão:
// gere de novo depois de cada migration.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admins_plataforma: {
        Row: {
          criado_em: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          user_id: string
        }
        Update: {
          criado_em?: string
          user_id?: string
        }
        Relationships: []
      }
      compra_arquivos: {
        Row: {
          compra_id: string
          criado_em: string
          id: string
          publicado_em: string | null
          sequencial_documento: number
          tipo_documento: string | null
          titulo: string | null
          url: string
        }
        Insert: {
          compra_id: string
          criado_em?: string
          id?: string
          publicado_em?: string | null
          sequencial_documento: number
          tipo_documento?: string | null
          titulo?: string | null
          url: string
        }
        Update: {
          compra_id?: string
          criado_em?: string
          id?: string
          publicado_em?: string | null
          sequencial_documento?: number
          tipo_documento?: string | null
          titulo?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "compra_arquivos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_itens: {
        Row: {
          atualizado_em: string
          compra_id: string
          criado_em: string
          descricao: string
          exclusivo_me_epp: boolean
          grupo: string | null
          id: string
          numero_item: number
          quantidade: number | null
          situacao_item: string | null
          tipo_beneficio_id: number | null
          unidade: string | null
          valor_total: number | null
          valor_unitario_estimado: number | null
        }
        Insert: {
          atualizado_em?: string
          compra_id: string
          criado_em?: string
          descricao: string
          exclusivo_me_epp?: boolean
          grupo?: string | null
          id?: string
          numero_item: number
          quantidade?: number | null
          situacao_item?: string | null
          tipo_beneficio_id?: number | null
          unidade?: string | null
          valor_total?: number | null
          valor_unitario_estimado?: number | null
        }
        Update: {
          atualizado_em?: string
          compra_id?: string
          criado_em?: string
          descricao?: string
          exclusivo_me_epp?: boolean
          grupo?: string | null
          id?: string
          numero_item?: number
          quantidade?: number | null
          situacao_item?: string | null
          tipo_beneficio_id?: number | null
          unidade?: string | null
          valor_total?: number | null
          valor_unitario_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_itens_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          ano: number
          atualizado_em: string
          codigo_ibge: string | null
          coletado_em: string
          controle_pncp: string
          data_abertura_proposta: string | null
          data_disputa: string | null
          data_publicacao: string | null
          exemplo: boolean
          id: string
          link_sistema_origem: string | null
          modalidade_id: number
          modalidade_nome: string
          modo_disputa: string | null
          municipio: string | null
          numero_compra: string | null
          objeto: string
          orgao_cnpj: string
          processo: string | null
          sequencial: number
          situacao_id: number
          srp: boolean | null
          texto_edital: string | null
          uf: string
          unidade_codigo: string | null
          unidade_nome: string | null
          valor_total_estimado: number | null
        }
        Insert: {
          ano: number
          atualizado_em?: string
          codigo_ibge?: string | null
          coletado_em?: string
          controle_pncp: string
          data_abertura_proposta?: string | null
          data_disputa?: string | null
          data_publicacao?: string | null
          exemplo?: boolean
          id?: string
          link_sistema_origem?: string | null
          modalidade_id: number
          modalidade_nome: string
          modo_disputa?: string | null
          municipio?: string | null
          numero_compra?: string | null
          objeto: string
          orgao_cnpj: string
          processo?: string | null
          sequencial: number
          situacao_id?: number
          srp?: boolean | null
          texto_edital?: string | null
          uf: string
          unidade_codigo?: string | null
          unidade_nome?: string | null
          valor_total_estimado?: number | null
        }
        Update: {
          ano?: number
          atualizado_em?: string
          codigo_ibge?: string | null
          coletado_em?: string
          controle_pncp?: string
          data_abertura_proposta?: string | null
          data_disputa?: string | null
          data_publicacao?: string | null
          exemplo?: boolean
          id?: string
          link_sistema_origem?: string | null
          modalidade_id?: number
          modalidade_nome?: string
          modo_disputa?: string | null
          municipio?: string | null
          numero_compra?: string | null
          objeto?: string
          orgao_cnpj?: string
          processo?: string | null
          sequencial?: number
          situacao_id?: number
          srp?: boolean | null
          texto_edital?: string | null
          uf?: string
          unidade_codigo?: string | null
          unidade_nome?: string | null
          valor_total_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_orgao_cnpj_fkey"
            columns: ["orgao_cnpj"]
            isOneToOne: false
            referencedRelation: "orgaos"
            referencedColumns: ["cnpj"]
          },
        ]
      }
      orgaos: {
        Row: {
          atualizado_em: string
          cnpj: string
          criado_em: string
          esfera: string | null
          poder: string | null
          razao_social: string
        }
        Insert: {
          atualizado_em?: string
          cnpj: string
          criado_em?: string
          esfera?: string | null
          poder?: string | null
          razao_social: string
        }
        Update: {
          atualizado_em?: string
          cnpj?: string
          criado_em?: string
          esfera?: string | null
          poder?: string | null
          razao_social?: string
        }
        Relationships: []
      }
      segmentos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          exclusoes: string[]
          id: string
          nome: string
          ordem: number
          palavras_chave: string[]
          sinonimos: string[]
          slug: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          exclusoes?: string[]
          id?: string
          nome: string
          ordem?: number
          palavras_chave?: string[]
          sinonimos?: string[]
          slug: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          exclusoes?: string[]
          id?: string
          nome?: string
          ordem?: number
          palavras_chave?: string[]
          sinonimos?: string[]
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
