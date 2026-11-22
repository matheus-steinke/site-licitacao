-- Etapa 3: catálogo e tabela de preços por organização.
-- Qualquer membro da organização mantém o catálogo (não só o responsável).

-- ---------------------------------------------------------------------------
-- Produtos
-- ---------------------------------------------------------------------------
create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  codigo text not null check (codigo = btrim(codigo) and char_length(codigo) between 1 and 60),
  referencia text not null check (char_length(btrim(referencia)) between 1 and 120),
  nome text not null check (char_length(btrim(nome)) between 1 and 500),
  preco_proposta numeric(14, 4) not null check (preco_proposta >= 0),
  lance_minimo numeric(14, 4) not null check (lance_minimo >= 0),
  segmento_id uuid references public.segmentos (id) on delete set null,
  palavras_chave text[] not null default '{}',
  medidas text,
  marca text,
  fabricante text,
  registro_anvisa text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, codigo)
);
comment on column public.produtos.codigo is
  'Coluna "ID" da tabela de preços do cliente. Única dentro da organização.';
comment on column public.produtos.nome is 'Coluna "PRODUTO" da tabela de preços.';
comment on column public.produtos.lance_minimo is
  'Menor preço que o cliente aceita. Base do valor estimado em disputa (Dashboard).';

create index produtos_segmento_idx on public.produtos (segmento_id);

create trigger produtos_atualizado_em
  before update on public.produtos
  for each row execute function privado.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- Arquivos por produto (o conteúdo fica no Storage, bucket "produtos")
-- ---------------------------------------------------------------------------
create table public.produto_arquivos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  produto_id uuid not null references public.produtos (id) on delete cascade,
  tipo text not null check (tipo in ('catalogo_tecnico', 'registro_anvisa', 'outro')),
  nome text not null check (char_length(nome) between 1 and 255),
  caminho text not null unique,
  tamanho bigint not null check (tamanho >= 0),
  tipo_mime text,
  enviado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  -- O caminho no Storage sempre começa por {org_id}/{produto_id}/.
  constraint produto_arquivos_caminho_da_org
    check (caminho like org_id::text || '/' || produto_id::text || '/%')
);

create index produto_arquivos_produto_idx on public.produto_arquivos (produto_id);

-- ---------------------------------------------------------------------------
-- Exclusões da empresa (termos que ela não fornece)
-- ---------------------------------------------------------------------------
create table public.organizacao_exclusoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  termo text not null check (
    termo = lower(btrim(termo)) and char_length(termo) between 2 and 120
  ),
  criado_em timestamptz not null default now(),
  unique (org_id, termo)
);
comment on table public.organizacao_exclusoes is
  'Termos que a empresa não fornece. Item de licitação com o termo não casa com o catálogo.';

-- ---------------------------------------------------------------------------
-- Histórico de importações
-- ---------------------------------------------------------------------------
create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  arquivo_nome text not null,
  modo text not null check (modo in ('atualizar', 'substituir')),
  total_linhas integer not null default 0,
  incluidos integer not null default 0,
  alterados integer not null default 0,
  sem_mudanca integer not null default 0,
  excluidos integer not null default 0,
  com_erro integer not null default 0,
  relatorio jsonb not null default '[]',
  criado_em timestamptz not null default now()
);
comment on column public.importacoes.relatorio is
  'Linhas com erro ou aviso: [{linha, codigo, erros[], avisos[]}].';

