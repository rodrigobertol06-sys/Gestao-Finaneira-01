// 001 - Importa funções do Firestore via CDN, a instância compartilhada (db) e utilitários do projeto
import {
  collection,
  query,
  where,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../../core/firebase.js";
import { formatarMoeda, formatarRotuloMes } from "../../core/utils.js";

// 003 - Uma conta está atrasada quando o vencimento já passou (relativo a hoje, sempre — não ao mês navegado)
function contaAtrasada(conta) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [ano, mes, dia] = conta.vencimento.split("-").map(Number);
  return new Date(ano, mes - 1, dia) < hoje;
}

// 004 - Monta o Dashboard: navegação por mês, saldo, entradas/saídas/contas (mês, atrasadas e futuras),
// saldo projetado, médias mensais do ano e, para Pro/Master, indicadores por membro e por categoria.
// Retorna a função de desmontagem que encerra os três listeners do Firestore.
export async function montarDashboard(container, usuario) {
  if (!usuario.familiaId) {
    container.innerHTML = `
      <div class="p-6 text-center text-muted">
        <p>Bem-vindo(a), ${usuario.nomeExibicao || "Master"}.</p>
        <p class="text-sm mt-1">Use o Painel Master para gerenciar famílias e usuários.</p>
      </div>
    `;
    return undefined;
  }

  const ehGestor = usuario.nivel === "pro" || usuario.nivel === "master";

  container.innerHTML = `
    <div class="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <h1 class="text-lg heading-primary">Olá, ${usuario.nomeExibicao || ""}</h1>

      <!-- 004.1 - Navegador de mês: todo o painel abaixo é recalculado para o mês selecionado -->
      <div class="flex items-center justify-between">
        <button id="botao-mes-anterior" class="p-1.5 text-primary dark:text-white hover:text-primary-light" aria-label="Mês anterior">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span id="rotulo-mes-dashboard" class="text-sm font-semibold text-primary dark:text-white"></span>
        <button id="botao-mes-seguinte" class="p-1.5 text-primary dark:text-white hover:text-primary-light" aria-label="Próximo mês">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <a href="#entradas" class="card p-4 hover:ring-2 hover:ring-primary-light transition-shadow">
          <p class="text-xs text-muted">Entradas do mês</p>
          <p id="dash-entradas" class="text-lg font-semibold text-status-pago mt-1">${formatarMoeda(0)}</p>
        </a>
        <a href="#saidas" class="card p-4 hover:ring-2 hover:ring-primary-light transition-shadow">
          <p class="text-xs text-muted">Saídas do mês</p>
          <p id="dash-saidas" class="text-lg font-semibold text-status-atrasado mt-1">${formatarMoeda(0)}</p>
        </a>
        <a href="#contas" class="card p-4 hover:ring-2 hover:ring-primary-light transition-shadow">
          <p class="text-xs text-muted">Contas do mês</p>
          <p id="dash-contas-mes" class="text-lg font-semibold text-status-pendente mt-1">${formatarMoeda(0)}</p>
        </a>
        <a href="#contas" class="card p-4 hover:ring-2 hover:ring-primary-light transition-shadow">
          <p class="text-xs text-muted">Contas atrasadas</p>
          <p id="dash-contas-atrasadas" class="text-lg font-semibold text-status-atrasado mt-1">${formatarMoeda(0)}</p>
        </a>
        <div class="card p-4">
          <p class="text-xs text-muted">Saldo do mês</p>
          <p id="dash-saldo" class="text-lg font-semibold text-primary dark:text-white mt-1">${formatarMoeda(0)}</p>
        </div>
      </div>

      <!-- 004.2 - Saldo projetado: só considera o mês selecionado (contas atrasadas ficam de fora por padrão) -->
      <div class="card p-4">
        <p class="text-xs text-muted">Saldo projetado (entradas do mês − saídas do mês − contas do mês)</p>
        <p id="dash-saldo-projetado" class="text-xl font-semibold text-primary dark:text-white mt-1">${formatarMoeda(0)}</p>

        <button id="botao-simular-atrasadas" class="mt-3 text-sm text-primary dark:text-white underline disabled:opacity-50 disabled:no-underline" disabled>
          Simular contas em atraso (0)
        </button>

        <div id="painel-simulacao" class="hidden mt-3 pt-3 border-t border-gray-200 dark:border-white/10 space-y-2">
          <p class="text-xs text-muted">Marque quais contas atrasadas quer incluir na simulação:</p>
          <div id="lista-atrasadas-simulacao" class="space-y-1.5"></div>
          <p class="text-sm font-semibold text-primary dark:text-white pt-2 border-t border-gray-200 dark:border-white/10">
            Saldo simulado: <span id="dash-saldo-simulado"></span>
          </p>
        </div>
      </div>

      <!-- 004.3 - Contas futuras: vencimento além do mês selecionado, ainda não relevantes para o saldo do mês -->
      <a href="#contas" class="card p-4 flex items-center justify-between hover:ring-2 hover:ring-primary-light transition-shadow">
        <p class="text-xs text-muted">Contas futuras (fora deste mês, ainda não vencidas)</p>
        <p id="dash-contas-futuras" class="text-base font-semibold text-primary dark:text-white">${formatarMoeda(0)}</p>
      </a>

      <!-- 004.4 - Médias mensais do ano: soma do ano dividida pelos meses que têm lançamento -->
      <div class="grid grid-cols-2 gap-3">
        <div class="card p-4">
          <p class="text-xs text-muted">Média mensal de entradas (<span id="dash-ano-entradas"></span>)</p>
          <p id="dash-media-entradas" class="text-lg font-semibold text-status-pago mt-1">${formatarMoeda(0)}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-muted">Média mensal de despesas (<span id="dash-ano-despesas"></span>)</p>
          <p id="dash-media-despesas" class="text-lg font-semibold text-status-atrasado mt-1">${formatarMoeda(0)}</p>
        </div>
      </div>

      ${
        ehGestor
          ? `
        <div class="grid sm:grid-cols-2 gap-4">
          <div class="card p-4">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-semibold text-primary dark:text-white">Entradas por membro</h2>
              <span id="dash-total-entradas-por-membro" class="text-xs text-muted"></span>
            </div>
            <div id="dash-entradas-por-membro" class="space-y-3">
              <p class="text-sm text-muted">Sem dados ainda.</p>
            </div>
          </div>
          <div class="card p-4">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-semibold text-primary dark:text-white">Saídas por membro</h2>
              <span id="dash-total-saidas-por-membro" class="text-xs text-muted"></span>
            </div>
            <div id="dash-saidas-por-membro" class="space-y-3">
              <p class="text-sm text-muted">Sem dados ainda.</p>
            </div>
          </div>
          <div class="card p-4">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-semibold text-primary dark:text-white">Contas pagas por membro</h2>
              <span id="dash-total-contas-por-membro" class="text-xs text-muted"></span>
            </div>
            <div id="dash-contas-por-membro" class="space-y-3">
              <p class="text-sm text-muted">Sem dados ainda.</p>
            </div>
          </div>
          <div class="card p-4">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-semibold text-primary dark:text-white">Gastos por categoria</h2>
              <span id="dash-total-por-categoria" class="text-xs text-muted"></span>
            </div>
            <div id="dash-por-categoria" class="space-y-3">
              <p class="text-sm text-muted">Sem dados ainda.</p>
            </div>
          </div>
        </div>
      `
          : ""
      }
    </div>
  `;

  return escutarDashboard(usuario, ehGestor);
}

