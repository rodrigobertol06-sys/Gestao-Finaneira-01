// 001 - Formata um valor numérico para moeda brasileira (R$)
export function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// 002 - Converte uma data "AAAA-MM-DD" (a que vem dos <input type="date">) para um Date à meia-noite
// no fuso horário LOCAL. Usar "new Date('AAAA-MM-DD')" direto interpreta a data como UTC e pode
// exibir o dia anterior em fusos negativos (ex: Brasil) — esse helper evita esse problema.
function paraDataLocal(data) {
  if (typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const [ano, mes, dia] = data.split("-").map(Number);
    return new Date(ano, mes - 1, dia);
  }
  return data instanceof Date ? data : new Date(data);
}

// 003 - Formata uma data (Date ou string "AAAA-MM-DD") para o padrão dd/mm/aaaa
export function formatarData(data) {
  return paraDataLocal(data).toLocaleDateString("pt-BR");
}

// 004 - Calcula o status de uma conta (pago/pendente/atrasado) com base na data de vencimento.
// Nunca deve ser salvo como campo fixo no banco — é sempre recalculado na leitura.
export function calcularStatusConta(conta) {
  if (conta.pago) return "pago";

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const vencimento = paraDataLocal(conta.vencimento);
  vencimento.setHours(0, 0, 0, 0);

  return vencimento < hoje ? "atrasado" : "pendente";
}

// 005 - Reordena uma lista de membros para que o usuário logado apareça sempre primeiro
// (usado nos seletores de "Membro" em Entradas, Saídas, Contas e Lista de Mercado).
export function comUsuarioPrimeiro(membros, uid) {
  return [...membros].sort((a, b) => {
    if (a.uid === uid) return -1;
    if (b.uid === uid) return 1;
    return 0;
  });
}

// 006 - Aplica uma máscara de moeda brasileira (milhar com ponto, decimal com vírgula) enquanto
// o usuário digita em um <input type="text">. Trata os dígitos digitados como centavos
// (ex: digitar "100075" vira "1.000,75"), formato comum em campos de valor monetário.
export function aplicarMascaraMoeda(input) {
  input.addEventListener("input", () => {
    const digitos = input.value.replace(/\D/g, "");
    if (!digitos) {
      input.value = "";
      return;
    }
    const valor = Number(digitos) / 100;
    input.value = valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
}

// 007 - Converte o texto de um campo com máscara de moeda (ex: "1.000,75") de volta para número (1000.75)
export function valorMoedaParaNumero(textoFormatado) {
  if (!textoFormatado) return 0;
  const limpo = String(textoFormatado).replace(/\./g, "").replace(",", ".");
  return Number(limpo) || 0;
}

// 008 - Formata um número (ex: 1000.75) para o texto exibido no campo com máscara (ex: "1.000,75")
export function numeroParaValorMoeda(numero) {
  return Number(numero || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 009 - Liga um atalho nos campos de data: apertar Enter com o campo ainda vazio abre o calendário
// nativo do navegador, em vez de deixar o Enter submeter o formulário sem preencher nada.
export function habilitarAtalhoCalendario(input) {
  input.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" && !input.value) {
      evento.preventDefault();
      if (typeof input.showPicker === "function") input.showPicker();
    }
  });
}

// 010 - Formata "AAAA-MM" para um rótulo tipo "Agosto de 2026".
// Usado pela navegação por mês em Entradas, Saídas, Contas a Pagar e Dashboard.
export function formatarRotuloMes(mesString) {
  const [ano, mes] = mesString.split("-").map(Number);
  const rotulo = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}

// 011 - Gera o bloco de HTML do navegador de mês (setas + rótulo), reutilizado em vários módulos
export function htmlNavegadorMes() {
  return `
    <div class="flex items-center justify-between mb-3">
      <button id="botao-mes-anterior" class="p-1.5 text-primary dark:text-white hover:text-primary-light" aria-label="Mês anterior">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
      </button>
      <span id="rotulo-mes" class="text-sm font-semibold text-primary dark:text-white"></span>
      <button id="botao-mes-seguinte" class="p-1.5 text-primary dark:text-white hover:text-primary-light" aria-label="Próximo mês">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  `;
}

// 013 - Soma "meses" a uma data "AAAA-MM-DD" e devolve outra data no mesmo formato.
// Usado para gerar o vencimento/data de cada parcela de um lançamento parcelado ou recorrente.
export function somarMeses(dataString, meses) {
  const [ano, mes, dia] = dataString.split("-").map(Number);
  const data = new Date(ano, mes - 1 + meses, dia);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

// 014 - Gera um identificador único para agrupar as parcelas de um mesmo financiamento/recorrência
export function gerarIdGrupo() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `grupo-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// 012 - Liga os botões do navegador de mês gerado por htmlNavegadorMes().
// Recebe o mês inicial e um callback chamado com o novo mês a cada troca. Retorna o mês atual (mutável via closure).
export function iniciarNavegadorMes(mesInicial, aoMudar) {
  const rotulo = document.getElementById("rotulo-mes");
  const botaoAnterior = document.getElementById("botao-mes-anterior");
  const botaoSeguinte = document.getElementById("botao-mes-seguinte");

  let mesAtual = mesInicial;
  rotulo.textContent = formatarRotuloMes(mesAtual);

  function mudar(delta) {
    const [ano, mes] = mesAtual.split("-").map(Number);
    const data = new Date(ano, mes - 1 + delta, 1);
    mesAtual = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    rotulo.textContent = formatarRotuloMes(mesAtual);
    aoMudar(mesAtual);
  }

  botaoAnterior.addEventListener("click", () => mudar(-1));
  botaoSeguinte.addEventListener("click", () => mudar(1));
}
