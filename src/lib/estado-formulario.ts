/** Resultado de uma ação de formulário (useActionState). */
export type EstadoFormulario = {
  erro?: string;
  mensagem?: string;
  /** Valores a devolver ao formulário quando há erro. */
  valores?: Record<string, string>;
};
