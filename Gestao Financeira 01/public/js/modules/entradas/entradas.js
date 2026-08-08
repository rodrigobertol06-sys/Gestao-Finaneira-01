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

// 002 - Monta a tela de Entradas dentro do container informado.
// Retorna uma função de "desmontagem" que o router chama ao sair da tela,
// encerrando o listener em tempo real do Firestore.
export async function montarEntradas(container, usuario) {
  // 002.1 - Master não pertence a uma família: ainda não há onde lançar entradas
  if (!usuario.familiaId) {
    container.innerHTML = `
      <div class="p-6 text-center text-muted">
        <p>Este usuário não está vinculado a uma família.</p>
        <p class="text-sm mt-1">Use o Painel Master para vincular este usuário a uma família.</p>
      </div>
    `;
    return undefined;
  }

  // 004 - Estrutura base da tela: cabeçalho com total, formulário (oculto) e lista
  container.innerHTML = `
    <div class="p-4 sm:p-6 max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-lg heading-primary">Entradas</h1>
          <p class="text-xs text-muted">Dinheiro que entrou (soma no saldo assim que é lançado).</p>
          <p id="total-entradas" class="text-sm text-muted mt-1">Total: ${formatarMoeda(0)}</p>
        </div>
        <button id="botao-nova-entrada" class="btn-primary">
          + Nova entrada
        </button>
      </div>

      <form id="form-entrada" class="hidden card p-4 mb-4 space-y-3">
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
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Categoria</label>
            <select id="input-categoria" class="form-input">
              <option value="">Carregando...</option>
            </select>
          </div>
          <div>
            <label class="form-label">Onde está</label>
            <select id="input-local" class="form-input">
              <option value="">Carregando...</option>
            </select>
          </div>
        </div>
        <div id="grupo-membro" class="hidden">
          <label class="form-label">Membro</label>
          <select id="input-membro" class="form-input"></select>
        </div>
        <input type="hidden" id="input-id-edicao" />
        <div class="flex gap-2 justify-end pt-1">
          <button type="button" id="botao-cancelar-entrada" class="btn-text">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>

      ${htmlNavegadorMes()}

      <div id="lista-entradas" class="space-y-2">
        <p class="text-sm text-muted text-center py-6">Carregando...</p>
      </div>
    </div>
  `;

  const { ehGestor, abrirParaEdicao, pararCategorias, pararLocais } = await iniciarFormulario(usuario);
  const pararEscuta = escutarEntradas(usuario, ehGestor, abrirParaEdicao);

  return () => {
    pararEscuta();
    pararCategorias();
    pararLocais();
  };
}

// 005 - Busca os membros da família (consulta a coleção "usuarios" pelo familiaId) para o seletor do
// formulário (visível só para Pro/Master). Garante que o próprio usuário logado sempre apareça como opção.
async function buscarMembros(usuario) {
  const consulta = query(collection(db, "usuarios"), where("familiaId", "==", usuario.familiaId));
  const snapshot = await getDocs(consulta);
  const membros = snapshot.docs.map((d) => ({ uid: d.id, nome: d.data().nomeExibicao || "Membro" }));

  if (!membros.some((m) => m.uid === usuario.uid)) {
    membros.unshift({ uid: usuario.uid, nome: usuario.nomeExibicao || "Você" });
  }

  // 005.1 - O próprio usuário logado sempre aparece primeiro na lista (pré-selecionado)
  return comUsuarioPrimeiro(membros, usuario.uid);
}

