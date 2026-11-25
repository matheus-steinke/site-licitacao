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
      buscas_salvas: {
        Row: {
          criado_em: string
          criado_por: string | null
          filtros: Json
          id: string
          nome: string
          org_id: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          filtros: Json
          id?: string
          nome: string
          org_id: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          filtros?: Json
          id?: string
          nome?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buscas_salvas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
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
          classificacao_versao: string | null
          atualizado_em: string
          codigo_ibge: string | null
          coletado_em: string
          conteudo_alterado_em: string
          controle_pncp: string
          data_abertura_proposta: string | null
          data_disputa: string | null
          data_publicacao: string | null
          exemplo: boolean
          id: string
          itens_coletados_em: string | null
          itens_removidos_em: string | null
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
          classificacao_versao?: string | null
          atualizado_em?: string
          codigo_ibge?: string | null
          coletado_em?: string
          conteudo_alterado_em?: string
          controle_pncp: string
          data_abertura_proposta?: string | null
          data_disputa?: string | null
          data_publicacao?: string | null
          exemplo?: boolean
          id?: string
          itens_coletados_em?: string | null
          itens_removidos_em?: string | null
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
          classificacao_versao?: string | null
          atualizado_em?: string
          codigo_ibge?: string | null
          coletado_em?: string
          conteudo_alterado_em?: string
          controle_pncp?: string
          data_abertura_proposta?: string | null
          data_disputa?: string | null
          data_publicacao?: string | null
          exemplo?: boolean
          id?: string
          itens_coletados_em?: string | null
          itens_removidos_em?: string | null
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
      integracao_vinculos: {
        Row: {
          atualizado_em: string
          criado_em: string
          dados: Json
          erro: string | null
          id: string
          id_externo: string | null
          link: string | null
          oportunidade_id: string
          org_id: string
          provedor: string
          situacao: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          dados?: Json
          erro?: string | null
          id?: string
          id_externo?: string | null
          link?: string | null
          oportunidade_id: string
          org_id: string
          provedor: string
          situacao?: string
          tipo: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          dados?: Json
          erro?: string | null
          id?: string
          id_externo?: string | null
          link?: string | null
          oportunidade_id?: string
          org_id?: string
          provedor?: string
          situacao?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracao_vinculos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integracao_vinculos_oportunidade_id_org_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      integracoes: {
        Row: {
          agenda_ativa: boolean
          agenda_id: string
          atualizado_em: string
          automatico: boolean
          conectado_em: string
          conectado_por: string | null
          conta: string | null
          credenciais: string
          drive_ativo: boolean
          erro: string | null
          escopos: string[]
          id: string
          org_id: string
          pasta_raiz_id: string | null
          pasta_raiz_nome: string
          provedor: string
        }
        Insert: {
          agenda_ativa?: boolean
          agenda_id?: string
          atualizado_em?: string
          automatico?: boolean
          conectado_em?: string
          conectado_por?: string | null
          conta?: string | null
          credenciais: string
          drive_ativo?: boolean
          erro?: string | null
          escopos?: string[]
          id?: string
          org_id: string
          pasta_raiz_id?: string | null
          pasta_raiz_nome?: string
          provedor: string
        }
        Update: {
          agenda_ativa?: boolean
          agenda_id?: string
          atualizado_em?: string
          automatico?: boolean
          conectado_em?: string
          conectado_por?: string | null
          conta?: string | null
          credenciais?: string
          drive_ativo?: boolean
          erro?: string | null
          escopos?: string[]
          id?: string
          org_id?: string
          pasta_raiz_id?: string | null
          pasta_raiz_nome?: string
          provedor?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracoes_org_id_fkey"
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
      oportunidade_itens: {
        Row: {
          alertas: string[]
          detalhe: Json
          item_id: string
          lote: string | null
          nivel: string
          oportunidade_id: string
          org_id: string
          produto_id: string
          score: number
        }
        Insert: {
          alertas?: string[]
          detalhe?: Json
          item_id: string
          lote?: string | null
          nivel: string
          oportunidade_id: string
          org_id: string
          produto_id: string
          score: number
        }
        Update: {
          alertas?: string[]
          detalhe?: Json
          item_id?: string
          lote?: string | null
          nivel?: string
          oportunidade_id?: string
          org_id?: string
          produto_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "oportunidade_itens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "compra_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_itens_oportunidade_id_org_id_fkey"
            columns: ["oportunidade_id", "org_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "oportunidade_itens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_itens_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      oportunidades: {
        Row: {
          alertas: Json
          atualizado_em: string
          compra_id: string
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          id: string
          itens_a_verificar: number
          itens_compativeis: number
          itens_do_segmento: number
          itens_por_segmento: Json
          motivo_descarte: string | null
          org_id: string
          prioridade: number
          score: number
          segmento_ids: string[]
          status: Database["public"]["Enums"]["status_oportunidade"]
          triada_em: string
          valor_estimado: number
        }
        Insert: {
          alertas?: Json
          atualizado_em?: string
          compra_id: string
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          id?: string
          itens_a_verificar?: number
          itens_compativeis?: number
          itens_do_segmento?: number
          itens_por_segmento?: Json
          motivo_descarte?: string | null
          org_id: string
          prioridade: number
          score?: number
          segmento_ids?: string[]
          status?: Database["public"]["Enums"]["status_oportunidade"]
          triada_em?: string
          valor_estimado?: number
        }
        Update: {
          alertas?: Json
          atualizado_em?: string
          compra_id?: string
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          id?: string
          itens_a_verificar?: number
          itens_compativeis?: number
          itens_do_segmento?: number
          itens_por_segmento?: Json
          motivo_descarte?: string | null
          org_id?: string
          prioridade?: number
          score?: number
          segmento_ids?: string[]
          status?: Database["public"]["Enums"]["status_oportunidade"]
          triada_em?: string
          valor_estimado?: number
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_org_id_fkey"
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
          score_compativel: number
          score_verificar: number
          triada_em: string | null
          triagem_config_em: string
          triagem_feita_config_em: string | null
          triagem_marca: string | null
          triagem_motor: number | null
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
          score_compativel?: number
          score_verificar?: number
          triada_em?: string | null
          triagem_config_em?: string
          triagem_feita_config_em?: string | null
          triagem_marca?: string | null
          triagem_motor?: number | null
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
          score_compativel?: number
          score_verificar?: number
          triada_em?: string | null
          triagem_config_em?: string
          triagem_feita_config_em?: string | null
          triagem_marca?: string | null
          triagem_motor?: number | null
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
          busca: string | null
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
          busca?: never
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
          busca?: never
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
      oportunidades_aprovadas: {
        Row: {
          compra_id: string | null
          data_disputa: string | null
          decidido_em: string | null
          exemplo: boolean | null
          id: string | null
          itens_a_verificar: number | null
          itens_compativeis: number | null
          modalidade_nome: string | null
          municipio: string | null
          numero_compra: string | null
          objeto: string | null
          org_id: string | null
          orgao_nome: string | null
          situacao_id: number | null
          status: Database["public"]["Enums"]["status_oportunidade"] | null
          uf: string | null
          valor_lance_minimo: number | null
        }
        Relationships: []
      }
      oportunidades_lista: {
        Row: {
          alertas: Json | null
          ano: number | null
          compra_id: string | null
          controle_pncp: string | null
          criado_em: string | null
          data_disputa: string | null
          decidido_em: string | null
          exemplo: boolean | null
          id: string | null
          itens_a_verificar: number | null
          itens_compativeis: number | null
          itens_do_segmento: number | null
          itens_por_segmento: Json | null
          modalidade_nome: string | null
          motivo_descarte: string | null
          municipio: string | null
          numero_compra: string | null
          objeto: string | null
          org_id: string | null
          orgao_cnpj: string | null
          orgao_nome: string | null
          prioridade: number | null
          score: number | null
          segmento_ids: string[] | null
          sequencial: number | null
          situacao_id: number | null
          status: Database["public"]["Enums"]["status_oportunidade"] | null
          total_itens: number | null
          triada_em: string | null
          uf: string | null
          valor_estimado: number | null
          valor_total_estimado: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      aceitar_convite: { Args: { p_convite: string }; Returns: string }
      buscar_licitacoes: {
        Args: {
          p_ate?: string
          p_de?: string
          p_deslocamento?: number
          p_limite?: number
          p_modalidades?: number[]
          p_org: string
          p_segmentos?: string[]
          p_situacoes?: number[]
          p_so_catalogo?: boolean
          p_termo?: string
          p_ufs?: string[]
        }
        Returns: Json
      }
      coletor_gravar_compra: {
        Args: { p_arquivos?: Json; p_compra: Json; p_itens?: Json }
        Returns: Json
      }
      coletor_marcar_excluida: { Args: { p_controle: string }; Returns: boolean }
      coletor_remover_itens_antigos: {
        Args: { p_dias?: number; p_limite?: number }
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
      decidir_oportunidade: {
        Args: {
          p_motivo?: string
          p_oportunidade: string
          p_status: Database["public"]["Enums"]["status_oportunidade"]
        }
        Returns: Database["public"]["Enums"]["status_oportunidade"]
      }
      integracao_conectar: {
        Args: { p_conta: string; p_credenciais: string; p_escopos: string[]; p_org: string; p_provedor: string }
        Returns: string
      }
      integracao_configurar: {
        Args: {
          p_agenda_ativa: boolean
          p_agenda_id: string
          p_automatico: boolean
          p_drive_ativo: boolean
          p_org: string
          p_pasta_raiz_nome: string
          p_provedor: string
        }
        Returns: undefined
      }
      integracao_desconectar: { Args: { p_org: string; p_provedor: string }; Returns: boolean }
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
      triagem_gravar: {
        Args: {
          p_config_em: string
          p_marca_ate: string
          p_org: string
          p_resultados: Json
        }
        Returns: Json
      }
      triagem_lote: {
        Args: {
          p_max_compras?: number
          p_max_itens?: number
          p_motor: number
          p_org: string
        }
        Returns: Json
      }
      triagem_situacao: {
        Args: { p_motor: number; p_org: string }
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
      status_oportunidade: "nova" | "aprovada" | "descartada" | "ganha" | "perdida"
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
