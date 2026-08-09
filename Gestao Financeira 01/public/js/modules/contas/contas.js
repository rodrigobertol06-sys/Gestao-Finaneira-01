// 001 - Importa funções do Firestore via CDN, a instância compartilhada (db) e utilitários do projeto
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../../core/firebase.js";
import {
  formatarMoeda,
  formatarData,
  comUsuarioPrimeiro,
  aplicarMascaraMoeda,
  valorMoedaParaNumero,
  numeroParaValorMoeda,
  habilitarAtalhoCalendario,
  formatarRotuloMes,
  somarMeses,
  gerarIdGrupo,
} from "../../core/utils.js";
import { escutarCategorias } from "../categorias/categorias.js";

// 002 - Rótulos e cores de cada status. "Parcial" é calculado à parte (não existe salvo no banco).
const STATUS = {
  pago: { rotulo: "Pago", cor: "text-status-pago" },
  parcial: { rotulo: "Parcial", cor: "text-status-pendente" },
  pendente: { rotulo: "Pendente", cor: "text-status-pendente" },
  atrasado: { rotulo: "Atrasado", cor: "text-status-atrasado" },
};

// 003 - Calcula o status real de uma conta considerando pagamentos parciais:
// "pago" só quando o valor pago cobre o valor total; "parcial" quando já pagou algo mas não tudo.
function calcularStatusReal(conta) {
  const valorPago = conta.valorPago || 0;
  if (valorPago >= conta.valor) return "pago";
  if (valorPago > 0) return "parcial";

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [ano, mes, dia] = conta.vencimento.split("-").map(Number);
  const vencimento = new Date(ano, mes - 1, dia);

  return vencimento < hoje ? "atrasado" : "pendente";
}

// 003.1 - Verifica só a data (independente de pagamento parcial). Usado no resumo do mês para
// separar "do mês" de "atrasada" com a mesma regra do Dashboard.
function vencimentoJaPassou(conta) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [ano, mes, dia] = conta.vencimento.split("-").map(Number);
  return new Date(ano, mes - 1, dia) < hoje;
}