// 006 - Prepara o formulário: exibe/oculta o seletor de membro, liga abrir/cancelar e o envio (criar/editar)
async function iniciarFormulario(usuario) {
  const form = document.getElementById("form-entrada");
  const botaoNova = document.getElementById("botao-nova-entrada");
  const botaoCancelar = document.getElementById("botao-cancelar-entrada");
  const grupoMembro = document.getElementById("grupo-membro");
  const selectMembro = document.getElementById("input-membro");
  const inputDescricao = document.getElementById("input-descricao");
  const inputValor = document.getElementById("input-valor");
  const inputData = document.getElementById("input-data");
  const inputCategoria = document.getElementById("input-categoria");
  const inputLocal = document.getElementById("input-local");
  const inputIdEdicao = document.getElementById("input-id-edicao");

  const ehGestor = usuario.nivel === "pro" || usuario.nivel === "master";
  let membros = [];

  if (ehGestor) {
    membros = await buscarMembros(usuario);
    grupoMembro.classList.remove("hidden");
    selectMembro.innerHTML = membros.map((m) => `<option value="${m.uid}">${m.nome}</option>`).join("");
  }

  // 006.2 - Máscara de moeda no valor e atalho de Enter no calendário
  aplicarMascaraMoeda(inputValor);
  habilitarAtalhoCalendario(inputData);

  // 006.1 - Preenche o seletor de categoria a partir do cadastro gerenciável (Painel Master → Categorias)
  let categorias = [];
  const pararCategorias = escutarCategorias("entrada", (lista) => {
    categorias = lista;
    inputCategoria.innerHTML =
      lista.map((c) => `<option value="${c.nome}">${c.nome}</option>`).join("") ||
      `<option value="">Nenhuma cadastrada</option>`;
  });

  // 006.3 - Preenche o seletor de "onde está o dinheiro" (Painel Master → Categorias)
  let locais = [];
  const pararLocais = escutarCategorias("local", (lista) => {
    locais = lista;
    inputLocal.innerHTML =
      lista.map((l) => `<option value="${l.nome}">${l.nome}</option>`).join("") ||
      `<option value="">Nenhum cadastrado</option>`;
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

  // 007 - Preenche o formulário com os dados de uma entrada existente para edição
  function abrirParaEdicao(entrada) {
    abrirFormulario();
    inputIdEdicao.value = entrada.id;
    inputDescricao.value = entrada.descricao;
    inputValor.value = numeroParaValorMoeda(entrada.valor);
    inputData.value = entrada.data;
    inputCategoria.value = entrada.categoria || categorias[categorias.length - 1]?.nome || "";
    inputLocal.value = entrada.local || locais[0]?.nome || "";
    if (ehGestor) selectMembro.value = entrada.membroId;
  }

  botaoNova.addEventListener("click", abrirFormulario);
  botaoCancelar.addEventListener("click", fecharFormulario);

  // 008 - Trata o envio do formulário: cria uma nova entrada ou atualiza uma existente
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const dados = {
      descricao: inputDescricao.value.trim(),
      valor: valorMoedaParaNumero(inputValor.value),
      data: inputData.value,
      categoria: inputCategoria.value,
      local: inputLocal.value,
      membroId: ehGestor ? selectMembro.value : usuario.uid,
      membroNome: ehGestor
        ? membros.find((m) => m.uid === selectMembro.value)?.nome || "Membro"
        : usuario.nomeExibicao || "Você",
    };

    const referenciaColecao = collection(db, "familias", usuario.familiaId, "entradas");

    if (inputIdEdicao.value) {
      await updateDoc(doc(referenciaColecao, inputIdEdicao.value), dados);
    } else {
      await addDoc(referenciaColecao, { ...dados, criadoEm: serverTimestamp() });
    }

    fecharFormulario();
  });

  return { ehGestor, abrirParaEdicao, pararCategorias, pararLocais };
}

// 009 - Escuta em tempo real as entradas da família (ou só as do próprio usuário, se "simples"),
// controla a navegação por mês, atualiza o total e renderiza a lista filtrada.
// Retorna a função de cancelamento do listener.
function escutarEntradas(usuario, ehGestor, abrirParaEdicao) {
  const referenciaColecao = collection(db, "familias", usuario.familiaId, "entradas");

  // 010 - Sem orderBy na consulta (evita exigir índice composto); a ordenação é feita em memória
  const consulta =
    usuario.nivel === "simples" ? query(referenciaColecao, where("membroId", "==", usuario.uid)) : referenciaColecao;

  const lista = document.getElementById("lista-entradas");
  const totalTexto = document.getElementById("total-entradas");

  let mesSelecionado = new Date().toISOString().slice(0, 7);
  let ultimasEntradas = [];

  function renderizar() {
    const entradasDoMes = ultimasEntradas
      .filter((entrada) => (entrada.data || "").startsWith(mesSelecionado))
      .sort((a, b) => (a.data < b.data ? 1 : -1));

    const total = entradasDoMes.reduce((soma, entrada) => soma + Number(entrada.valor || 0), 0);
    const quantidade = entradasDoMes.length;
    totalTexto.textContent = `Total: ${formatarMoeda(total)} · ${quantidade} ${quantidade === 1 ? "lançamento" : "lançamentos"}`;

    if (entradasDoMes.length === 0) {
      lista.innerHTML = `<p class="text-sm text-muted text-center py-6">Nenhuma entrada neste mês.</p>`;
      return;
    }

    lista.innerHTML = entradasDoMes.map((entrada) => cartaoEntrada(entrada, ehGestor)).join("");

    // 011 - Liga os botões de editar/excluir de cada cartão renderizado
    lista.querySelectorAll("[data-acao='editar']").forEach((botao) => {
      botao.addEventListener("click", () => {
        const entrada = entradasDoMes.find((e) => e.id === botao.dataset.id);
        if (entrada) abrirParaEdicao(entrada);
      });
    });

    lista.querySelectorAll("[data-acao='excluir']").forEach((botao) => {
      botao.addEventListener("click", async () => {
        if (confirm("Excluir esta entrada?")) {
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
    ultimasEntradas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderizar();
  });
}

// 012 - Gera o HTML de um cartão de entrada na lista
function cartaoEntrada(entrada, ehGestor) {
  return `
    <div class="card p-4 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="font-medium text-primary dark:text-white truncate">${entrada.descricao}</p>
        <p class="text-xs text-muted">
          ${formatarData(entrada.data)} · ${entrada.categoria || "Outros"}${entrada.local ? ` · ${entrada.local}` : ""}${ehGestor ? ` · ${entrada.membroNome || "Membro"}` : ""}
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span class="text-status-pago font-semibold">${formatarMoeda(entrada.valor)}</span>
        <button data-acao="editar" data-id="${entrada.id}" class="text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-white p-1" aria-label="Editar">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828z" />
          </svg>
        </button>
        <button data-acao="excluir" data-id="${entrada.id}" class="text-gray-400 dark:text-gray-500 hover:text-status-atrasado p-1" aria-label="Excluir">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  `;
}
