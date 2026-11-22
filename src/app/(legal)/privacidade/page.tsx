import type { Metadata } from "next";

import { AvisoProvisorio } from "@/components/aviso-provisorio";
import { NOME_APP } from "@/lib/app";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PaginaPrivacidade() {
  return (
    <>
      <h1>Política de Privacidade</h1>
      <p className="text-muted-foreground">Versão provisória de novembro de 2026.</p>
      <AvisoProvisorio />

      <p>
        Esta política explica como o {NOME_APP} trata dados pessoais, de acordo com a Lei Geral de
        Proteção de Dados (Lei nº 13.709/2018, LGPD).
      </p>

      <h2>1. Dados que coletamos</h2>
      <ul>
        <li>Cadastro: nome, e-mail e senha (guardada de forma cifrada).</li>
        <li>Empresa: razão social, CNPJ, porte, estados atendidos e segmentos de interesse.</li>
        <li>Conteúdo enviado por você: catálogo, preços, arquivos de produtos e termos de exclusão.</li>
        <li>Uso: decisões sobre oportunidades (aprovar, descartar) e registros técnicos de acesso.</li>
        <li>
          Integrações, quando você as ativa: autorização para criar eventos no Google Agenda e
          pastas no Google Drive, limitada ao que o próprio app cria.
        </li>
      </ul>

      <h2>2. Para que usamos</h2>
      <ul>
        <li>Prestar o serviço: triar licitações, mostrar oportunidades e enviar avisos por e-mail.</li>
        <li>Manter a segurança e corrigir falhas.</li>
        <li>Cumprir obrigações legais.</li>
      </ul>
      <p>Não vendemos dados pessoais nem usamos seu catálogo ou seus preços para outros clientes.</p>

      <h2>3. Com quem compartilhamos</h2>
      <p>
        Usamos fornecedores de infraestrutura que tratam dados em nosso nome: hospedagem do app,
        banco de dados e autenticação, envio de e-mails e, se você ativar, serviços do Google.
      </p>

      <h2>4. Dados públicos de licitações</h2>
      <p>
        As informações de licitações, órgãos e editais vêm do PNCP, que é uma fonte pública, e são
        compartilhadas entre todos os clientes.
      </p>

      <h2>5. Por quanto tempo guardamos</h2>
      <p>
        Mantemos os dados enquanto a conta existir. Ao excluir a conta, apagamos os dados da
        organização, salvo o que a lei exigir que seja mantido.
      </p>

      <h2>6. Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção, portabilidade e exclusão dos seus dados, além de revogar
        consentimentos. A exclusão da conta fica disponível nas Configurações.
      </p>

      <h2>7. Contato</h2>
      <p>
        O canal de contato do encarregado de dados será informado aqui antes do lançamento
        comercial.
      </p>
    </>
  );
}
