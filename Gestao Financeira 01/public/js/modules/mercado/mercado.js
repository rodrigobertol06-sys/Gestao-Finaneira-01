// 001 - Importa funções do Firestore via CDN, a instância compartilhada (db) e utilitários do projeto
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../../core/firebase.js";
import {
  formatarMoeda,
  comUsuarioPrimeiro,
  aplicarMascaraMoeda,
  valorMoedaParaNumero,
  numeroParaValorMoeda,
} from "../../core/utils.js";
import { escutarCategorias } from "../categorias/categorias.js";

// 002 - Monta a tela de Lista de Mercado. É uma ferramenta de apoio durante as compras:
// os itens ficam só na memória do navegador (não são salvos um a um no banco). Ao finalizar,
// o total vira UM único lançamento de Saída, que sim desconta de verdade do saldo da família.
// Retorna a função de desmontagem (cancela os listeners de categorias).
export async function montarMercado(container, usuario) {
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
    <div class="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
      <h1 class="text-lg heading-primary">Lista de Mercado</h1>

      <!-- 002.1 - Orçamento da compra: só um limite de acompanhamento, não mexe no saldo real ainda -->
      <div class="card p-4 space-y-3">
        <div class="grid grid-cols-2 gap-3 items-end">
          <div>
            <label class="form-label">Valor disponível</label>
            <input id="input-orcamento" type="text" inputmode="decimal" value="0,00" class="form-input" />
          </div>
          <button id="botao-adicionar-saldo" type="button" class="btn-text text-left">+ Adicionar saldo</button>
        </div>

        <form id="form-adicionar-saldo" class="hidden grid grid-cols-2 gap-3 items-end pt-3 border-t border-gray-200 dark:border-white/10">
          <div>
            <label class="form-label">Valor a adicionar</label>
            <input id="input-valor-adicional" type="text" inputmode="decimal" placeholder="0,00" class="form-input" />
          </div>
          <div>
            <label class="form-label">De qual usuário</label>
            <select id="input-membro-saldo" class="form-input"></select>
          </div>
          <div class="col-span-2 flex justify-end gap-2">
            <button type="button" id="botao-cancelar-saldo" class="btn-text">Cancelar</button>
            <button type="submit" class="btn-primary">Adicionar</button>
          </div>
        </form>

        <div class="grid grid-cols-3 gap-2 pt-1 text-center">
          <div>
            <p class="text-xs text-muted">Disponível</p>
            <p id="resumo-disponivel" class="font-semibold text-primary dark:text-white">${formatarMoeda(0)}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Gasto</p>
            <p id="resumo-gasto" class="font-semibold text-status-atrasado">${formatarMoeda(0)}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Resta</p>
            <p id="resumo-resta" class="font-semibold text-status-pago">${formatarMoeda(0)}</p>
          </div>
        </div>
      </div>

      <!-- 002.2 - Adicionar item à lista -->
      <form id="form-item" class="card p-4 space-y-3">
        <div>
          <label class="form-label">Descrição</label>
          <input id="input-item-descricao" type="text" required placeholder="Ex: Doritos, Cheetos..." class="form-input" />
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="form-label">Categoria</label>
            <select id="input-item-categoria" class="form-input">
              <option value="">Carregando...</option>
            </select>
          </div>
          <div>
            <label class="form-label">Qtd.</label>
            <input id="input-item-quantidade" type="number" min="1" step="1" value="1" class="form-input" />
          </div>
          <div>
            <label class="form-label">Valor unit. (R$)</label>
            <input id="input-item-valor" type="text" inputmode="decimal" placeholder="0,00" required class="form-input" />
          </div>
        </div>
        <div class="flex justify-end">
          <button type="submit" class="btn-primary">+ Adicionar item</button>
        </div>
      </form>

      <!-- 002.3 - Itens já adicionados nesta lista -->
      <div id="lista-itens" class="space-y-2">
        <p class="text-sm text-muted text-center py-4">Nenhum item adicionado ainda.</p>
      </div>

      <!-- 002.4 - Finalizar: transforma o total da lista em UM lançamento de Saída -->
      <button id="botao-finalizar" class="btn-primary w-full" disabled>Finalizar compra</button>

      <form id="form-finalizar" class="hidden card p-4 space-y-3">
        <p class="form-label">Finalizar compra</p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Categoria da saída</label>
            <select id="input-categoria-saida" class="form-input">
              <option value="">Carregando...</option>
            </select>
          </div>
          ${
            ehGestor
              ? `
          <div>
            <label class="form-label">Atribuir a</label>
            <select id="input-membro-saida" class="form-input"></select>
          </div>`
              : ""
          }
        </div>
        <div class="flex gap-2 justify-end pt-1">
          <button type="button" id="botao-cancelar-finalizar" class="btn-text">Cancelar</button>
          <button type="submit" class="btn-primary">Confirmar e lançar como saída</button>
        </div>
      </form>
    </div>
  `;

  return iniciar(usuario, ehGestor);
}

// 003 - Busca os membros da família (usado nos seletores "de qual usuário" e "atribuir a")
async function buscarMembros(usuario) {
  const consulta = query(collection(db, "usuarios"), where("familiaId", "==", usuario.familiaId));
  const snapshot = await getDocs(consulta);
  const membros = snapshot.docs.map((d) => ({ uid: d.id, nome: d.data().nomeExibicao || "Membro" }));

  if (!membros.some((m) => m.uid === usuario.uid)) {
    membros.unshift({ uid: usuario.uid, nome: usuario.nomeExibicao || "Você" });
  }

  // 003.1 - O próprio usuário logado sempre aparece primeiro na lista (pré-selecionado)
  return comUsuarioPrimeiro(membros, usuario.uid);
}

// 004 - Liga toda a interatividade da tela: orçamento, itens e finalização
function iniciar(usuario, ehGestor) {
  const inputOrcamento = document.getElementById("input-orcamento");
  const botaoAdicionarSaldo = document.getElementById("botao-adicionar-saldo");
  const formAdicionarSaldo = document.getElementById("form-adicionar-saldo");
  const inputValorAdicional = document.getElementById("input-valor-adicional");
  const selectMembroSaldo = document.getElementById("input-membro-saldo");
  const botaoCancelarSaldo = document.getElementById("botao-cancelar-saldo");

  const resumoDisponivel = document.getElementById("resumo-disponivel");
  const resumoGasto = document.getElementById("resumo-gasto");
  const resumoResta = document.getElementById("resumo-resta");

  const formItem = document.getElementById("form-item");
  const inputItemDescricao = document.getElementById("input-item-descricao");
  const selectItemCategoria = document.getElementById("input-item-categoria");
  const inputItemQuantidade = document.getElementById("input-item-quantidade");
  const inputItemValor = document.getElementById("input-item-valor");

  const listaItens = document.getElementById("lista-itens");
  const botaoFinalizar = document.getElementById("botao-finalizar");
  const formFinalizar = document.getElementById("form-finalizar");
  const selectCategoriaSaida = document.getElementById("input-categoria-saida");
  const selectMembroSaida = ehGestor ? document.getElementById("input-membro-saida") : null;
  const botaoCancelarFinalizar = document.getElementById("botao-cancelar-finalizar");

  let itens = [];
  let membros = [];

  aplicarMascaraMoeda(inputOrcamento);
  aplicarMascaraMoeda(inputValorAdicional);
  aplicarMascaraMoeda(inputItemValor);

  // 005 - Preenche as categorias de itens de mercado e as categorias de saída (para o lançamento final)
  const pararCategoriasMercado = escutarCategorias("mercado", (lista) => {
    selectItemCategoria.innerHTML =
      lista.map((c) => `<option value="${c.nome}">${c.nome}</option>`).join("") ||
      `<option value="">Nenhuma cadastrada</option>`;
  });

  const pararCategoriasSaida = escutarCategorias("saida", (lista) => {
    selectCategoriaSaida.innerHTML =
      lista.map((c) => `<option value="${c.nome}">${c.nome}</option>`).join("") ||
      `<option value="">Nenhuma cadastrada</option>`;
  });

  // 006 - Preenche os seletores de membro assim que a lista de membros chega
  buscarMembros(usuario).then((lista) => {
    membros = lista;
    const opcoes = membros.map((m) => `<option value="${m.uid}">${m.nome}</option>`).join("");
    selectMembroSaldo.innerHTML = opcoes;
    if (selectMembroSaida) selectMembroSaida.innerHTML = opcoes;
  });

  // 007 - Recalcula e exibe disponível / gasto / resta
  function atualizarResumo() {
    const orcamento = valorMoedaParaNumero(inputOrcamento.value);
    const totalGasto = itens.reduce((soma, item) => soma + item.quantidade * item.valor, 0);
    const resta = orcamento - totalGasto;

    resumoDisponivel.textContent = formatarMoeda(orcamento);
    resumoGasto.textContent = formatarMoeda(totalGasto);
    resumoResta.textContent = formatarMoeda(resta);
    resumoResta.classList.toggle("text-status-pago", resta >= 0);
    resumoResta.classList.toggle("text-status-atrasado", resta < 0);

    botaoFinalizar.disabled = itens.length === 0;
  }

  inputOrcamento.addEventListener("input", atualizarResumo);

  // 008 - "Adicionar saldo": só aumenta o valor disponível de acompanhamento (não mexe no saldo real)
  botaoAdicionarSaldo.addEventListener("click", () => formAdicionarSaldo.classList.remove("hidden"));
  botaoCancelarSaldo.addEventListener("click", () => {
    formAdicionarSaldo.reset();
    formAdicionarSaldo.classList.add("hidden");
  });

  formAdicionarSaldo.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const valor = valorMoedaParaNumero(inputValorAdicional.value);
    const novoOrcamento = valorMoedaParaNumero(inputOrcamento.value) + valor;
    inputOrcamento.value = numeroParaValorMoeda(novoOrcamento);
    formAdicionarSaldo.reset();
    formAdicionarSaldo.classList.add("hidden");
    atualizarResumo();
  });

  // 009 - Renderiza a lista de itens já adicionados, com botão de remover cada um
  function renderizarItens() {
    if (itens.length === 0) {
      listaItens.innerHTML = `<p class="text-sm text-muted text-center py-4">Nenhum item adicionado ainda.</p>`;
      return;
    }

    listaItens.innerHTML = itens
      .map(
        (item, indice) => `
          <div class="card p-3 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-sm font-medium text-primary dark:text-white truncate">${item.descricao}</p>
              <p class="text-xs text-muted">${item.categoria || "Outros"} · ${item.quantidade}x ${formatarMoeda(item.valor)}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-sm font-semibold text-primary dark:text-white">${formatarMoeda(item.quantidade * item.valor)}</span>
              <button data-indice="${indice}" data-acao="remover-item" class="text-gray-400 dark:text-gray-500 hover:text-status-atrasado p-1" aria-label="Remover">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        `
      )
      .join("");

    listaItens.querySelectorAll("[data-acao='remover-item']").forEach((botao) => {
      botao.addEventListener("click", () => {
        itens.splice(Number(botao.dataset.indice), 1);
        renderizarItens();
        atualizarResumo();
      });
    });
  }

  formItem.addEventListener("submit", (evento) => {
    evento.preventDefault();

    itens.push({
      descricao: inputItemDescricao.value.trim(),
      categoria: selectItemCategoria.value,
      quantidade: Number(inputItemQuantidade.value) || 1,
      valor: valorMoedaParaNumero(inputItemValor.value),
    });

    formItem.reset();
    inputItemQuantidade.value = 1;
    renderizarItens();
    atualizarResumo();
  });

  // 010 - Finalizar: pede a categoria da saída (e o responsável, se gestor) e lança UM total
  botaoFinalizar.addEventListener("click", () => formFinalizar.classList.remove("hidden"));
  botaoCancelarFinalizar.addEventListener("click", () => formFinalizar.classList.add("hidden"));

  formFinalizar.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const totalGasto = itens.reduce((soma, item) => soma + item.quantidade * item.valor, 0);
    const membroId = ehGestor ? selectMembroSaida.value : usuario.uid;
    const membro = membros.find((m) => m.uid === membroId);

    await addDoc(collection(db, "familias", usuario.familiaId, "saidas"), {
      descricao: `Lista de Mercado (${itens.length} ${itens.length === 1 ? "item" : "itens"})`,
      valor: totalGasto,
      data: new Date().toISOString().slice(0, 10),
      categoria: selectCategoriaSaida.value,
      membroId,
      membroNome: membro?.nome || usuario.nomeExibicao || "Você",
      criadoEm: serverTimestamp(),
    });

    // 011 - Reinicia a ferramenta, pronta para uma nova lista
    itens = [];
    inputOrcamento.value = "0,00";
    renderizarItens();
    atualizarResumo();
    formFinalizar.reset();
    formFinalizar.classList.add("hidden");
    alert("Compra lançada como saída com sucesso!");
  });

  renderizarItens();
  atualizarResumo();

  return () => {
    pararCategoriasMercado();
    pararCategoriasSaida();
  };
}
