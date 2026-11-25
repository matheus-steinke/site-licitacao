-- Integrações da organização com serviços externos. O Google (Agenda e Drive) é o primeiro
-- provedor; Microsoft, WhatsApp e webhook já cabem na mesma estrutura, sem implementação.
--
-- As credenciais (token de atualização do OAuth) são cifradas pelo app (AES-256-GCM) antes de
-- chegar ao banco: quem lê a linha vê só o texto cifrado, inútil sem a chave do servidor.

create table public.integracoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  provedor text not null check (provedor in ('google', 'microsoft', 'whatsapp', 'webhook')),
  conta text,
  credenciais text not null,
  escopos text[] not null default '{}',
  agenda_ativa boolean not null default true,
  agenda_id text not null default 'primary' check (char_length(agenda_id) between 1 and 250),
  drive_ativo boolean not null default true,
  pasta_raiz_nome text not null default 'Licitações' check (char_length(btrim(pasta_raiz_nome)) between 1 and 100),
  pasta_raiz_id text,
  automatico boolean not null default true,
  erro text,
  conectado_por uuid references auth.users (id) on delete set null,
  conectado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, provedor)
);
comment on table public.integracoes is
  'Conta externa conectada pela organização (uma por provedor), com as preferências de uso.';
comment on column public.integracoes.credenciais is
  'Token de atualização do OAuth, cifrado pelo app. Nunca em texto puro.';
comment on column public.integracoes.agenda_id is
  'Agenda em que os eventos são criados. "primary" = agenda principal da conta.';
comment on column public.integracoes.pasta_raiz_id is
  'Pasta criada pelo app no Drive, dentro da qual ficam as pastas por mês.';
comment on column public.integracoes.automatico is
  'Criar o evento e as pastas ao aprovar a oportunidade (senão, só pelo botão).';
comment on column public.integracoes.erro is
  'Última falha de acesso à conta (por exemplo, acesso revogado). Vazio quando está tudo certo.';

create trigger integracoes_atualizado_em
  before update on public.integracoes
  for each row execute function privado.tocar_atualizado_em();

-- O que já foi criado no provedor para cada oportunidade: serve para não duplicar e para
-- atualizar (evento) quando a data da disputa muda.
create table public.integracao_vinculos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  oportunidade_id uuid not null,
  provedor text not null check (provedor in ('google', 'microsoft', 'whatsapp', 'webhook')),
  tipo text not null check (tipo in ('evento', 'pasta')),
  id_externo text,
  link text,
  dados jsonb not null default '{}'::jsonb,
  situacao text not null default 'pendente' check (situacao in ('ok', 'pendente', 'erro')),
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (oportunidade_id, provedor, tipo),
  foreign key (oportunidade_id, org_id) references public.oportunidades (id, org_id) on delete cascade
);
comment on table public.integracao_vinculos is
  'Evento de agenda ou pasta criados no provedor para uma oportunidade.';
comment on column public.integracao_vinculos.id_externo is 'ID do evento ou da pasta no provedor.';
comment on column public.integracao_vinculos.dados is
  'Evento: a data da disputa usada. Pasta: subpastas criadas e arquivos do edital já enviados.';

create index integracao_vinculos_org_idx on public.integracao_vinculos (org_id);

create trigger integracao_vinculos_atualizado_em
  before update on public.integracao_vinculos
  for each row execute function privado.tocar_atualizado_em();

alter table public.integracoes enable row level security;
alter table public.integracao_vinculos enable row level security;

-- Integração: todo membro lê (o app precisa das credenciais cifradas para agir em nome da
-- organização quando qualquer membro aprova). Conectar, configurar e desconectar passam pelas
-- funções abaixo, só para o dono. Direto na tabela, o membro só registra o estado do uso.
create policy "membro lê integrações" on public.integracoes
  for select to authenticated using (privado.eh_membro(org_id));
create policy "membro registra o estado da integração" on public.integracoes
  for update to authenticated using (privado.eh_membro(org_id)) with check (privado.eh_membro(org_id));

