// CNPJ numérico e alfanumérico (formato novo, em vigor desde julho de 2026).
// Guardamos sempre 14 caracteres, sem pontuação e em maiúsculas.

const FORMATO = /^[A-Z0-9]{12}[0-9]{2}$/;

/** Remove pontuação e espaços e põe em maiúsculas. */
export function normalizarCnpj(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function digitoVerificador(base: string): number {
  // Pesos de 2 a 9, da direita para a esquerda. Cada caractere vale (código ASCII - 48).
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += (base.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** true se o CNPJ (com ou sem pontuação) tem formato e dígitos verificadores corretos. */
export function cnpjValido(valor: string): boolean {
  const cnpj = normalizarCnpj(valor);
  if (!FORMATO.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false;

  const primeiro = digitoVerificador(cnpj.slice(0, 12));
  const segundo = digitoVerificador(cnpj.slice(0, 12) + primeiro);
  return cnpj.endsWith(`${primeiro}${segundo}`);
}

/** Aplica a máscara 00.000.000/0000-00 enquanto a pessoa digita. */
export function mascararCnpj(valor: string): string {
  const c = normalizarCnpj(valor).slice(0, 14);
  let saida = c.slice(0, 2);
  if (c.length > 2) saida += `.${c.slice(2, 5)}`;
  if (c.length > 5) saida += `.${c.slice(5, 8)}`;
  if (c.length > 8) saida += `/${c.slice(8, 12)}`;
  if (c.length > 12) saida += `-${c.slice(12, 14)}`;
  return saida;
}
