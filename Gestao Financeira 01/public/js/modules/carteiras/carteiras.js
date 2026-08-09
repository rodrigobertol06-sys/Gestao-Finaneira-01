// 001 - Importa funções do Firestore via CDN, a instância compartilhada (db) e utilitários do projeto
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
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
  habilitarAtalhoCalendario,
} from "../../core/utils.js";
import { escutarCategorias } from "../categorias/categorias.js";

// 002 - Monta a tela de Carteiras: saldo por carteira ("onde está o dinheiro") e transferência entre
// carteiras (um saque é só uma transferência com destino em "Dinheiro"). Toda transferência gera UM
// lançamento de Saída (na origem) e UM de Entrada (no destino), ligados por um "transferenciaId" —
// assim eles entram nos totais normais de Entradas/Saídas e no saldo geral, sem lançamento duplicado manual.
export async function montarCarteiras(container, usuario) {
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
      <div>
        <h1 class="text-lg heading-primary">Carteiras</h1>
        <p class="text-xs text-muted">
          ${ehGestor ? "Saldo de cada carteira da família." : "Saldo de cada carteira, considerando os seus lançamentos."}
        </p>
      </div>

      <div id="lista-saldos" class="grid grid-cols-2 gap-3">
        <p class="text-sm text-muted col-span-full text-center py-4">Carregando...</p>
      </div>

      <button id="botao-transferir" class="btn-primary w-full">Transferir entre carteiras</button>

      <form id="form-transferencia" class="hidden card p-4 space-y-3">
        <p class="form-label">Transferência entre carteiras</p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">De</label>
            <select id="input-origem" class="form-input">
              <option value="">Carregando...</option>
            </select>
          </div>
          <div>
            <label class="form-label">Para</label>
            <select id="input-destino" class="form-input">
              <option value="">Carregando...</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Valor (R$)</label>
            <input id="input-valor-transferencia" type="text" inputmode="decimal" placeholder="0,00" required class="form-input" />
          </div>
          <div>
            <label class="form-label">Data</label>
            <input id="input-data-transferencia" type="date" required class="form-input" />
          </div>
        </div>
        ${
          ehGestor
            ? `<div>
          <label class="form-label">Membro</label>
          <select id="input-membro-transferencia" class="form-input"></select>
        </div>`
            : ""
        }
        <div class="flex gap-2 justify-end pt-1">
          <button type="button" id="botao-cancelar-transferencia" class="btn-text">Cancelar</button>
          <button type="submit" class="btn-primary">Confirmar</button>
        </div>
      </form>

      <div>
        <h2 class="text-sm font-semibold text-primary dark:text-white mb-2">Histórico de transferências</h2>
        <div id="lista-transferencias" class="space-y-2">
          <p class="text-sm text-muted text-center py-4">Carregando...</p>
        </div>
      </div>
    </div>
  `;

  return iniciarCarteiras(usuario, ehGestor);
}

// 003 - Busca os membros da família para o seletor "Membro" (visível só para Pro/Master)
async function buscarMembros(usuario) {
  const consulta = query(collection(db, "usuarios"), where("familiaId", "==", usuario.familiaId));
  const snapshot = await getDocs(consulta);
  const membros = snapshot.docs.map((d) => ({ uid: d.id, nome: d.data().nomeExibicao || "Membro" }));

  if (!membros.some((m) => m.uid === usuario.uid)) {
    membros.unshift({ uid: usuario.uid, nome: usuario.nomeExibicao || "Você" });
  }

  return comUsuarioPrimeiro(membros, usuario.uid);
}

// 004 - Liga toda a interatividade: formulário de transferência/saque, cálculo do saldo por carteira
// e histórico. Simples só enxerga (e só afeta) os próprios lançamentos, como em Entradas/Saídas/Contas.
function iniciarCarteiras(usuario, ehGestor) {
  const listaSaldos = document.getElementById("lista-saldos");
  const botaoTransferir = document.getElementById("botao-transferir");
  const formTransferencia = document.getElementById("form-transferencia");
  const selectOrigem = document.getElementById("input-origem");
  const selectDestino = document.getElementById("input-destino");
  const inputValor = document.getElementById("input-valor-transferencia");
  const inputData = document.getElementById("input-data-transferencia");
  const selectMembro = ehGestor ? document.getElementById("input-membro-transferencia") : null;
  const botaoCancelar = document.getElementById("botao-cancelar-transferencia");
  const listaTransferencias = document.getElementById("lista-transferencias");

  aplicarMascaraMoeda(inputValor);
  habilitarAtalhoCalendario(inputData);

  let locais = [];
  let membros = [];
  let entradas = [];
  let saidas = [];
  let contas = [];

  // 005 - Preenche os seletores de carteira a partir do cadastro (Painel Master → Categorias → Onde está)
  const pararLocais = escutarCategorias("local", (lista) => {
    locais = lista;
    const opcoes = lista.map((l) => `<option value="${l.nome}">${l.nome}</option>`).join("");
    selectOrigem.innerHTML = opcoes || `<option value="">Nenhuma cadastrada</option>`;
    selectDestino.innerHTML = opcoes || `<option value="">Nenhuma cadastrada</option>`;
    atualizarSaldos();
  });

  buscarMembros(usuario).then((lista) => {
    membros = lista;
    if (selectMembro) selectMembro.innerHTML = membros.map((m) => `<option value="${m.uid}">${m.nome}</option>`).join("");
  });

  // 006 - Abre/fecha o formulário de transferência (um saque é só uma transferência com destino "Dinheiro")
  function abrirFormulario() {
    inputData.value = new Date().toISOString().slice(0, 10);
    formTransferencia.classList.remove("hidden");
    botaoTransferir.classList.add("hidden");
  }

  function fecharFormulario() {
    formTransferencia.reset();
    formTransferencia.classList.add("hidden");
    botaoTransferir.classList.remove("hidden");
  }

  botaoTransferir.addEventListener("click", abrirFormulario);
  botaoCancelar.addEventListener("click", fecharFormulario);

  // 007 - Confirma a transferência: grava uma Saída na origem e uma Entrada no destino,
  // ambas com o mesmo "transferenciaId" (para poder excluir as duas de uma vez depois)
  formTransferencia.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const origem = selectOrigem.value;
    const destino = selectDestino.value;

    if (!origem || !destino || origem === destino) {
      alert("Escolha carteiras de origem e destino diferentes.");
      return;
    }

    const valor = valorMoedaParaNumero(inputValor.value);
    const data = inputData.value;
    const membroId = ehGestor ? selectMembro.value : usuario.uid;
    const membroNome = membros.find((m) => m.uid === membroId)?.nome || usuario.nomeExibicao || "Você";
    const transferenciaId = doc(collection(db, "familias", usuario.familiaId, "saidas")).id;
    const descricao = `Transferência: ${origem} → ${destino}`;

    await addDoc(collection(db, "familias", usuario.familiaId, "saidas"), {
      descricao,
      valor,
      data,
      categoria: "Transferência",
      local: origem,
      destino,
      membroId,
      membroNome,
      transferenciaId,
      criadoEm: serverTimestamp(),
    });

    await addDoc(collection(db, "familias", usuario.familiaId, "entradas"), {
      descricao,
      valor,
      data,
      categoria: "Transferência",
      local: destino,
      origem,
      membroId,
      membroNome,
      transferenciaId,
      criadoEm: serverTimestamp(),
    });

    fecharFormulario();
  });

  // 008 - Consultas em tempo real: entradas, saídas e contas (Simples só vê os próprios lançamentos,
  // igual às outras telas). O saldo de cada carteira é entradas - saídas - pagamentos de contas.
  const refEntradas = collection(db, "familias", usuario.familiaId, "entradas");
  const refSaidas = collection(db, "familias", usuario.familiaId, "saidas");
  const refContas = collection(db, "familias", usuario.familiaId, "contas");

  const consultaEntradas =
    usuario.nivel === "simples" ? query(refEntradas, where("membroId", "==", usuario.uid)) : refEntradas;
  const consultaSaidas =
    usuario.nivel === "simples" ? query(refSaidas, where("membroId", "==", usuario.uid)) : refSaidas;
  const consultaContas =
    usuario.nivel === "simples" ? query(refContas, where("responsavelId", "==", usuario.uid)) : refContas;

  // 009 - Recalcula e exibe o saldo de cada carteira cadastrada
  function atualizarSaldos() {
    const saldosPorCarteira = {};
    locais.forEach((l) => {
      saldosPorCarteira[l.nome] = 0;
    });

    entradas.forEach((e) => {
      if (!e.local) return;
      saldosPorCarteira[e.local] = (saldosPorCarteira[e.local] || 0) + Number(e.valor || 0);
    });

    saidas.forEach((s) => {
      if (!s.local) return;
      saldosPorCarteira[s.local] = (saldosPorCarteira[s.local] || 0) - Number(s.valor || 0);
    });

    contas.forEach((c) => {
      (c.pagamentos || []).forEach((p) => {
        if (!p.local) return;
        saldosPorCarteira[p.local] = (saldosPorCarteira[p.local] || 0) - Number(p.valor || 0);
      });
    });

    const nomes = Object.keys(saldosPorCarteira);
    listaSaldos.innerHTML = nomes.length
      ? nomes
          .map(
            (nome) => `
              <div class="card p-4">
                <p class="text-xs text-muted">${nome}</p>
                <p class="text-lg font-semibold ${saldosPorCarteira[nome] < 0 ? "text-status-atrasado" : "text-primary dark:text-white"} mt-1">
                  ${formatarMoeda(saldosPorCarteira[nome])}
                </p>
              </div>
            `
          )
          .join("")
      : `<p class="text-sm text-muted col-span-full text-center py-4">Nenhuma carteira cadastrada ainda (Painel Master → Categorias).</p>`;
  }

  // 010 - Renderiza o histórico de transferências/saques (identificados pela categoria "Transferência"),
  // permitindo excluir os dois lançamentos (origem e destino) de uma vez
  function renderizarHistorico() {
    const transferencias = saidas
      .filter((s) => s.categoria === "Transferência")
      .sort((a, b) => (a.data < b.data ? 1 : -1));

    if (transferencias.length === 0) {
      listaTransferencias.innerHTML = `<p class="text-sm text-muted text-center py-4">Nenhuma transferência registrada ainda.</p>`;
      return;
    }

    listaTransferencias.innerHTML = transferencias
      .map(
        (t) => `
          <div class="card p-3 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-sm font-medium text-primary dark:text-white truncate">${t.local} → ${t.destino || "?"}</p>
              <p class="text-xs text-muted">${formatarData(t.data)}${ehGestor ? ` · ${t.membroNome || "Membro"}` : ""}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-sm font-semibold text-primary dark:text-white">${formatarMoeda(t.valor)}</span>
              <button data-acao="excluir-transferencia" data-id="${t.id}" data-transferencia="${t.transferenciaId || ""}" class="text-gray-400 dark:text-gray-500 hover:text-status-atrasado p-1" aria-label="Excluir">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        `
      )
      .join("");

    listaTransferencias.querySelectorAll("[data-acao='excluir-transferencia']").forEach((botao) => {
      botao.addEventListener("click", async () => {
        if (!confirm("Excluir esta transferência? Ela será removida das duas carteiras.")) return;

        await deleteDoc(doc(refSaidas, botao.dataset.id));

        const transferenciaId = botao.dataset.transferencia;
        const par = transferenciaId ? entradas.find((e) => e.transferenciaId === transferenciaId) : null;
        if (par) await deleteDoc(doc(refEntradas, par.id));
      });
    });
  }

  const pararEntradas = onSnapshot(consultaEntradas, (snapshot) => {
    entradas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    atualizarSaldos();
    renderizarHistorico();
  });

  const pararSaidas = onSnapshot(consultaSaidas, (snapshot) => {
    saidas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    atualizarSaldos();
    renderizarHistorico();
  });

  const pararContas = onSnapshot(consultaContas, (snapshot) => {
    contas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    atualizarSaldos();
  });

  return () => {
    pararLocais();
    pararEntradas();
    pararSaidas();
    pararContas();
  };
}
