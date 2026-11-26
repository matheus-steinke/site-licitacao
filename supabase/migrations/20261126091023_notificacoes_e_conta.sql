-- Etapa 9: preferências do e-mail diário, registro dos envios e exclusão da conta (LGPD).

-- E-mail diário: a empresa liga ou desliga e escolhe a hora (horário de Brasília); cada
-- pessoa pode deixar de receber sem desligar para os colegas.
alter table public.organizacoes
  add column email_diario boolean not null default true,
  add column email_diario_hora smallint not null default 7 check (email_diario_hora between 0 and 23);
comment on column public.organizacoes.email_diario is
  'Enviar o e-mail diário com as oportunidades novas.';
comment on column public.organizacoes.email_diario_hora is
  'Hora do envio, de 0 a 23, no horário de Brasília.';
grant update (email_diario, email_diario_hora) on table public.organizacoes to authenticated;

alter table public.membros
  add column recebe_email_diario boolean not null default true;
comment on column public.membros.recebe_email_diario is
  'Preferência da pessoa: receber ou não o e-mail diário da empresa.';

create policy "membro altera a própria preferência"
  on public.membros for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- Só esta coluna: papel, organização e e-mail continuam fora do alcance do cliente.
grant update (recebe_email_diario) on table public.membros to authenticated;

-- Um registro por empresa e por dia: evita mandar duas vezes e mostra o último envio na tela.
create table public.email_envios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  tipo text not null check (tipo in ('diario')),
  dia date not null,
  status text not null check (status in ('enviado', 'vazio', 'erro')),
  destinatarios integer not null default 0,
  oportunidades integer not null default 0,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, tipo, dia)
);
comment on table public.email_envios is
  'E-mails enviados pelo agendador. "vazio" = não havia oportunidade nova, nada foi enviado.';
comment on column public.email_envios.dia is 'Dia do envio no horário de Brasília.';

create trigger email_envios_atualizado_em
  before update on public.email_envios
  for each row execute function privado.tocar_atualizado_em();

alter table public.email_envios enable row level security;
create policy "membro lê os envios da empresa" on public.email_envios
  for select to authenticated using (privado.eh_membro(org_id));

revoke all on table public.email_envios from anon, authenticated;
grant select on table public.email_envios to authenticated;
grant all on table public.email_envios to service_role;

-- Excluir a conta de quem está logado. O responsável leva junto a empresa e tudo o que é dela
-- (catálogo, oportunidades, buscas, integrações); as outras pessoas da empresa continuam com
-- o login, sem empresa. Um membro comum só sai e tem o próprio login apagado.
-- Os arquivos do Storage são apagados pelo app antes desta chamada.
create or replace function public.excluir_conta(p_confirmacao text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_org uuid;
  v_papel public.papel_membro;
begin
  if v_usuario is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;
  if p_confirmacao is distinct from 'EXCLUIR' then
    raise exception 'Confirmação inválida.';
  end if;

  select m.org_id, m.papel into v_org, v_papel from public.membros m where m.user_id = v_usuario;
  if v_papel = 'dono' then
    delete from public.organizacoes where id = v_org;
  end if;
  delete from auth.users where id = v_usuario;
  return case when v_papel = 'dono' then 'empresa' else 'usuario' end;
end;
$$;

revoke all on function public.excluir_conta(text) from public, anon;
grant execute on function public.excluir_conta(text) to authenticated;

-- Função de gatilho que não precisa ser chamada por ninguém.
revoke all on function privado.tocar_atualizado_em() from public, anon, authenticated;
