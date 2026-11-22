import type { Metadata } from "next";

import { AvisoProvisorio } from "@/components/aviso-provisorio";
import { NOME_APP } from "@/lib/app";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function PaginaTermos() {
  return (
    <>
      <h1>Termos de Uso</h1>
      <p className="text-muted-foreground">Versão provisória de novembro de 2026.</p>
      <AvisoProvisorio />

      <h2>1. O que é o serviço</h2>
      <p>
        O {NOME_APP} reúne licitações públicas da área da saúde divulgadas no Portal Nacional de
        Contratações Públicas (PNCP) e as compara com o catálogo de produtos cadastrado pela sua
        empresa, por meio de regras, palavras-chave, medidas e semelhança de texto.
      </p>

      <h2>2. Conta e acesso</h2>
      <ul>
        <li>Você é responsável por manter sua senha em sigilo e pelos acessos feitos com ela.</li>
        <li>As informações de cadastro da empresa devem ser verdadeiras e atualizadas.</li>
        <li>Cada organização enxerga apenas os próprios dados (catálogo, preços e decisões).</li>
      </ul>

      <h2>3. Limites do serviço</h2>
      <ul>
        <li>
          Os dados das licitações vêm de fontes públicas e podem conter atrasos, erros ou
          alterações posteriores (adiamento, suspensão, revogação). Confira sempre o edital
          oficial antes de decidir.
        </li>
        <li>
          A triagem é automática e pode sugerir produtos que não atendem ao edital ou deixar de
          apontar oportunidades. Ela apoia a análise, mas não a substitui.
        </li>
        <li>O serviço não envia propostas nem lances em nome da sua empresa.</li>
      </ul>

      <h2>4. Seus dados</h2>
      <p>
        O catálogo, os preços e os arquivos que você envia continuam sendo da sua empresa. Usamos
        esses dados somente para prestar o serviço, conforme a Política de Privacidade.
      </p>

      <h2>5. Uso aceitável</h2>
      <p>
        Não é permitido tentar acessar dados de outras organizações, sobrecarregar o sistema ou
        revender o acesso sem autorização.
      </p>

      <h2>6. Encerramento</h2>
      <p>
        Você pode excluir a conta a qualquer momento nas Configurações. Podemos suspender contas
        que descumpram estes termos.
      </p>

      <h2>7. Alterações</h2>
      <p>
        Estes termos podem mudar. Avisaremos por e-mail ou dentro do app quando houver mudança
        relevante.
      </p>
    </>
  );
}
