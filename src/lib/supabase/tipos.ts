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
      coletor_erros: {
        Row: {
          criado_em: string
          etapa: string
          id: string
          mensagem: string
          rodada_id: string
          status_http: number | null
          url: string | null
        }
        Insert: {
          criado_em?: string
          etapa: string
          id?: string
          mensagem: string
          rodada_id: string
          status_http?: number | null
          url?: string | null
        }
        Update: {
          criado_em?: string
          etapa?: string
          id?: string
          mensagem?: string
          rodada_id?: string
          status_http?: number | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coletor_erros_rodada_id_fkey"
            columns: ["rodada_id"]
            isOneToOne: false
            referencedRelation: "coletor_rodadas"
            referencedColumns: ["id"]
          },
        ]
      }
      coletor_rodadas: {
        Row: {
          alteracoes: number
          compras_atualizadas: number
          compras_descartadas: number
          compras_encontradas: number
          compras_novas: number
          compras_pendentes: number
          erros: number
          finalizado_em: string | null
          fonte: string | null
          id: string
          iniciado_em: string
          mensagem: string | null
          origem: string
          status: string
          termos_buscados: number
        }
        Insert: {
          alteracoes?: number
          compras_atualizadas?: number
          compras_descartadas?: number
          compras_encontradas?: number
          compras_novas?: number
          compras_pendentes?: number
          erros?: number
          finalizado_em?: string | null
          fonte?: string | null
          id?: string
          iniciado_em?: string
          mensagem?: string | null
          origem?: string
          status?: string
          termos_buscados?: number
        }
        Update: {
          alteracoes?: number
          compras_atualizadas?: number
          compras_descartadas?: number
          compras_encontradas?: number
          compras_novas?: number
          compras_pendentes?: number
          erros?: number
          finalizado_em?: string | null
          fonte?: string | null
          id?: string
          iniciado_em?: string
          mensagem?: string | null
          origem?: string
          status?: string
          termos_buscados?: number
        }
        Relationships: []
      }
      compra_alteracoes: {
        Row: {
          campo: string
          compra_id: string
          detectado_em: string
          id: string
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          campo: string
          compra_id: string
          detectado_em?: string
          id?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          campo?: string
          compra_id?: string
          detectado_em?: string
          id?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_alteracoes_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
        ]
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
      compra_item_segmentos: {
        Row: {
          item_id: string
          segmento_id: string
        }
        Insert: {
          item_id: string
          segmento_id: string
        }
        Update: {
          item_id?: string
          segmento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compra_item_segmentos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compra_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_item_segmentos_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
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
          area_saude: boolean | null
          atualizado_em: string
          codigo_ibge: string | null
          coletado_em: string
          controle_pncp: string
          data_abertura_proposta: string | null
          data_disputa: string | null
          data_publicacao: string | null
          exemplo: boolean
          id: string
          itens_coletados_em: string | null
          link_sistema_origem: string | null
          modalidade_id: number
          modalidade_nome: string
          modo_disputa: string | null
          municipio: string | null
          numero_compra: string | null
          objeto: string
          orgao_cnpj: string
          pncp_atualizado_em: string | null
          processo: string | null
          segmento_ids: string[]
          sequencial: number
          situacao_id: number
          srp: boolean | null
          tentativas_itens: number
          texto_edital: string | null
          uf: string
          unidade_codigo: string | null
          unidade_nome: string | null
          valor_total_estimado: number | null
          verificado_em: string | null
        }
        Insert: {
          ano: number
          area_saude?: boolean | null
          atualizado_em?: string
          codigo_ibge?: string | null
          coletado_em?: string
          controle_pncp: string
          data_abertura_proposta?: string | null
          data_disputa?: string | null
          data_publicacao?: string | null
          exemplo?: boolean
          id?: string
          itens_coletados_em?: string | null
          link_sistema_origem?: string | null
          modalidade_id: number
          modalidade_nome: string
          modo_disputa?: string | null
          municipio?: string | null
          numero_compra?: string | null
          objeto: string
          orgao_cnpj: string
          pncp_atualizado_em?: string | null
          processo?: string | null
          segmento_ids?: string[]
          sequencial: number
          situacao_id?: number
          srp?: boolean | null
          tentativas_itens?: number
          texto_edital?: string | null
          uf: string
          unidade_codigo?: string | null
          unidade_nome?: string | null
          valor_total_estimado?: number | null
          verificado_em?: string | null
        }
        Update: {
          ano?: number
          area_saude?: boolean | null
          atualizado_em?: string
          codigo_ibge?: string | null
          coletado_em?: string
          controle_pncp?: string
          data_abertura_proposta?: string | null
          data_disputa?: string | null
          data_publicacao?: string | null
          exemplo?: boolean
          id?: string
          itens_coletados_em?: string | null
          link_sistema_origem?: string | null
          modalidade_id?: number
          modalidade_nome?: string
          modo_disputa?: string | null
          municipio?: string | null
          numero_compra?: string | null
          objeto?: string
          orgao_cnpj?: string
          pncp_atualizado_em?: string | null
          processo?: string | null
          segmento_ids?: string[]
          sequencial?: number
          situacao_id?: number
          srp?: boolean | null
          tentativas_itens?: number
          texto_edital?: string | null
          uf?: string
          unidade_codigo?: string | null
          unidade_nome?: string | null
          valor_total_estimado?: number | null
          verificado_em?: string | null
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
      convites: {
        Row: {
          aceito_em: string | null
          convidado_por: string | null
          criado_em: string
          email: string
          expira_em: string
          id: string
          org_id: string
        }
        Insert: {
          aceito_em?: string | null
          convidado_por?: string | null
          criado_em?: string
          email: string
          expira_em?: string
          id?: string
          org_id: string
        }
        Update: {
          aceito_em?: string | null
          convidado_por?: string | null
          criado_em?: string
          email?: string
          expira_em?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "convites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes: {
        Row: {
          alterados: number
          arquivo_nome: string
          com_erro: number
          criado_em: string
          excluidos: number
          id: string
          incluidos: number
          modo: string
          org_id: string
          relatorio: Json
          sem_mudanca: number
          total_linhas: number
          user_id: string | null
        }
        Insert: {
          alterados?: number
          arquivo_nome: string
          com_erro?: number
          criado_em?: string
          excluidos?: number
          id?: string
          incluidos?: number
          modo: string
          org_id: string
          relatorio?: Json
          sem_mudanca?: number
          total_linhas?: number
          user_id?: string | null
        }
        Update: {
          alterados?: number
          arquivo_nome?: string
          com_erro?: number
          criado_em?: string
          excluidos?: number
          id?: string
          incluidos?: number
          modo?: string
          org_id?: string
          relatorio?: Json
          sem_mudanca?: number
          total_linhas?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      membros: {
        Row: {
          criado_em: string
          email: string
          nome: string | null
          org_id: string
          papel: Database["public"]["Enums"]["papel_membro"]
          user_id: string
        }
        Insert: {
          criado_em?: string
          email: string
          nome?: string | null
          org_id: string
          papel?: Database["public"]["Enums"]["papel_membro"]
          user_id: string
        }
        Update: {
          criado_em?: string
          email?: string
          nome?: string | null
          org_id?: string
          papel?: Database["public"]["Enums"]["papel_membro"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membros_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacao_exclusoes: {
        Row: {
          criado_em: string
          id: string
          org_id: string
          termo: string
        }
        Insert: {
          criado_em?: string
          id?: string
          org_id: string
          termo: string
        }
        Update: {
          criado_em?: string
          id?: string
          org_id?: string
          termo?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizacao_exclusoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacao_segmentos: {
        Row: {
          criado_em: string
          org_id: string
          segmento_id: string
        }
        Insert: {
          criado_em?: string
          org_id: string
          segmento_id: string
        }
        Update: {
          criado_em?: string
          org_id?: string
          segmento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizacao_segmentos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizacao_segmentos_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacoes: {
        Row: {
          atualizado_em: string
          cnpj: string
          criado_em: string
          id: string
          onboarding_concluido_em: string | null
          plano: string
          porte: Database["public"]["Enums"]["porte_empresa"]
          razao_social: string
          ufs: string[]
        }
        Insert: {
          atualizado_em?: string
          cnpj: string
          criado_em?: string
          id?: string
          onboarding_concluido_em?: string | null
          plano?: string
          porte: Database["public"]["Enums"]["porte_empresa"]
          razao_social: string
          ufs?: string[]
        }
        Update: {
          atualizado_em?: string
          cnpj?: string
          criado_em?: string
          id?: string
          onboarding_concluido_em?: string | null
          plano?: string
          porte?: Database["public"]["Enums"]["porte_empresa"]
          razao_social?: string
          ufs?: string[]
        }
        Relationships: []
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
      produto_arquivos: {
        Row: {
          caminho: string
          criado_em: string
          enviado_por: string | null
          id: string
          nome: string
          org_id: string
          produto_id: string
          tamanho: number
          tipo: string
          tipo_mime: string | null
        }
        Insert: {
          caminho: string
          criado_em?: string
          enviado_por?: string | null
          id?: string
          nome: string
          org_id: string
          produto_id: string
          tamanho: number
          tipo: string
          tipo_mime?: string | null
        }
        Update: {
          caminho?: string
          criado_em?: string
          enviado_por?: string | null
          id?: string
          nome?: string
          org_id?: string
          produto_id?: string
          tamanho?: number
          tipo?: string
          tipo_mime?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produto_arquivos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_arquivos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          atualizado_em: string
          codigo: string
          criado_em: string
          fabricante: string | null
          id: string
          lance_minimo: number
          marca: string | null
          medidas: string | null
          nome: string
          org_id: string
          palavras_chave: string[]
          preco_proposta: number
          referencia: string
          registro_anvisa: string | null
          segmento_id: string | null
        }
        Insert: {
          atualizado_em?: string
          codigo: string
          criado_em?: string
          fabricante?: string | null
          id?: string
          lance_minimo: number
          marca?: string | null
          medidas?: string | null
          nome: string
          org_id: string
          palavras_chave?: string[]
          preco_proposta: number
          referencia: string
          registro_anvisa?: string | null
          segmento_id?: string | null
        }
        Update: {
          atualizado_em?: string
          codigo?: string
          criado_em?: string
          fabricante?: string | null
          id?: string
          lance_minimo?: number
          marca?: string | null
          medidas?: string | null
          nome?: string
          org_id?: string
          palavras_chave?: string[]
          preco_proposta?: number
          referencia?: string
          registro_anvisa?: string | null
          segmento_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
            referencedColumns: ["id"]
          },
        ]
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
      aceitar_convite: { Args: { p_convite: string }; Returns: string }
      coletor_gravar_compra: {
        Args: { p_arquivos?: Json; p_compra: Json; p_itens?: Json }
        Returns: Json
      }
      criar_organizacao: {
        Args: {
          p_cnpj: string
          p_porte: Database["public"]["Enums"]["porte_empresa"]
          p_razao_social: string
        }
        Returns: string
      }
      definir_segmentos_organizacao: {
        Args: { p_org: string; p_segmentos: string[] }
        Returns: undefined
      }
      importar_produtos: {
        Args: {
          p_linhas: Json
          p_manter?: string[]
          p_modo: string
          p_org: string
        }
        Returns: Json
      }
      meus_convites: {
        Args: never
        Returns: {
          convite_id: string
          criado_em: string
          organizacao: string
        }[]
      }
    }
    Enums: {
      papel_membro: "dono" | "membro"
      porte_empresa: "me_epp" | "demais"
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