revoke all on table public.integracoes from anon, authenticated;
grant select on table public.integracoes to authenticated;
grant update (pasta_raiz_id, erro) on table public.integracoes to authenticated;
grant all on table public.integracoes to service_role;

-- Vínculos: o app grava em nome do membro que aprovou ou pediu a sincronização.
create policy "membro lê vínculos" on public.integracao_vinculos
  for select to authenticated using (privado.eh_membro(org_id));
create policy "membro cria vínculos" on public.integracao_vinculos
  for insert to authenticated with check (privado.eh_membro(org_id));
create policy "membro atualiza vínculos" on public.integracao_vinculos
  for update to authenticated using (privado.eh_membro(org_id)) with check (privado.eh_membro(org_id));
create policy "membro remove vínculos" on public.integracao_vinculos
  for delete to authenticated using (privado.eh_membro(org_id));

revoke all on table public.integracao_vinculos from anon, authenticated;
grant select, insert, update, delete on table public.integracao_vinculos to authenticated;
grant all on table public.integracao_vinculos to service_role;

-- Conectar (ou reconectar) a conta. Trocar de conta esquece a pasta-raiz, que fica na outra.
create or replace function public.integracao_conectar(
  p_org uuid,
  p_provedor text,
  p_conta text,
  p_credenciais text,
  p_escopos text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not privado.eh_dono(p_org) then
    raise exception 'Só o dono da empresa conecta integrações.' using errcode = '42501';
  end if;
  if p_credenciais is null or char_length(p_credenciais) < 20 then
    raise exception 'Credenciais inválidas.';
  end if;

  insert into public.integracoes (org_id, provedor, conta, credenciais, escopos, conectado_por)
  values (p_org, p_provedor, nullif(btrim(p_conta), ''), p_credenciais, coalesce(p_escopos, '{}'), (select auth.uid()))
  on conflict (org_id, provedor) do update
    set pasta_raiz_id = case
          when public.integracoes.conta is not distinct from excluded.conta then public.integracoes.pasta_raiz_id
        end,
        conta = excluded.conta,
        credenciais = excluded.credenciais,
        escopos = excluded.escopos,
        erro = null,
        conectado_por = excluded.conectado_por,
        conectado_em = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Preferências de uso.
create or replace function public.integracao_configurar(
  p_org uuid,
  p_provedor text,
  p_agenda_ativa boolean,
  p_agenda_id text,
  p_drive_ativo boolean,
  p_pasta_raiz_nome text,
  p_automatico boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.eh_dono(p_org) then
    raise exception 'Só o dono da empresa configura integrações.' using errcode = '42501';
  end if;

  update public.integracoes
  set agenda_ativa = coalesce(p_agenda_ativa, agenda_ativa),
      agenda_id = coalesce(nullif(btrim(p_agenda_id), ''), 'primary'),
      drive_ativo = coalesce(p_drive_ativo, drive_ativo),
      pasta_raiz_nome = coalesce(nullif(btrim(p_pasta_raiz_nome), ''), pasta_raiz_nome),
      automatico = coalesce(p_automatico, automatico)
  where org_id = p_org and provedor = p_provedor;
  if not found then
    raise exception 'Integração não encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

-- Desconectar apaga as credenciais. Os vínculos ficam: os eventos e as pastas continuam no
-- provedor, e os links seguem válidos para quem tem acesso à conta.
create or replace function public.integracao_desconectar(p_org uuid, p_provedor text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.eh_dono(p_org) then
    raise exception 'Só o dono da empresa desconecta integrações.' using errcode = '42501';
  end if;
  delete from public.integracoes where org_id = p_org and provedor = p_provedor;
  return found;
end;
$$;

revoke all on function public.integracao_conectar(uuid, text, text, text, text[]) from public, anon;
revoke all on function public.integracao_configurar(uuid, text, boolean, text, boolean, text, boolean) from public, anon;
revoke all on function public.integracao_desconectar(uuid, text) from public, anon;
grant execute on function public.integracao_conectar(uuid, text, text, text, text[]) to authenticated;
grant execute on function public.integracao_configurar(uuid, text, boolean, text, boolean, text, boolean) to authenticated;
grant execute on function public.integracao_desconectar(uuid, text) to authenticated;
