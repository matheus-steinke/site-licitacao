// Colunas da tabela de preços e como reconhecê-las no cabeçalho da planilha.

export type ChaveColuna =
  | "codigo"
  | "referencia"
  | "nome"
  | "preco_proposta"
  | "lance_minimo"
  | "segmento"
  | "palavras_chave"
  | "medidas"
  | "marca"
  | "fabricante"
  | "registro_anvisa";

export type Coluna = {
  chave: ChaveColuna;
  /** Título usado no modelo para download e nas mensagens. */
  titulo: string;
  obrigatoria: boolean;
  /** Outros nomes aceitos no cabeçalho (comparados sem acento e sem pontuação). */
  apelidos: string[];
  /** Largura no modelo Excel, em caracteres. */
  largura: number;
};

export const COLUNAS: Coluna[] = [
  { chave: "codigo", titulo: "ID", obrigatoria: true, apelidos: ["id", "codigo", "cod", "item"], largura: 10 },
  {
    chave: "referencia",
    titulo: "REFERÊNCIA",
    obrigatoria: true,
    apelidos: ["referencia", "ref", "sku", "modelo", "codigo do produto", "cod produto"],
    largura: 18,
  },
  {
    chave: "nome",
    titulo: "PRODUTO",
    obrigatoria: true,
    apelidos: ["produto", "descricao", "nome", "descricao do produto", "nome do produto"],
    largura: 50,
  },
  {
    chave: "preco_proposta",
    titulo: "PREÇO PROPOSTA",
    obrigatoria: true,
    apelidos: ["preco proposta", "preco", "preco de proposta", "valor proposta", "preco inicial"],
    largura: 18,
  },
  {
    chave: "lance_minimo",
    titulo: "LANCE MÍNIMO",
    obrigatoria: true,
    apelidos: ["lance minimo", "minimo", "preco minimo", "valor minimo", "lance min"],
    largura: 16,
  },
  { chave: "segmento", titulo: "SEGMENTO", obrigatoria: false, apelidos: ["segmento", "area", "especialidade"], largura: 24 },
  {
    chave: "palavras_chave",
    titulo: "PALAVRAS-CHAVE",
    obrigatoria: false,
    apelidos: ["palavras chave", "palavras chave sinonimos", "sinonimos", "palavras"],
    largura: 36,
  },
  { chave: "medidas", titulo: "MEDIDAS", obrigatoria: false, apelidos: ["medidas", "medida", "dimensoes", "tamanho"], largura: 18 },
  { chave: "marca", titulo: "MARCA", obrigatoria: false, apelidos: ["marca"], largura: 16 },
  { chave: "fabricante", titulo: "FABRICANTE", obrigatoria: false, apelidos: ["fabricante"], largura: 20 },
  {
    chave: "registro_anvisa",
    titulo: "REGISTRO ANVISA",
    obrigatoria: false,
    apelidos: ["registro anvisa", "anvisa", "registro", "registro ms", "reg anvisa"],
    largura: 18,
  },
];

export const LIMITE_LINHAS = 5000;

/** Linhas de exemplo do modelo (fictícias). */
export const EXEMPLOS_MODELO: (string | number)[][] = [
  ["001", "DJ-0626", "Cateter duplo J 6Fr x 26 cm, poliuretano, com fio guia", 150.0, 98.5, "Urologia/Endourologia", "duplo j; pigtail", "6Fr x 26 cm", "Marca Exemplo", "Fabricante Exemplo", "80000000001"],
  ["002", "FG-035150", "Fio guia hidrofílico 0,035\" x 150 cm, ponta reta", 180.0, 120.0, "Urologia/Endourologia", "fio guia hidrofilico", "0,035\" x 150 cm", "Marca Exemplo", "Fabricante Exemplo", "80000000002"],
];