create index importacoes_org_idx on public.importacoes (org_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- RLS: tudo restrito aos membros da organização
-- ---------------------------------------------------------------------------
alter table public.produtos enable row level security;
alter table public.produto_arquivos enable row level security;
alter table public.organizacao_exclusoes enable row level security;
alter table public.importacoes enable row level security;

create policy "membro lê produtos" on public.produtos
  for select to authenticated using (privado.eh_membro(org_id));
create policy "membro inclui produtos" on public.produtos
  for insert to authenticated with check (privado.eh_membro(org_id));
create policy "membro altera produtos" on public.produtos
  for update to authenticated
  using (privado.eh_membro(org_id)) with check (privado.eh_membro(org_id));
create policy "membro exclui produtos" on public.produtos
  for delete to authenticated using (privado.eh_membro(org_id));

create policy "membro lê arquivos de produto" on public.produto_arquivos
  for select to authenticated using (privado.eh_membro(org_id));
create policy "membro inclui arquivos de produto" on public.produto_arquivos
  for insert to authenticated
  with check (
    privado.eh_membro(org_id)
    and exists (
      select 1 from public.produtos p where p.id = produto_id and p.org_id = produto_arquivos.org_id
    )
  );
create policy "membro exclui arquivos de produto" on public.produto_arquivos
  for delete to authenticated using (privado.eh_membro(org_id));

create policy "membro lê exclusões" on public.organizacao_exclusoes
  for select to authenticated using (privado.eh_membro(org_id));
create policy "membro inclui exclusões" on public.organizacao_exclusoes
  for insert to authenticated with check (privado.eh_membro(org_id));
create policy "membro remove exclusões" on public.organizacao_exclusoes
  for delete to authenticated using (privado.eh_membro(org_id));

create policy "membro lê importações" on public.importacoes
  for select to authenticated using (privado.eh_membro(org_id));
create policy "membro registra importações" on public.importacoes
  for insert to authenticated
  with check (privado.eh_membro(org_id) and user_id = (select auth.uid()));

revoke all on table
  public.produtos, public.produto_arquivos, public.organizacao_exclusoes, public.importacoes
from anon, authenticated;

grant select, insert, update, delete on table public.produtos to authenticated;
grant select, insert, delete on table public.produto_arquivos to authenticated;
grant select, insert, delete on table public.organizacao_exclusoes to authenticated;
grant select, insert on table public.importacoes to authenticated;

grant all on table
  public.produtos, public.produto_arquivos, public.organizacao_exclusoes, public.importacoes
to service_role;

-- ---------------------------------------------------------------------------
-- Importação atômica da tabela de preços
-- ---------------------------------------------------------------------------
-- Converte o JSON da planilha em linhas tipadas.
create or replace function privado.linhas_importacao(p_linhas jsonb)
returns table (
  codigo text,
  referencia text,
  nome text,
  preco_proposta numeric,
  lance_minimo numeric,
  segmento_id uuid,
  palavras_chave text[],
  medidas text,
  marca text,
  fabricante text,
  registro_anvisa text
)
language sql
immutable
set search_path = ''
as $$
  select
    l.codigo,
    l.referencia,
    l.nome,
    l.preco_proposta,
    l.lance_minimo,
    l.segmento_id,
    coalesce(l.palavras_chave, '{}'),
    nullif(btrim(l.medidas), ''),
    nullif(btrim(l.marca), ''),
    nullif(btrim(l.fabricante), ''),
    nullif(btrim(l.registro_anvisa), '')
  from jsonb_to_recordset(p_linhas) as l (
    codigo text,
    referencia text,
    nome text,
    preco_proposta numeric,
    lance_minimo numeric,
    segmento_id uuid,
    palavras_chave text[],
    medidas text,
    marca text,
    fabricante text,
    registro_anvisa text
  );
$$;
revoke all on function privado.linhas_importacao(jsonb) from public;
grant execute on function privado.linhas_importacao(jsonb) to authenticated, service_role;

-- p_linhas: [{codigo, referencia, nome, preco_proposta, lance_minimo, segmento_id,
--             palavras_chave[], medidas, marca, fabricante, registro_anvisa}]
-- p_modo:   'atualizar'  = inclui os novos e atualiza os que já existem (pelo ID);
--           'substituir' = idem, e exclui os produtos que não estão na planilha.
-- p_manter: códigos que não devem ser excluídos no modo 'substituir' (linhas da
--           planilha que vieram com erro e por isso não estão em p_linhas).
-- Roda com as permissões de quem chama: o RLS limita tudo à organização do usuário.
create or replace function public.importar_produtos(
  p_org uuid,
  p_modo text,
  p_linhas jsonb,
  p_manter text[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_incluidos integer := 0;
  v_alterados integer := 0;
  v_sem_mudanca integer := 0;
  v_excluidos integer := 0;
begin
  if not privado.eh_membro(p_org) then
    raise exception 'SEM_PERMISSAO';
  end if;
  if p_modo not in ('atualizar', 'substituir') then
    raise exception 'MODO_INVALIDO';
  end if;
  if exists (
    select 1 from privado.linhas_importacao(p_linhas) i group by i.codigo having count(*) > 1
  ) then
    raise exception 'CODIGO_REPETIDO';
  end if;

  select
    count(*) filter (where p.id is null),
    count(*) filter (where p.id is not null and (
      (p.referencia, p.nome, p.preco_proposta, p.lance_minimo, p.segmento_id,
       p.palavras_chave, p.medidas, p.marca, p.fabricante, p.registro_anvisa)
      is distinct from
      (i.referencia, i.nome, i.preco_proposta, i.lance_minimo, i.segmento_id,
       i.palavras_chave, i.medidas, i.marca, i.fabricante, i.registro_anvisa)
    )),
    count(*) filter (where p.id is not null and not (
      (p.referencia, p.nome, p.preco_proposta, p.lance_minimo, p.segmento_id,
       p.palavras_chave, p.medidas, p.marca, p.fabricante, p.registro_anvisa)
      is distinct from
      (i.referencia, i.nome, i.preco_proposta, i.lance_minimo, i.segmento_id,
       i.palavras_chave, i.medidas, i.marca, i.fabricante, i.registro_anvisa)
    ))
  into v_incluidos, v_alterados, v_sem_mudanca
  from privado.linhas_importacao(p_linhas) i
  left join public.produtos p on p.org_id = p_org and p.codigo = i.codigo;

  insert into public.produtos as p (
    org_id, codigo, referencia, nome, preco_proposta, lance_minimo, segmento_id,
    palavras_chave, medidas, marca, fabricante, registro_anvisa
  )
  select
    p_org, i.codigo, i.referencia, i.nome, i.preco_proposta, i.lance_minimo, i.segmento_id,
    i.palavras_chave, i.medidas, i.marca, i.fabricante, i.registro_anvisa
  from privado.linhas_importacao(p_linhas) i
  on conflict (org_id, codigo) do update set
    referencia = excluded.referencia,
    nome = excluded.nome,
    preco_proposta = excluded.preco_proposta,
    lance_minimo = excluded.lance_minimo,
    segmento_id = excluded.segmento_id,
    palavras_chave = excluded.palavras_chave,
    medidas = excluded.medidas,
    marca = excluded.marca,
    fabricante = excluded.fabricante,
    registro_anvisa = excluded.registro_anvisa
  where
    (p.referencia, p.nome, p.preco_proposta, p.lance_minimo, p.segmento_id,
     p.palavras_chave, p.medidas, p.marca, p.fabricante, p.registro_anvisa)
    is distinct from
    (excluded.referencia, excluded.nome, excluded.preco_proposta, excluded.lance_minimo,
     excluded.segmento_id, excluded.palavras_chave, excluded.medidas, excluded.marca,
     excluded.fabricante, excluded.registro_anvisa);

  if p_modo = 'substituir' then
    delete from public.produtos p
    where p.org_id = p_org
      and not exists (
        select 1 from privado.linhas_importacao(p_linhas) i where i.codigo = p.codigo
      )
      and not (p.codigo = any (coalesce(p_manter, '{}')));
    get diagnostics v_excluidos = row_count;
  end if;

  return jsonb_build_object(
    'incluidos', v_incluidos,
    'alterados', v_alterados,
    'sem_mudanca', v_sem_mudanca,
    'excluidos', v_excluidos
  );
end;
$$;

revoke all on function public.importar_produtos(uuid, text, jsonb, text[]) from public, anon;
grant execute on function public.importar_produtos(uuid, text, jsonb, text[])
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado "produtos", caminho {org_id}/{produto_id}/{arquivo}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'produtos', 'produtos', false, 20971520,
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do nothing;

-- true se a primeira pasta do caminho é o id de uma organização do usuário.
create or replace function privado.eh_membro_da_pasta(p_caminho text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when split_part(p_caminho, '/', 1)
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then privado.eh_membro(split_part(p_caminho, '/', 1)::uuid)
    else false
  end;
$$;
revoke all on function privado.eh_membro_da_pasta(text) from public;
grant execute on function privado.eh_membro_da_pasta(text) to authenticated, service_role;

create policy "membro lê arquivos da organização"
  on storage.objects for select to authenticated
  using (bucket_id = 'produtos' and privado.eh_membro_da_pasta(name));

create policy "membro envia arquivos da organização"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and privado.eh_membro_da_pasta(name));

create policy "membro exclui arquivos da organização"
  on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and privado.eh_membro_da_pasta(name));
