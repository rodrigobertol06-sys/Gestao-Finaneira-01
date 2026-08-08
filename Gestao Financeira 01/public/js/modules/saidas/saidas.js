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
  htmlNavegadorMes,
  iniciarNavegadorMes,
} from "../../core/utils.js";
import { escutarCategorias } from "../categorias/categorias.js";

// 002 - Monta a tela de Saídas dentro do container informado.
// Retorna uma função de "desmontagem" que o router chama ao sair da tela,
// encerrando o listener em tempo real do Firestore.
export async function montarSaidas(container, usuario) {
  if (!usuario.familiaId) {
    container.innerHTML = `
      <div class="p-6 text-center text-muted">
        <p>Este usuário não está vinculado a uma família.</p>
        <p class="text-sm mt-1">Use o Painel Master para vincular este usuário a uma família.</p>
      </div>
    `;
    return undefined;
  }

  container.innerHTML = `
    <div class="p-4 sm:p-6 max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-lg heading-primary">Saídas</h1>
          <p class="text-xs text-muted">Dinheiro que já saiu (desconta do saldo assim que é lançado).</p>
          <p id="total-saidas" class="text-sm text-muted mt-1">Total: ${formatarMoeda(0)}</p>
        </div>
        <button id="botao-nova-saida" class="btn-primary">
          + Nova saída
        </button>
      </div>

      <form id="form-saida" class="hidden card p-4 mb-4 space-y-3">
        <div>
          <label class="form-label">Descrição</label>
          <input id="input-descricao" type="text" required class="form-input" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Valor (R$)</label>
            <input id="input-valor" type="text" inputmode="decimal" placeholder="0,00" required class="form-input" />
          </div>
          <div>
            <label class="form-label">Data</label>
            <input id="input-data" type="date" required class="form-input" />
          </div>
        </div>
        <div>
          <label class="form-label">Categoria</label>
          <select id="input-categoria" class="form-input">
            <option value="">Carregando...</option>
          </select>
        </div>
        <div id="grupo-membro" class="hidden">
          <label class="form-label">Membro</label>
          <select id="input-membro" class="form-input"></select>
        </div>
        <input type="hidden" id="input-id-edicao" />
        <div class="flex gap-2 justify-end pt-1">
          <button type="button" id="botao-cancelar-saida" class="btn-text">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>

      ${htmlNavegadorMes()}

      <div id="lista-saidas" class="space-y-2">
        <p class="text-sm text-muted text-center py-6">Carregando...</p>
      </div>
    </div>
  `;

  const { ehGestor, abrirParaEdicao, pararCategorias } = await iniciarFormulario(usuario);
  const pararEscuta = escutarSaidas(usuario, ehGestor, abrirParaEdicao);

  return () => {
    pararEscuta();
    pararCategorias();
  };
}

// 004 - Busca os membros da família para o seletor do formulário (visível só para Pro/Master).
// Garante que o próprio usuário logado sempre apareça como opção.
async function buscarMembros(usuario) {
  const consulta = query(collection(db, "usuarios"), where("familiaId", "==", usuario.familiaId));
  const snapshot = await getDocs(consulta);
  const membros = snapshot.docs.map((d) => ({ uid: d.id, nome: d.data().nomeExibicao || "Membro" }));

  if (!membros.some((m) => m.uid === usuario.uid)) {
    membros.unshift({ uid: usuario.uid, nome: usuario.nomeExibicao || "Você" });
  }

  // 004.1 - O próprio usuário logado sempre aparece primeiro na lista (pré-selecionado)
  return comUsuarioPrimeiro(membros, usuario.uid);
}

