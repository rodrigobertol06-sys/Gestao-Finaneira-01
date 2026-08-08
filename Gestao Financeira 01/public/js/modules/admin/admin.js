// 001 - Importa funções do Firestore via CDN, a instância compartilhada (db) e o gerenciador de membros
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../../core/firebase.js";
import { montarGerenciadorMembros } from "../membros/membros.js";
import { montarCategorias } from "../categorias/categorias.js";

// 002 - Gera um identificador (slug) simples a partir do nome da família, ex: "Família Bertol" -> "familia-bertol"
function gerarSlug(nome) {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// 003 - Monta o Painel Master: criação de famílias, ativar/desativar, e gestão dos membros de cada uma
export function montarAdmin(container, usuario) {
  container.innerHTML = `
    <div class="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 class="text-lg heading-primary mb-3">Painel Master · Famílias</h1>
        <form data-form-familia class="card p-4 flex flex-col sm:flex-row gap-2 sm:items-end">
          <div class="flex-1">
            <label class="form-label">Nome da nova família</label>
            <input data-campo="nome-familia" type="text" required class="form-input" />
          </div>
          <button type="submit" class="btn-primary">
            Criar família
          </button>
        </form>
      </div>

      <div data-lista-familias class="space-y-3">
        <p class="text-sm text-muted text-center py-4">Carregando...</p>
      </div>

      <div data-area-categorias class="pt-2 border-t border-gray-200 dark:border-white/10"></div>
    </div>
  `;

  const formFamilia = container.querySelector("[data-form-familia]");
  const campoNomeFamilia = formFamilia.querySelector("[data-campo='nome-familia']");
  const listaFamilias = container.querySelector("[data-lista-familias]");

  // 003.1 - Monta a seção de Categorias junto (tem seu próprio listener/desmontagem)
  const pararCategorias = montarCategorias(container.querySelector("[data-area-categorias]"));

  // 004 - Cria uma nova família com um id (slug) derivado do nome, evitando colisão simples
  formFamilia.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const nome = campoNomeFamilia.value.trim();
    let id = gerarSlug(nome) || `familia-${Date.now()}`;

    const existente = await getDoc(doc(db, "familias", id));
    if (existente.exists()) {
      id = `${id}-${Math.floor(Math.random() * 1000)}`;
    }

    await setDoc(doc(db, "familias", id), { nome, status: "ativo" });
    formFamilia.reset();
  });

  let desmontarMembrosAtual = null;

  // 005 - Escuta em tempo real a lista de famílias cadastradas no sistema.
  // A desmontagem combina esse listener com o da seção de Categorias.
  const pararFamilias = onSnapshot(collection(db, "familias"), (snapshot) => {
    // 006 - A lista inteira será recriada: encerra o painel de membros aberto (se houver) antes de perdê-lo
    if (desmontarMembrosAtual) {
      desmontarMembrosAtual();
      desmontarMembrosAtual = null;
    }

    const familias = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (familias.length === 0) {
      listaFamilias.innerHTML = `<p class="text-sm text-muted text-center py-4">Nenhuma família cadastrada ainda.</p>`;
      return;
    }

    listaFamilias.innerHTML = familias.map((familia) => cartaoFamilia(familia)).join("");

    listaFamilias.querySelectorAll("[data-acao='alternar-status']").forEach((botao) => {
      botao.addEventListener("click", async () => {
        const novoStatus = botao.dataset.status === "ativo" ? "inativo" : "ativo";
        await updateDoc(doc(db, "familias", botao.dataset.id), { status: novoStatus });
      });
    });

    // 007 - Abre/fecha o painel de gestão de membros de uma família específica
    listaFamilias.querySelectorAll("[data-acao='abrir-membros']").forEach((botao) => {
      botao.addEventListener("click", () => {
        const areaMembros = listaFamilias.querySelector(`[data-area-membros="${botao.dataset.id}"]`);
        const jaAberta = !areaMembros.classList.contains("hidden");

        if (desmontarMembrosAtual) {
          desmontarMembrosAtual();
          desmontarMembrosAtual = null;
        }

        listaFamilias.querySelectorAll("[data-area-membros]").forEach((el) => el.classList.add("hidden"));

        if (!jaAberta) {
          areaMembros.classList.remove("hidden");
          desmontarMembrosAtual = montarGerenciadorMembros(
            areaMembros,
            botao.dataset.id,
            ["simples", "pro", "master"],
            usuario
          );
        }
      });
    });
  });

  // 008 - Desmonta os dois listeners (Famílias e Categorias) ao sair da tela
  return () => {
    pararFamilias();
    pararCategorias();
    if (desmontarMembrosAtual) desmontarMembrosAtual();
  };
}

// 009 - Gera o HTML de um cartão de família na lista
function cartaoFamilia(familia) {
  const ativa = familia.status === "ativo";

  return `
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-medium text-primary dark:text-white truncate">${familia.nome}</p>
          <p class="text-xs text-muted">
            ${familia.id} · <span class="${ativa ? "text-status-pago" : "text-status-atrasado"}">${familia.status}</span>
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button data-acao="alternar-status" data-id="${familia.id}" data-status="${familia.status}"
                  class="text-xs font-semibold text-primary dark:text-white hover:text-primary-light px-2 py-1">
            ${ativa ? "Desativar" : "Ativar"}
          </button>
          <button data-acao="abrir-membros" data-id="${familia.id}" class="btn-primary text-xs px-3 py-1.5">
            Membros
          </button>
        </div>
      </div>
      <div data-area-membros="${familia.id}" class="mt-3 hidden"></div>
    </div>
  `;
}