// 005 - Escuta em tempo real Entradas, Saídas e Contas da família, controla a navegação por mês
// e recalcula os indicadores a cada atualização. Retorna a função que cancela os três listeners.
function escutarDashboard(usuario, ehGestor) {
  const referenciaEntradas = collection(db, "familias", usuario.familiaId, "entradas");
  const referenciaSaidas = collection(db, "familias", usuario.familiaId, "saidas");
  const referenciaContas = collection(db, "familias", usuario.familiaId, "contas");

  const consultaEntradas =
    usuario.nivel === "simples" ? query(referenciaEntradas, where("membroId", "==", usuario.uid)) : referenciaEntradas;
  const consultaSaidas =
    usuario.nivel === "simples" ? query(referenciaSaidas, where("membroId", "==", usuario.uid)) : referenciaSaidas;
  // 004.1 - Simples só recebe as contas em que é o responsável; Pro e Master veem todas
  const consultaContas =
    usuario.nivel === "simples" ? query(referenciaContas, where("responsavelId", "==", usuario.uid)) : referenciaContas;

  const rotuloMes = document.getElementById("rotulo-mes-dashboard");
  const botaoMesAnterior = document.getElementById("botao-mes-anterior");
  const botaoMesSeguinte = document.getElementById("botao-mes-seguinte");

  // 005.4 - Simulador de contas atrasadas: quais estão marcadas (mantém a marcação entre atualizações)
  const botaoSimular = document.getElementById("botao-simular-atrasadas");
  const painelSimulacao = document.getElementById("painel-simulacao");
  const listaSimulacao = document.getElementById("lista-atrasadas-simulacao");
  const saldoSimuladoTexto = document.getElementById("dash-saldo-simulado");
  const selecionadasAtrasadas = new Set();

  botaoSimular.addEventListener("click", () => painelSimulacao.classList.toggle("hidden"));

  let mesSelecionado = new Date().toISOString().slice(0, 7); // "AAAA-MM"
  let entradas = [];
  let saidas = [];
  let contas = [];

  function mudarMes(delta) {
    const [ano, mes] = mesSelecionado.split("-").map(Number);
    const data = new Date(ano, mes - 1 + delta, 1);
    mesSelecionado = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    atualizarPainel();
  }

  botaoMesAnterior.addEventListener("click", () => mudarMes(-1));
  botaoMesSeguinte.addEventListener("click", () => mudarMes(1));

  // 006 - Agrupa uma lista de lançamentos por mês ("AAAA-MM") e retorna a média (soma ÷ nº de meses com dado)
  function calcularMediaMensal(itens) {
    const porMes = {};
    itens.forEach((item) => {
      const mes = (item.data || "").slice(0, 7);
      if (!mes) return;
      porMes[mes] = (porMes[mes] || 0) + Number(item.valor || 0);
    });

    const meses = Object.keys(porMes);
    if (meses.length === 0) return 0;

    const total = meses.reduce((soma, mes) => soma + porMes[mes], 0);
    return total / meses.length;
  }

  function atualizarPainel() {
    rotuloMes.textContent = formatarRotuloMes(mesSelecionado);

    const entradasMes = entradas.filter((e) => (e.data || "").startsWith(mesSelecionado));
    const saidasMes = saidas.filter((s) => (s.data || "").startsWith(mesSelecionado));

    // 005.1 - Contas com saldo pendente (valor - valorPago > 0), separadas em três grupos:
    // do mês (vence este mês e ainda não passou), atrasadas (vencimento já passou) e futuras (depois deste mês)
    const contasComRestante = contas
      .map((c) => ({ ...c, restante: Math.max(Number(c.valor || 0) - Number(c.valorPago || 0), 0) }))
      .filter((c) => c.restante > 0);

    const contasDoMes = contasComRestante.filter(
      (c) => (c.vencimento || "").startsWith(mesSelecionado) && !contaAtrasada(c)
    );
    const contasAtrasadas = contasComRestante.filter((c) => contaAtrasada(c));
    const contasFuturas = contasComRestante.filter(
      (c) => !(c.vencimento || "").startsWith(mesSelecionado) && !contaAtrasada(c)
    );

    // 005.2 - Pagamentos de contas feitos DENTRO do mês selecionado (cada um com sua própria data)
    const todosPagamentos = contas.flatMap((c) =>
      (c.pagamentos || []).map((p) => ({ ...p, categoria: c.categoria || "Contas Fixas" }))
    );
    const pagamentosDoMes = todosPagamentos.filter((p) => (p.data || "").startsWith(mesSelecionado));

    const totalEntradas = entradasMes.reduce((soma, e) => soma + Number(e.valor || 0), 0);
    const totalSaidasLancadas = saidasMes.reduce((soma, s) => soma + Number(s.valor || 0), 0);
    const totalContasPagas = pagamentosDoMes.reduce((soma, p) => soma + Number(p.valor || 0), 0);
    const totalSaidas = totalSaidasLancadas + totalContasPagas;
    const totalContasDoMes = contasDoMes.reduce((soma, c) => soma + c.restante, 0);
    const totalContasAtrasadas = contasAtrasadas.reduce((soma, c) => soma + c.restante, 0);
    const totalContasFuturas = contasFuturas.reduce((soma, c) => soma + c.restante, 0);

    document.getElementById("dash-saldo").textContent = formatarMoeda(totalEntradas - totalSaidas);
    document.getElementById("dash-entradas").textContent = formatarMoeda(totalEntradas);
    document.getElementById("dash-saidas").textContent = formatarMoeda(totalSaidas);
    document.getElementById("dash-contas-mes").textContent = formatarMoeda(totalContasDoMes);
    document.getElementById("dash-contas-atrasadas").textContent = formatarMoeda(totalContasAtrasadas);
    document.getElementById("dash-contas-futuras").textContent = formatarMoeda(totalContasFuturas);

    // 005.3.1 - Saldo projetado NÃO inclui contas atrasadas por padrão; o simulador abaixo permite
    // marcar quais atrasadas entrariam na conta, sem alterar esse valor "oficial"
    const saldoProjetadoBase = totalEntradas - totalSaidas - totalContasDoMes;
    document.getElementById("dash-saldo-projetado").textContent = formatarMoeda(saldoProjetadoBase);
    renderizarSimulacaoAtrasadas(contasAtrasadas, saldoProjetadoBase);

    // 005.3 - Médias mensais do ano ao qual pertence o mês selecionado
    const anoSelecionado = mesSelecionado.slice(0, 4);
    const entradasDoAno = entradas.filter((e) => (e.data || "").startsWith(anoSelecionado));
    const saidasDoAno = saidas.filter((s) => (s.data || "").startsWith(anoSelecionado));
    const pagamentosDoAno = todosPagamentos.filter((p) => (p.data || "").startsWith(anoSelecionado));

    document.getElementById("dash-ano-entradas").textContent = anoSelecionado;
    document.getElementById("dash-ano-despesas").textContent = anoSelecionado;
    document.getElementById("dash-media-entradas").textContent = formatarMoeda(calcularMediaMensal(entradasDoAno));
    document.getElementById("dash-media-despesas").textContent = formatarMoeda(
      calcularMediaMensal([...saidasDoAno, ...pagamentosDoAno])
    );

    if (ehGestor) {
      renderizarRanking("dash-entradas-por-membro", "dash-total-entradas-por-membro", agrupar(entradasMes, "membroNome"));
      renderizarRanking("dash-saidas-por-membro", "dash-total-saidas-por-membro", agrupar(saidasMes, "membroNome"));
      renderizarRanking("dash-contas-por-membro", "dash-total-contas-por-membro", agrupar(pagamentosDoMes, "membroNome"));

      const itensPorCategoria = [...saidasMes, ...pagamentosDoMes];
      renderizarRanking("dash-por-categoria", "dash-total-por-categoria", agrupar(itensPorCategoria, "categoria"));
    }
  }

  const pararEntradas = onSnapshot(consultaEntradas, (snapshot) => {
    entradas = snapshot.docs.map((d) => d.data());
    atualizarPainel();
  });

  const pararSaidas = onSnapshot(consultaSaidas, (snapshot) => {
    saidas = snapshot.docs.map((d) => d.data());
    atualizarPainel();
  });

  const pararContas = onSnapshot(consultaContas, (snapshot) => {
    contas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    atualizarPainel();
  });

  // 005.5 - Renderiza a lista de contas atrasadas com checkbox e recalcula o saldo simulado
  // conforme a marcação. A seleção (Set) é preservada entre atualizações de dados/mês.
  function renderizarSimulacaoAtrasadas(contasAtrasadas, saldoBase) {
    // 005.5.1 - Remove da seleção qualquer conta que não esteja mais atrasada (foi paga, editada, etc.)
    const idsAtuais = new Set(contasAtrasadas.map((c) => c.id));
    [...selecionadasAtrasadas].forEach((id) => {
      if (!idsAtuais.has(id)) selecionadasAtrasadas.delete(id);
    });

    botaoSimular.textContent = `Simular contas em atraso (${contasAtrasadas.length})`;
    botaoSimular.disabled = contasAtrasadas.length === 0;
    if (contasAtrasadas.length === 0) painelSimulacao.classList.add("hidden");

    function recalcularSaldoSimulado() {
      const somaSelecionadas = contasAtrasadas
        .filter((c) => selecionadasAtrasadas.has(c.id))
        .reduce((soma, c) => soma + c.restante, 0);
      saldoSimuladoTexto.textContent = formatarMoeda(saldoBase - somaSelecionadas);
    }

    listaSimulacao.innerHTML = contasAtrasadas
      .map(
        (c) => `
          <label class="flex items-center justify-between gap-2 text-sm cursor-pointer">
            <span class="flex items-center gap-2">
              <input type="checkbox" data-id="${c.id}" class="h-4 w-4" ${selecionadasAtrasadas.has(c.id) ? "checked" : ""} />
              ${c.nome}
            </span>
            <span class="text-status-atrasado">${formatarMoeda(c.restante)}</span>
          </label>
        `
      )
      .join("");

    listaSimulacao.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) selecionadasAtrasadas.add(input.dataset.id);
        else selecionadasAtrasadas.delete(input.dataset.id);
        recalcularSaldoSimulado();
      });
    });

    recalcularSaldoSimulado();
  }

  return () => {
    pararEntradas();
    pararSaidas();
    pararContas();
  };
}