// 005 - Prepara o formulário: exibe/oculta o seletor de membro, liga abrir/cancelar e o envio (criar/editar)
async function iniciarFormulario(usuario) {
  const form = document.getElementById("form-saida");
  const botaoNova = document.getElementById("botao-nova-saida");
  const botaoCancelar = document.getElementById("botao-cancelar-saida");
  const grupoMembro = document.getElementById("grupo-membro");
  const selectMembro = document.getElementById("input-membro");
  const inputDescricao = document.getElementById("input-descricao");
  const inputValor = document.getElementById("input-valor");
  const inputData = document.getElementById("input-data");
  const inputCategoria = document.getElementById("input-categoria");
  const inputIdEdicao = document.getElementById("input-id-edicao");

  const ehGestor = usuario.nivel === "pro" || usuario.nivel === "master";
  let membros = [];

  if (ehGestor) {
    membros = await buscarMembros(usuario);
    grupoMembro.classList.remove("hidden");
    selectMembro.innerHTML = membros.map((m) => `<option value="${m.uid}">${m.nome}</option>`).join("");
  }

  // 005.2 - Máscara de moeda no valor e atalho de Enter no calendário
  aplicarMascaraMoeda(inputValor);
  habilitarAtalhoCalendario(inputData);

  // 005.1 - Preenche o seletor de categoria a partir do cadastro gerenciável (Painel Master → Categorias)
  let categorias = [];
  const pararCategorias = escutarCategorias("saida", (lista) => {
    categorias = lista;
    inputCategoria.innerHTML =
      lista.map((c) => `<option value="${c.nome}">${c.nome}</option>`).join("") ||
      `<option value="">Nenhuma cadastrada</option>`;
  });

  function abrirFormulario() {
    form.classList.remove("hidden");
    botaoNova.classList.add("hidden");
  }

  function fecharFormulario() {
    form.reset();
    inputIdEdicao.value = "";
    form.classList.add("hidden");
    botaoNova.classList.remove("hidden");
  }

  // 006 - Preenche o formulário com os dados de uma saída existente para edição
  function abrirParaEdicao(saida) {
    abrirFormulario();
    inputIdEdicao.value = saida.id;
    inputDescricao.value = saida.descricao;
    inputValor.value = numeroParaValorMoeda(saida.valor);
    inputData.value = saida.data;
    inputCategoria.value = saida.categoria || categorias[categorias.length - 1]?.nome || "";
    if (ehGestor) selectMembro.value = saida.membroId;
  }

  botaoNova.addEventListener("click", abrirFormulario);
  botaoCancelar.addEventListener("click", fecharFormulario);

  // 007 - Trata o envio do formulário: cria uma nova saída ou atualiza uma existente
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const dados = {
      descricao: inputDescricao.value.trim(),
      valor: valorMoedaParaNumero(inputValor.value),
      data: inputData.value,
      categoria: inputCategoria.value,
      membroId: ehGestor ? selectMembro.value : usuario.uid,
      membroNome: ehGestor
        ? membros.find((m) => m.uid === selectMembro.value)?.nome || "Membro"
        : usuario.nomeExibicao || "Você",
    };

    const referenciaColecao = collection(db, "familias", usuario.familiaId, "saidas");

    if (inputIdEdicao.value) {
      await updateDoc(doc(referenciaColecao, inputIdEdicao.value), dados);
    } else {
      await addDoc(referenciaColecao, { ...dados, criadoEm: serverTimestamp() });
    }

    fecharFormulario();
  });

  return { ehGestor, abrirParaEdicao, pararCategorias };
}

// 008 - Escuta em tempo real as saídas da família (ou só as do próprio usuário, se "simples"),
// controla a navegação por mês, atualiza o total e renderiza a lista filtrada.
// Retorna a função de cancelamento do listener.
function escutarSaidas(usuario, ehGestor, abrirParaEdicao) {
  const referenciaColecao = collection(db, "familias", usuario.familiaId, "saidas");

  // 009 - Sem orderBy na consulta (evita exigir índice composto); a ordenação é feita em memória
  const consulta =
    usuario.nivel === "simples" ? query(referenciaColecao, where("membroId", "==", usuario.uid)) : referenciaColecao;

  const lista = document.getElementById("lista-saidas");
  const totalTexto = document.getElementById("total-saidas");

  let mesSelecionado = new Date().toISOString().slice(0, 7);
  let ultimasSaidas = [];

  function renderizar() {
    const saidasDoMes = ultimasSaidas
      .filter((saida) => (saida.data || "").startsWith(mesSelecionado))
      .sort((a, b) => (a.data < b.data ? 1 : -1));

    const total = saidasDoMes.reduce((soma, saida) => soma + Number(saida.valor || 0), 0);
    const quantidade = saidasDoMes.length;
    totalTexto.textContent = `Total: ${formatarMoeda(total)} · ${quantidade} ${quantidade === 1 ? "lançamento" : "lançamentos"}`;

    if (saidasDoMes.length === 0) {
      lista.innerHTML = `<p class="text-sm text-muted text-center py-6">Nenhuma saída neste mês.</p>`;
      return;
    }

    lista.innerHTML = saidasDoMes.map((saida) => cartaoSaida(saida, ehGestor)).join("");

    // 010 - Liga os botões de editar/excluir de cada cartão renderizado
    lista.querySelectorAll("[data-acao='editar']").forEach((botao) => {
      botao.addEventListener("click", () => {
        const saida = saidasDoMes.find((s) => s.id === botao.dataset.id);
        if (saida) abrirParaEdicao(saida);
      });
    });

    lista.querySelectorAll("[data-acao='excluir']").forEach((botao) => {
      botao.addEventListener("click", async () => {
        if (confirm("Excluir esta saída?")) {
          await deleteDoc(doc(referenciaColecao, botao.dataset.id));
        }
      });
    });
  }

  iniciarNavegadorMes(mesSelecionado, (novoMes) => {
    mesSelecionado = novoMes;
    renderizar();
  });

  return onSnapshot(consulta, (snapshot) => {
    ultimasSaidas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderizar();
  });
}

// 011 - Gera o HTML de um cartão de saída na lista
function cartaoSaida(saida, ehGestor) {
  return `
    <div class="card p-4 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="font-medium text-primary dark:text-white truncate">${saida.descricao}</p>
        <p class="text-xs text-muted">
          ${formatarData(saida.data)} · ${saida.categoria || "Outros"}${ehGestor ? ` · ${saida.membroNome || "Membro"}` : ""}
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span class="text-status-atrasado font-semibold">${formatarMoeda(saida.valor)}</span>
        <button data-acao="editar" data-id="${saida.id}" class="text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-white p-1" aria-label="Editar">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828z" />
          </svg>
        </button>
        <button data-acao="excluir" data-id="${saida.id}" class="text-gray-400 dark:text-gray-500 hover:text-status-atrasado p-1" aria-label="Excluir">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  `;
}
