// 001 - Importa funções do Firestore via CDN, a instância compartilhada (db) e o criador de usuários
import {
  collection,
  query,
  where,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../../core/firebase.js";
import { criarUsuarioAuth } from "../../core/criar-usuario.js";

// 002 - Rótulos amigáveis para cada nível de acesso
const ROTULOS_NIVEL = { simples: "Simples", pro: "Pro", master: "Master" };

// 003 - Ponto de entrada da rota "#membros" (Pro): gerencia os membros da própria família
export function montarMembros(container, usuario) {
  if (!usuario.familiaId) {
    container.innerHTML = `
      <div class="p-6 text-center text-muted">Este usuário não está vinculado a uma família.</div>
    `;
    return undefined;
  }

  container.innerHTML = `<div class="p-4 sm:p-6 max-w-2xl mx-auto" data-area-membros></div>`;
  const area = container.querySelector("[data-area-membros]");

  return montarGerenciadorMembros(area, usuario.familiaId, ["simples", "pro"], usuario);
}

// 004 - Monta a gestão de membros de UMA família dentro do container informado.
// "niveisPermitidos" controla quais níveis podem ser atribuídos por quem está gerenciando
// (Pro só atribui Simples/Pro; Master pode atribuir qualquer nível, inclusive Master).
// Reaproveitado tanto pela rota "#membros" (Pro) quanto pelo Painel Master (por família).
// Retorna a função de desmontagem (cancela o listener do Firestore).
export function montarGerenciadorMembros(container, familiaId, niveisPermitidos, usuarioLogado) {
  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-base heading-primary">Membros da família</h2>
        <button data-acao="novo-membro" class="btn-primary text-sm px-3 py-1.5">
          + Adicionar membro
        </button>
      </div>

      <form data-form-membro autocomplete="off" class="hidden card p-4 space-y-3">
        <div>
          <label class="form-label">Nome de exibição</label>
          <input data-campo="nome" type="text" required autocomplete="off" class="form-input" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Usuário</label>
            <input data-campo="usuario" type="text" autocomplete="off" name="novo-membro-usuario" class="form-input" />
          </div>
          <div>
            <label class="form-label">Senha</label>
            <input data-campo="senha" type="password" minlength="6" autocomplete="new-password" name="novo-membro-senha" class="form-input" />
          </div>
        </div>
        <div>
          <label class="form-label">Nível de acesso</label>
          <select data-campo="nivel" class="form-input">
            ${niveisPermitidos.map((n) => `<option value="${n}">${ROTULOS_NIVEL[n]}</option>`).join("")}
          </select>
        </div>
        <input type="hidden" data-campo="uid-edicao" />
        <p data-erro-membro class="hidden text-sm text-status-atrasado"></p>
        <div class="flex gap-2 justify-end pt-1">
          <button type="button" data-acao="cancelar-membro" class="btn-text">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>

      <div data-lista-membros class="space-y-2">
        <p class="text-sm text-muted text-center py-4">Carregando...</p>
      </div>
    </div>
  `;

  return iniciar(container, familiaId, usuarioLogado);
}

// 005 - Liga formulário e lista de membros à instância deste gerenciador
function iniciar(container, familiaId, usuarioLogado) {
  const botaoNovo = container.querySelector("[data-acao='novo-membro']");
  const botaoCancelar = container.querySelector("[data-acao='cancelar-membro']");
  const form = container.querySelector("[data-form-membro]");
  const campoNome = form.querySelector("[data-campo='nome']");
  const campoUsuario = form.querySelector("[data-campo='usuario']");
  const campoSenha = form.querySelector("[data-campo='senha']");
  const campoNivel = form.querySelector("[data-campo='nivel']");
  const campoUidEdicao = form.querySelector("[data-campo='uid-edicao']");
  const erro = form.querySelector("[data-erro-membro]");
  const lista = container.querySelector("[data-lista-membros]");

  function abrirParaCriacao() {
    form.reset();
    campoUidEdicao.value = "";
    campoUsuario.disabled = false;
    campoUsuario.required = true;
    campoSenha.required = true;
    erro.classList.add("hidden");
    form.classList.remove("hidden");
  }

  // 006 - Preenche o formulário para editar um membro existente.
  // O usuário/e-mail não pode ser alterado por aqui, só nome de exibição e nível.
  function abrirParaEdicao(membro) {
    form.reset();
    campoUidEdicao.value = membro.id;
    campoNome.value = membro.nomeExibicao || "";
    campoUsuario.disabled = true;
    campoUsuario.required = false;
    campoSenha.required = false;
    campoNivel.value = membro.nivel;
    erro.classList.add("hidden");
    form.classList.remove("hidden");
  }

  function fecharFormulario() {
    form.classList.add("hidden");
  }

  botaoNovo.addEventListener("click", abrirParaCriacao);
  botaoCancelar.addEventListener("click", fecharFormulario);

  // 007 - Envio do formulário: cria um novo membro (Auth + Firestore) ou atualiza um existente (só Firestore)
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    erro.classList.add("hidden");

    try {
      if (campoUidEdicao.value) {
        await updateDoc(doc(db, "usuarios", campoUidEdicao.value), {
          nomeExibicao: campoNome.value.trim(),
          nivel: campoNivel.value,
        });
      } else {
        const novoUid = await criarUsuarioAuth(campoUsuario.value, campoSenha.value);
        await setDoc(doc(db, "usuarios", novoUid), {
          nomeExibicao: campoNome.value.trim(),
          nivel: campoNivel.value,
          familiaId,
        });
      }
      fecharFormulario();
    } catch (erroCriacao) {
      erro.textContent = traduzirErro(erroCriacao);
      erro.classList.remove("hidden");
    }
  });

  // 008 - Escuta em tempo real os membros da família (consulta a coleção "usuarios" pelo familiaId)
  const consulta = query(collection(db, "usuarios"), where("familiaId", "==", familiaId));

  return onSnapshot(consulta, (snapshot) => {
    const membros = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (membros.length === 0) {
      lista.innerHTML = `<p class="text-sm text-muted text-center py-4">Nenhum membro cadastrado ainda.</p>`;
      return;
    }

    lista.innerHTML = membros.map((membro) => cartaoMembro(membro, usuarioLogado)).join("");

    lista.querySelectorAll("[data-acao='editar-membro']").forEach((botao) => {
      botao.addEventListener("click", () => {
        const membro = membros.find((m) => m.id === botao.dataset.id);
        if (membro) abrirParaEdicao(membro);
      });
    });

    lista.querySelectorAll("[data-acao='remover-membro']").forEach((botao) => {
      botao.addEventListener("click", async () => {
        if (confirm("Remover o acesso deste membro ao sistema? A conta de login continua existindo, mas ele não conseguirá mais entrar.")) {
          await deleteDoc(doc(db, "usuarios", botao.dataset.id));
        }
      });
    });
  });
}

// 009 - Gera o HTML de um cartão de membro na lista
function cartaoMembro(membro, usuarioLogado) {
  const ehVoceMesmo = membro.id === usuarioLogado.uid;

  return `
    <div class="card p-4 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="font-medium text-primary dark:text-white truncate">${membro.nomeExibicao || "Sem nome"}</p>
        <p class="text-xs text-muted">${ROTULOS_NIVEL[membro.nivel] || membro.nivel}${ehVoceMesmo ? " · Você" : ""}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button data-acao="editar-membro" data-id="${membro.id}" class="text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-white p-1" aria-label="Editar">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828z" />
          </svg>
        </button>
        ${
          ehVoceMesmo
            ? ""
            : `<button data-acao="remover-membro" data-id="${membro.id}" class="text-gray-400 dark:text-gray-500 hover:text-status-atrasado p-1" aria-label="Remover acesso">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>`
        }
      </div>
    </div>
  `;
}

// 010 - Traduz erros comuns do Firebase Auth para mensagens amigáveis
function traduzirErro(erro) {
  const mapa = {
    "auth/email-already-in-use": "Esse nome de usuário já está em uso.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-email": "Nome de usuário inválido.",
  };
  return mapa[erro.code] || "Não foi possível salvar. Tente novamente.";
}