// 007 - Agrupa uma lista de lançamentos por um campo (membroNome ou categoria) e calcula o percentual de cada grupo
function agrupar(itens, campo) {
  const total = itens.reduce((soma, item) => soma + Number(item.valor || 0), 0);
  const grupos = {};

  itens.forEach((item) => {
    const chave = item[campo] || "Outros";
    grupos[chave] = (grupos[chave] || 0) + Number(item.valor || 0);
  });

  return Object.entries(grupos)
    .map(([nome, valor]) => ({ nome, valor, percentual: total ? Math.round((valor / total) * 100) : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

// 008 - Renderiza uma lista de barras de percentual e o total no topo do painel
// (usado pelos indicadores por membro e por categoria)
function renderizarRanking(idContainer, idTotal, itens) {
  const container = document.getElementById(idContainer);
  const totalTexto = document.getElementById(idTotal);
  if (!container) return;

  const total = itens.reduce((soma, item) => soma + item.valor, 0);
  if (totalTexto) totalTexto.textContent = `Total: ${formatarMoeda(total)}`;

  if (itens.length === 0) {
    container.innerHTML = `<p class="text-sm text-muted">Sem dados ainda.</p>`;
    return;
  }

  container.innerHTML = itens
    .map(
      (item) => `
        <div>
          <div class="flex items-center justify-between text-sm mb-1">
            <span class="text-primary dark:text-white">${item.nome}</span>
            <span class="text-muted">${formatarMoeda(item.valor)} · ${item.percentual}%</span>
          </div>
          <div class="h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
            <div class="h-full bg-primary-light" style="width: ${item.percentual}%"></div>
          </div>
        </div>
      `
    )
    .join("");
}