// 007 - Monta a tela de Contas a Pagar dentro do container informado.
// Compartilhada por toda a família (não pertence a um membro específico).
// Simples só visualiza; Pro/Master criam, editam, registram pagamentos (inclusive parciais) e excluem.
// Retorna a função de "desmontagem" que o router chama ao sair da tela.
export async function montarContas(container, usuario) {
  if (!usuario.familiaId) {
    container.innerHTML = `
      <div class="p-6 text-center text-muted">
        <p>Este usuário não está vinculado a uma família.</p>
        <p class="text-sm mt-1">Use o Painel Master para vincular este usuário a uma família.</p>
      </div>
    `;
    return undefined;
  }

  const ehGestor = usuario.nivel === "pro" || usuario.nivel === "master";

  container.innerHTML = `
    <div class="p-4 sm:p-6 max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-lg heading-primary">Contas a Pagar</h1>
          <p class="text-xs text-muted">Compromissos futuros (só desconta do saldo quando você confirma o pagamento).</p>
          <div class="mt-1 space-y-0.5">
            <p id="total-contas-mes" class="text-sm text-muted">Contas do mês: ${formatarMoeda(0)}</p>
            <p id="total-contas-atrasadas" class="text-sm text-status-atrasado">Atrasadas: ${formatarMoeda(0)}</p>
            <p id="total-contas-combinado" class="text-sm font-semibold text-primary dark:text-white">Total (mês + atrasadas): ${formatarMoeda(0)}</p>
          </div>
        </div>
        <button id="botao-nova-conta" class="btn-primary">+ Nova conta</button>
      </div>

      <!-- 007.1 - Formulário de criar/editar conta, com suporte a parcelamento.
           Disponível pra todo mundo: Simples cuida das próprias contas (responsável = ele mesmo,
           sem seletor); Pro/Master podem escolher o responsável (inclusive outra pessoa). -->
      <form id="form-conta" class="hidden card p-4 mb-4 space-y-3">
        <div>
          <label class="form-label">Nome da conta</label>
          <input id="input-nome" type="text" required class="form-input" placeholder="Ex: Aluguel, Financiamento do carro..." />
        </div>
        <div class="relative">
          <label class="form-label">Categoria</label>
          <div class="relative">
            <input id="input-categoria" type="text" autocomplete="off" class="form-input pr-9" placeholder="Buscar ou digitar..." />
            <svg xmlns="http://www.w3.org/2000/svg" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <div id="lista-sugestoes-categoria" class="hidden absolute z-10 mt-1 w-full card max-h-48 overflow-y-auto"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Valor da parcela (R$)</label>
            <input id="input-valor" type="text" inputmode="decimal" placeholder="0,00" required class="form-input" />
          </div>
          <div>
            <label class="form-label">Vencimento (próxima em aberto)</label>
            <input id="input-vencimento" type="date" required class="form-input" />
          </div>
        </div>
        ${
          ehGestor
            ? `
        <div id="grupo-responsavel">
          <label class="form-label">Responsável pela conta</label>
          <select id="input-responsavel" class="form-input"></select>
        </div>`
            : ""
        }

        <div id="grupo-parcelado-toggle" class="flex items-center gap-2 pt-1">
          <input id="input-parcelado" type="checkbox" class="h-4 w-4" />
          <label for="input-parcelado" class="text-sm text-gray-700 dark:text-gray-300">É uma conta parcelada (financiamento, empréstimo...)?</label>
        </div>

        <div id="grupo-parcelamento" class="hidden space-y-3 pt-2 border-t border-gray-200 dark:border-white/10">
          <div>
            <label class="form-label">Quantidade total de parcelas</label>
            <input id="input-total-parcelas" type="number" min="2" step="1" class="form-input" />
          </div>
          <div class="flex items-center gap-2">
            <input id="input-ja-pago" type="checkbox" class="h-4 w-4" />
            <label for="input-ja-pago" class="text-sm text-gray-700 dark:text-gray-300">Já tem parcelas pagas?</label>
          </div>
          <div id="grupo-parcelas-pagas" class="hidden">
            <label class="form-label">Quantas parcelas já foram pagas</label>
            <input id="input-parcelas-pagas" type="number" min="1" step="1" class="form-input" />
          </div>
          <p class="text-xs text-muted">O sistema já registra só as parcelas restantes, a partir do vencimento informado acima.</p>
        </div>

        <input type="hidden" id="input-id-edicao" />
        <div class="flex gap-2 justify-end pt-1">
          <button type="button" id="botao-cancelar-conta" class="btn-text">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>

      <!-- 007.2 - Formulário de registro de pagamento: quando, quem pagou e quanto (pode ser parcial) -->
      <form id="form-pagamento" class="hidden card p-4 mb-4 space-y-3">
        <p class="form-label">Registrar pagamento</p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Data do pagamento</label>
            <input id="input-data-pagamento" type="date" required class="form-input" />
          </div>
          <div>
            <label class="form-label">Quem pagou</label>
            <select id="input-membro-pagamento" class="form-input"></select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Valor pago (R$)</label>
            <input id="input-valor-pago" type="text" inputmode="decimal" required class="form-input" />
          </div>
          <div>
            <label class="form-label">De onde saiu</label>
            <select id="input-local-pagamento" class="form-input">
              <option value="">Carregando...</option>
            </select>
          </div>
        </div>
        <p id="aviso-valor-pago" class="text-xs text-muted mt-1"></p>
        <input type="hidden" id="input-id-pagamento" />
        <div class="flex gap-2 justify-end pt-1">
          <button type="button" id="botao-cancelar-pagamento" class="btn-text">Cancelar</button>
          <button type="submit" class="btn-primary">Registrar pagamento</button>
        </div>
      </form>

      ${
        ehGestor
          ? `<!-- 007.3 - Resumo de quanto cada membro pagou no mês selecionado (só Pro/Master, visão da família toda) -->
      <div id="resumo-por-membro" class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4"></div>`
          : ""
      }

      <!-- 007.4 - Navegador de mês: filtra a lista abaixo pelo mês de vencimento -->
      <div class="flex items-center justify-between mb-3">
        <button id="botao-mes-anterior" class="p-1.5 text-primary dark:text-white hover:text-primary-light" aria-label="Mês anterior">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span id="rotulo-mes" class="text-sm font-semibold text-primary dark:text-white"></span>
        <button id="botao-mes-seguinte" class="p-1.5 text-primary dark:text-white hover:text-primary-light" aria-label="Próximo mês">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      <div id="lista-contas" class="space-y-2">
        <p class="text-sm text-muted text-center py-6">Carregando...</p>
      </div>
    </div>
  `;

  const { abrirParaEdicao, abrirPagamento, pararCategorias, pararLocais } = await iniciarFormularios(usuario, ehGestor);
  const pararEscuta = escutarContas(usuario, ehGestor, abrirParaEdicao, abrirPagamento);

  return () => {
    pararEscuta();
    pararCategorias();
    pararLocais();
  };
}

// 008 - Busca os membros da família para os seletores de pagamento
async function buscarMembros(usuario) {
  const consulta = query(collection(db, "usuarios"), where("familiaId", "==", usuario.familiaId));
  const snapshot = await getDocs(consulta);
  const membros = snapshot.docs.map((d) => ({ uid: d.id, nome: d.data().nomeExibicao || "Membro" }));

  if (!membros.some((m) => m.uid === usuario.uid)) {
    membros.unshift({ uid: usuario.uid, nome: usuario.nomeExibicao || "Você" });
  }

  return comUsuarioPrimeiro(membros, usuario.uid);
}

// 009 - Prepara os dois formulários: criar/editar conta (com parcelamento) e registrar pagamento
// (data + quem pagou + valor, podendo ser parcial). O seletor de "Responsável" só existe no DOM
// para Pro/Master — Simples sempre é responsável pelas próprias contas, sem precisar escolher.
async function iniciarFormularios(usuario, ehGestor) {
  const form = document.getElementById("form-conta");
  const botaoNova = document.getElementById("botao-nova-conta");
  const botaoCancelar = document.getElementById("botao-cancelar-conta");
  const inputNome = document.getElementById("input-nome");
  const inputCategoria = document.getElementById("input-categoria");
  const inputValor = document.getElementById("input-valor");
  const inputVencimento = document.getElementById("input-vencimento");
  const selectResponsavel = document.getElementById("input-responsavel");
  const inputIdEdicao = document.getElementById("input-id-edicao");

  const grupoParceladoToggle = document.getElementById("grupo-parcelado-toggle");
  const inputParcelado = document.getElementById("input-parcelado");
  const grupoParcelamento = document.getElementById("grupo-parcelamento");
  const inputTotalParcelas = document.getElementById("input-total-parcelas");
  const inputJaPago = document.getElementById("input-ja-pago");
  const grupoParcelasPagas = document.getElementById("grupo-parcelas-pagas");
  const inputParcelasPagas = document.getElementById("input-parcelas-pagas");

  const formPagamento = document.getElementById("form-pagamento");
  const botaoCancelarPagamento = document.getElementById("botao-cancelar-pagamento");
  const inputDataPagamento = document.getElementById("input-data-pagamento");
  const selectMembroPagamento = document.getElementById("input-membro-pagamento");
  const inputValorPago = document.getElementById("input-valor-pago");
  const selectLocalPagamento = document.getElementById("input-local-pagamento");
  const avisoValorPago = document.getElementById("aviso-valor-pago");
  const inputIdPagamento = document.getElementById("input-id-pagamento");

  aplicarMascaraMoeda(inputValor);
  aplicarMascaraMoeda(inputValorPago);
  habilitarAtalhoCalendario(inputVencimento);
  habilitarAtalhoCalendario(inputDataPagamento);

  const membros = await buscarMembros(usuario);
  const opcoesMembros = membros.map((m) => `<option value="${m.uid}">${m.nome}</option>`).join("");
  selectMembroPagamento.innerHTML = opcoesMembros;
  if (selectResponsavel) selectResponsavel.innerHTML = opcoesMembros;

  const referenciaColecao = collection(db, "familias", usuario.familiaId, "contas");

  // 009.1 - Dropdown de busca de categorias (mesma lista de Saídas — Painel Master → Categorias)
  const listaSugestoesCategoria = document.getElementById("lista-sugestoes-categoria");
  let categoriasConta = [];

  const pararCategorias = escutarCategorias("saida", (lista) => {
    categoriasConta = lista;
  });

  // 009.3 - Preenche o seletor de "de onde saiu" no pagamento (Painel Master → Categorias)
  const pararLocais = escutarCategorias("local", (lista) => {
    selectLocalPagamento.innerHTML =
      lista.map((l) => `<option value="${l.nome}">${l.nome}</option>`).join("") ||
      `<option value="">Nenhum cadastrado</option>`;
  });

  function renderizarSugestoesCategoria() {
    const termo = inputCategoria.value.trim().toLowerCase();
    const filtradas = termo ? categoriasConta.filter((c) => c.nome.toLowerCase().includes(termo)) : categoriasConta;

    listaSugestoesCategoria.innerHTML =
      filtradas
        .map(
          (c) =>
            `<button type="button" data-nome="${c.nome}" class="w-full text-left px-3 py-2 text-sm text-primary dark:text-white hover:bg-primary-light hover:text-white transition-colors">${c.nome}</button>`
        )
        .join("") || `<p class="text-sm text-muted px-3 py-2">Nenhuma categoria encontrada.</p>`;

    listaSugestoesCategoria.classList.remove("hidden");
  }

  inputCategoria.addEventListener("focus", renderizarSugestoesCategoria);
  inputCategoria.addEventListener("input", renderizarSugestoesCategoria);

  // 009.2 - "mousedown" (não "click") dispara antes do "blur" do campo, evitando que a lista suma antes da escolha
  listaSugestoesCategoria.addEventListener("mousedown", (evento) => {
    const botao = evento.target.closest("[data-nome]");
    if (botao) inputCategoria.value = botao.dataset.nome;
  });

  inputCategoria.addEventListener("blur", () => {
    setTimeout(() => listaSugestoesCategoria.classList.add("hidden"), 150);
  });

  inputParcelado.addEventListener("change", () => {
    grupoParcelamento.classList.toggle("hidden", !inputParcelado.checked);
  });

  inputJaPago.addEventListener("change", () => {
    grupoParcelasPagas.classList.toggle("hidden", !inputJaPago.checked);
  });

  function abrirFormulario() {
    formPagamento.classList.add("hidden");
    form.classList.remove("hidden");
    botaoNova.classList.add("hidden");
  }

  function fecharFormulario() {
    form.reset();
    inputIdEdicao.value = "";
    grupoParcelamento.classList.add("hidden");
    grupoParcelasPagas.classList.add("hidden");
    form.classList.add("hidden");
    botaoNova.classList.remove("hidden");
  }

  function abrirParaCriacao() {
    fecharFormulario();
    grupoParceladoToggle.classList.remove("hidden");
    abrirFormulario();
  }

  // 010 - Preenche o formulário com os dados de uma conta existente para edição.
  // Edição é sempre por parcela individual, então o bloco de parcelamento fica oculto aqui.
  function abrirParaEdicao(conta) {
    grupoParceladoToggle.classList.add("hidden");
    abrirFormulario();
    inputIdEdicao.value = conta.id;
    inputNome.value = conta.nome;
    inputCategoria.value = conta.categoria || "";
    inputValor.value = numeroParaValorMoeda(conta.valor);
    inputVencimento.value = conta.vencimento;
    if (selectResponsavel && conta.responsavelId) selectResponsavel.value = conta.responsavelId;
  }

  botaoNova.addEventListener("click", abrirParaCriacao);
  botaoCancelar.addEventListener("click", fecharFormulario);

  // 011 - Trata o envio do formulário: cria uma conta (ou várias parcelas de uma vez) ou atualiza uma existente
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const nome = inputNome.value.trim();
    const categoria = inputCategoria.value.trim();
    const valor = valorMoedaParaNumero(inputValor.value);
    const vencimento = inputVencimento.value;
    // 011.1 - Simples não tem o seletor: é sempre responsável pelas próprias contas
    const responsavelId = selectResponsavel ? selectResponsavel.value : usuario.uid;
    const responsavelNome = selectResponsavel
      ? membros.find((m) => m.uid === responsavelId)?.nome || "Membro"
      : usuario.nomeExibicao || "Você";

    if (inputIdEdicao.value) {
      await updateDoc(doc(referenciaColecao, inputIdEdicao.value), {
        nome,
        categoria,
        valor,
        vencimento,
        responsavelId,
        responsavelNome,
      });
      fecharFormulario();
      return;
    }

    if (inputParcelado.checked) {
      // 012 - Conta parcelada: gera só as parcelas restantes, uma por mês, a partir do vencimento informado
      const totalParcelas = Number(inputTotalParcelas.value) || 1;
      const parcelasJaPagas = inputJaPago.checked ? Number(inputParcelasPagas.value) || 0 : 0;
      const restantes = Math.max(totalParcelas - parcelasJaPagas, 1);
      const grupoParcelamento = gerarIdGrupo();

      const tarefas = [];
      for (let i = 0; i < restantes; i += 1) {
        const numeroParcela = parcelasJaPagas + i + 1;
        tarefas.push(
          addDoc(referenciaColecao, {
            nome: `${nome} (parcela ${numeroParcela}/${totalParcelas})`,
            categoria,
            valor,
            vencimento: somarMeses(vencimento, i),
            responsavelId,
            responsavelNome,
            pago: false,
            valorPago: 0,
            pagamentos: [],
            grupoParcelamento,
            numeroParcela,
            totalParcelas,
            criadoEm: serverTimestamp(),
          })
        );
      }
      await Promise.all(tarefas);
    } else {
      await addDoc(referenciaColecao, {
        nome,
        categoria,
        valor,
        vencimento,
        responsavelId,
        responsavelNome,
        pago: false,
        valorPago: 0,
        pagamentos: [],
        criadoEm: serverTimestamp(),
      });
    }

    fecharFormulario();
  });

  // 013 - Abre o formulário de pagamento para uma conta específica, sugerindo o valor que ainda falta
  let contaEmPagamento = null;

  function abrirPagamento(conta) {
    contaEmPagamento = conta;
    form.classList.add("hidden");
    botaoNova.classList.add("hidden");
    inputIdPagamento.value = conta.id;
    inputDataPagamento.value = new Date().toISOString().slice(0, 10);

    const valorRestante = Math.max(conta.valor - (conta.valorPago || 0), 0);
    inputValorPago.value = numeroParaValorMoeda(valorRestante);
    avisoValorPago.textContent =
      conta.valorPago > 0
        ? `Já pago até agora: ${formatarMoeda(conta.valorPago)} de ${formatarMoeda(conta.valor)}. Pagando menos que o valor sugerido, o restante continua pendente.`
        : `Pagando menos que ${formatarMoeda(valorRestante)}, o restante fica pendente para o mesmo vencimento.`;

    formPagamento.classList.remove("hidden");
  }

  function fecharPagamento() {
    formPagamento.reset();
    formPagamento.classList.add("hidden");
    botaoNova.classList.remove("hidden");
    contaEmPagamento = null;
  }

  botaoCancelarPagamento.addEventListener("click", fecharPagamento);

  // 014 - Registra o pagamento (total ou parcial): acrescenta ao histórico da conta e recalcula o valor pago.
  // O vencimento e o valor total da conta NÃO mudam — só o valor pendente diminui.
  formPagamento.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!contaEmPagamento) return;

    const membro = membros.find((m) => m.uid === selectMembroPagamento.value);
    const valorDoPagamento = valorMoedaParaNumero(inputValorPago.value);

    const pagamentosAtualizados = [
      ...(contaEmPagamento.pagamentos || []),
      {
        data: inputDataPagamento.value,
        valor: valorDoPagamento,
        membroId: selectMembroPagamento.value,
        membroNome: membro?.nome || "Membro",
        local: selectLocalPagamento.value,
      },
    ];

    const novoValorPago = pagamentosAtualizados.reduce((soma, p) => soma + Number(p.valor || 0), 0);

    await updateDoc(doc(referenciaColecao, contaEmPagamento.id), {
      pagamentos: pagamentosAtualizados,
      valorPago: novoValorPago,
      pago: novoValorPago >= contaEmPagamento.valor,
    });

    fecharPagamento();
  });

  return { abrirParaEdicao, abrirPagamento, pararCategorias, pararLocais };
}

// 015 - Remove um pagamento específico do histórico de uma conta e recalcula o valor pago
async function removerPagamento(usuario, conta, indice) {
  const pagamentosAtualizados = (conta.pagamentos || []).filter((_, i) => i !== indice);
  const novoValorPago = pagamentosAtualizados.reduce((soma, p) => soma + Number(p.valor || 0), 0);

  await updateDoc(doc(db, "familias", usuario.familiaId, "contas", conta.id), {
    pagamentos: pagamentosAtualizados,
    valorPago: novoValorPago,
    pago: novoValorPago >= conta.valor,
  });
}

// 016 - Escuta em tempo real as contas da família, controla a navegação por mês, o resumo por membro
// e renderiza a lista filtrada. Simples só recebe as contas em que é o responsável; Pro e Master veem todas.
// Retorna a função de cancelamento do listener.
function escutarContas(usuario, ehGestor, abrirParaEdicao, abrirPagamento) {
  const referenciaColecao = collection(db, "familias", usuario.familiaId, "contas");
  const consultaContas =
    usuario.nivel === "simples" ? query(referenciaColecao, where("responsavelId", "==", usuario.uid)) : referenciaColecao;

  const lista = document.getElementById("lista-contas");
  const totalMesTexto = document.getElementById("total-contas-mes");
  const totalAtrasadasTexto = document.getElementById("total-contas-atrasadas");
  const totalCombinadoTexto = document.getElementById("total-contas-combinado");
  const rotuloMes = document.getElementById("rotulo-mes");
  const botaoMesAnterior = document.getElementById("botao-mes-anterior");
  const botaoMesSeguinte = document.getElementById("botao-mes-seguinte");
  const resumoPorMembro = document.getElementById("resumo-por-membro");

  // 017 - Mês selecionado para navegação da lista (começa no mês atual)
  let mesSelecionado = new Date().toISOString().slice(0, 7);
  let ultimasContas = [];

  function mudarMes(delta) {
    const [ano, mes] = mesSelecionado.split("-").map(Number);
    const data = new Date(ano, mes - 1 + delta, 1);
    mesSelecionado = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    renderizar();
  }

  botaoMesAnterior.addEventListener("click", () => mudarMes(-1));
  botaoMesSeguinte.addEventListener("click", () => mudarMes(1));

  // 018 - Renderiza tudo (rótulo do mês, resumo por membro e lista) com os dados mais recentes
  function renderizar() {
    rotuloMes.textContent = formatarRotuloMes(mesSelecionado);

    // 018.1 - Resumo do mês: contas que vencem no mês selecionado + as que já estão atrasadas
    // (mesma lógica do Dashboard), somadas juntas no "Total (mês + atrasadas)"
    const comRestante = ultimasContas
      .map((conta) => ({ ...conta, restante: Math.max(Number(conta.valor || 0) - Number(conta.valorPago || 0), 0) }))
      .filter((conta) => conta.restante > 0);

    const doMes = comRestante.filter(
      (conta) => (conta.vencimento || "").startsWith(mesSelecionado) && !vencimentoJaPassou(conta)
    );
    const atrasadas = comRestante.filter((conta) => vencimentoJaPassou(conta));

    const totalDoMes = doMes.reduce((soma, conta) => soma + conta.restante, 0);
    const totalAtrasadas = atrasadas.reduce((soma, conta) => soma + conta.restante, 0);

    totalMesTexto.textContent = `Contas do mês: ${formatarMoeda(totalDoMes)}`;
    totalAtrasadasTexto.textContent = `Atrasadas: ${formatarMoeda(totalAtrasadas)}`;
    totalCombinadoTexto.textContent = `Total (mês + atrasadas): ${formatarMoeda(totalDoMes + totalAtrasadas)}`;

    if (resumoPorMembro) renderizarResumoPorMembro(ultimasContas, mesSelecionado, resumoPorMembro);

    const contasDoMes = ultimasContas
      .filter((conta) => (conta.vencimento || "").startsWith(mesSelecionado))
      .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));

    if (contasDoMes.length === 0) {
      lista.innerHTML = `<p class="text-sm text-muted text-center py-6">Nenhuma conta com vencimento neste mês.</p>`;
      return;
    }

    // 018.1 - A lista já vem filtrada (Simples só recebe as próprias contas), então quem consegue
    // ver um cartão aqui pode agir sobre ele: registrar pagamento, editar ou excluir.
    lista.innerHTML = contasDoMes.map((conta) => cartaoConta(conta)).join("");

    // 019 - Alterna a exibição do histórico de pagamentos de uma conta
    lista.querySelectorAll("[data-acao='ver-pagamentos']").forEach((botao) => {
      botao.addEventListener("click", () => {
        const bloco = lista.querySelector(`[data-historico="${botao.dataset.id}"]`);
        if (bloco) bloco.classList.toggle("hidden");
      });
    });

    lista.querySelectorAll("[data-acao='registrar-pagamento']").forEach((botao) => {
      botao.addEventListener("click", () => {
        const conta = contasDoMes.find((c) => c.id === botao.dataset.id);
        if (conta) abrirPagamento(conta);
      });
    });

    lista.querySelectorAll("[data-acao='remover-pagamento']").forEach((botao) => {
      botao.addEventListener("click", async () => {
        const conta = contasDoMes.find((c) => c.id === botao.dataset.id);
        if (conta && confirm("Remover este pagamento? O valor volta a ficar pendente.")) {
          await removerPagamento(usuario, conta, Number(botao.dataset.indice));
        }
      });
    });

    lista.querySelectorAll("[data-acao='editar']").forEach((botao) => {
      botao.addEventListener("click", () => {
        const conta = contasDoMes.find((c) => c.id === botao.dataset.id);
        if (conta) abrirParaEdicao(conta);
      });
    });

    lista.querySelectorAll("[data-acao='excluir']").forEach((botao) => {
      botao.addEventListener("click", async () => {
        if (confirm("Excluir esta conta?")) {
          await deleteDoc(doc(referenciaColecao, botao.dataset.id));
        }
      });
    });
  }

  return onSnapshot(consultaContas, (snapshot) => {
    ultimasContas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderizar();
  });
}

// 020 - Soma, por membro, quanto cada um pagou no mês selecionado (considera todas as contas, não só o mês
// de vencimento filtrado na lista — o que importa aqui é a DATA DO PAGAMENTO)
function renderizarResumoPorMembro(contas, mesSelecionado, container) {
  const pagamentosDoMes = contas.flatMap((conta) => (conta.pagamentos || []).filter((p) => (p.data || "").startsWith(mesSelecionado)));

  if (pagamentosDoMes.length === 0) {
    container.innerHTML = `<p class="text-sm text-muted col-span-full">Nenhum pagamento registrado neste mês.</p>`;
    return;
  }

  const porMembro = {};
  pagamentosDoMes.forEach((p) => {
    porMembro[p.membroNome] = (porMembro[p.membroNome] || 0) + Number(p.valor || 0);
  });

  container.innerHTML = Object.entries(porMembro)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([nome, valor]) => `
        <div class="card p-3 text-center">
          <p class="text-xs text-muted truncate">${nome}</p>
          <p class="font-semibold text-primary dark:text-white">${formatarMoeda(valor)}</p>
        </div>
      `
    )
    .join("");
}

// 021 - Gera o HTML de um cartão de conta na lista, incluindo o histórico de pagamentos (se houver).
// Quem consegue ver o cartão (a consulta já filtra isso) pode agir sobre ele.
function cartaoConta(conta) {
  const status = STATUS[calcularStatusReal(conta)];
  const valorPago = conta.valorPago || 0;
  const valorRestante = Math.max(conta.valor - valorPago, 0);
  const pagamentos = conta.pagamentos || [];

  const infoStatus =
    status.rotulo === "Pago"
      ? `Pago · ${formatarMoeda(conta.valor)}`
      : status.rotulo === "Parcial"
      ? `Pago ${formatarMoeda(valorPago)} de ${formatarMoeda(conta.valor)} · falta ${formatarMoeda(valorRestante)} até ${formatarData(conta.vencimento)}`
      : `Vence em ${formatarData(conta.vencimento)} · ${status.rotulo}`;

  return `
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-medium text-primary dark:text-white truncate">${conta.nome}${conta.categoria ? ` · ${conta.categoria}` : ""}</p>
          ${conta.responsavelNome ? `<p class="text-xs text-muted">Responsável: ${conta.responsavelNome}</p>` : ""}
          <p class="text-xs text-muted">
            <span class="${status.cor} font-medium">${infoStatus}</span>
          </p>
          ${
            pagamentos.length > 0
              ? `<button data-acao="ver-pagamentos" data-id="${conta.id}" class="text-xs text-primary dark:text-white underline mt-1">Ver pagamentos (${pagamentos.length})</button>`
              : ""
          }
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="font-semibold ${status.cor}">${formatarMoeda(valorRestante > 0 ? valorRestante : conta.valor)}</span>
          ${
            valorRestante > 0
              ? `<button data-acao="registrar-pagamento" data-id="${conta.id}" class="text-gray-400 dark:text-gray-500 hover:text-status-pago p-1" aria-label="Registrar pagamento">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>`
              : ""
          }
          <button data-acao="editar" data-id="${conta.id}" class="text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-white p-1" aria-label="Editar">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828z" />
            </svg>
          </button>
          <button data-acao="excluir" data-id="${conta.id}" class="text-gray-400 dark:text-gray-500 hover:text-status-atrasado p-1" aria-label="Excluir">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      ${
        pagamentos.length > 0
          ? `
        <div data-historico="${conta.id}" class="hidden mt-3 pt-3 border-t border-gray-200 dark:border-white/10 space-y-1.5">
          ${pagamentos
            .map(
              (p, indice) => `
              <div class="flex items-center justify-between text-xs text-muted">
                <span>${formatarData(p.data)} · ${p.membroNome}${p.local ? ` · ${p.local}` : ""} · ${formatarMoeda(p.valor)}</span>
                <button data-acao="remover-pagamento" data-id="${conta.id}" data-indice="${indice}" class="text-gray-400 dark:text-gray-500 hover:text-status-atrasado" aria-label="Remover pagamento">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            `
            )
            .join("")}
        </div>
      `
          : ""
      }
    </div>
  `;
}
