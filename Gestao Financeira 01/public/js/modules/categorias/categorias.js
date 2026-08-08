// 001 - Importa funções do Firestore via CDN e a instância compartilhada (db).
// Categorias são globais (não pertencem a uma família específica) e gerenciadas só pelo Master.
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../../core/firebase.js";

const referenciaColecao = collection(db, "categorias");

// 002 - Conjunto inicial de categorias, usado só pelo botão "Criar categorias padrão"
// quando a coleção ainda está vazia (não é mais fixo no código do restante do sistema).
const PADRAO = {
  entrada: ["Salário", "Serviços Externos", "Vale Alimentação/Refeição", "Bônus", "Adiantamento Salarial", "Outros"],
  saida: ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Financiamento", "Empréstimo", "Cartão de Crédito", "Outros"],
  mercado: ["Café", "Açúcar", "Bolacha", "Hortifruti", "Limpeza", "Higiene", "Bebidas", "Outros"],
  local: ["Dinheiro", "Banco do Brasil", "Santander", "Nubank", "Itaú", "Bradesco", "Caixa", "Outro"],
};

// 002.1 - Contas a Pagar usa a MESMA lista de categorias de Saídas (facilita organizar os indicadores depois)
const ROTULOS_TIPO = {
  entrada: "Entradas",
  saida: "Saídas / Contas a Pagar",
  mercado: "Lista de Mercado",
  local: "Onde está o dinheiro",
};

// 003 - Escuta em tempo real as categorias de um tipo ("entrada", "saida" ou "mercado").
// Usado pelos módulos de Entradas e Saídas para preencher o seletor de categoria.
export function escutarCategorias(tipo, aoAtualizar) {
  return onSnapshot(referenciaColecao, (snapshot) => {
    const categorias = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => c.tipo === tipo)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    aoAtualizar(categorias);
  });
}

// 004 - Monta a seção de gestão de Categorias (Painel Master): adicionar, editar e excluir.
// Retorna a função de desmontagem (cancela o listener do Firestore).
export function montarCategorias(container) {
  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-base heading-primary">Categorias</h2>
        <button data-acao="nova-categoria" class="btn-primary text-sm px-3 py-1.5">+ Nova categoria</button>
      </div>

      <form data-form-categoria class="hidden card p-4 space-y-3">
        <div>
          <label class="form-label">Nome</label>
          <input data-campo="nome" type="text" required class="form-input" />
        </div>
        <div>
          <label class="form-label">Usada em</label>
          <select data-campo="tipo" class="form-input">
            <option value="entrada">Entradas</option>
            <option value="saida">Saídas / Contas a Pagar</option>
            <option value="mercado">Lista de Mercado</option>
            <option value="local">Onde está o dinheiro</option>
          </select>
        </div>
        <input type="hidden" data-campo="id-edicao" />
        <div class="flex gap-2 justify-end pt-1">
          <button type="button" data-acao="cancelar-categoria" class="btn-text">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>

      <div data-lista-categorias class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <p class="text-sm text-muted text-center py-4">Carregando...</p>
      </div>
    </div>
  `;

  const botaoNova = container.querySelector("[data-acao='nova-categoria']");
  const botaoCancelar = container.querySelector("[data-acao='cancelar-categoria']");
  const form = container.querySelector("[data-form-categoria]");
  const campoNome = form.querySelector("[data-campo='nome']");
  const campoTipo = form.querySelector("[data-campo='tipo']");
  const campoIdEdicao = form.querySelector("[data-campo='id-edicao']");
  const lista = container.querySelector("[data-lista-categorias]");

  function abrirParaCriacao() {
    form.reset();
    campoIdEdicao.value = "";
    form.classList.remove("hidden");
  }

  function abrirParaEdicao(categoria) {
    form.reset();
    campoIdEdicao.value = categoria.id;
    campoNome.value = categoria.nome;
    campoTipo.value = categoria.tipo;
    form.classList.remove("hidden");
  }

  function fecharFormulario() {
    form.classList.add("hidden");
  }

  botaoNova.addEventListener("click", abrirParaCriacao);
  botaoCancelar.addEventListener("click", fecharFormulario);

  // 005 - Cria uma categoria nova, todas de uma vez, a partir da lista padrão (só quando a coleção está vazia)
  async function criarCategoriasPadrao() {
    const tarefas = [];
    Object.entries(PADRAO).forEach(([tipo, nomes]) => {
      nomes.forEach((nome) => tarefas.push(addDoc(referenciaColecao, { nome, tipo })));
    });
    await Promise.all(tarefas);
  }

  // 006 - Envio do formulário: cria uma nova categoria ou atualiza uma existente
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = { nome: campoNome.value.trim(), tipo: campoTipo.value };

    if (campoIdEdicao.value) {
      await updateDoc(doc(referenciaColecao, campoIdEdicao.value), dados);
    } else {
      await addDoc(referenciaColecao, dados);
    }

    fecharFormulario();
  });

  // 007 - Escuta em tempo real todas as categorias e renderiza agrupadas por tipo.
  // 007.1 - Migração automática: categorias antigas do tipo "conta" (Contas a Pagar tinha lista própria)
  // agora viram "saida", já que as duas telas passaram a compartilhar a mesma lista.
  return onSnapshot(referenciaColecao, (snapshot) => {
    const categorias = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    const antigasTipoConta = categorias.filter((c) => c.tipo === "conta");
    if (antigasTipoConta.length > 0) {
      antigasTipoConta.forEach((c) => updateDoc(doc(referenciaColecao, c.id), { tipo: "saida" }));
      return;
    }

    if (categorias.length === 0) {
      lista.innerHTML = `
        <div class="sm:col-span-2 lg:col-span-4 text-center py-4">
          <p class="text-sm text-muted mb-3">Nenhuma categoria cadastrada ainda.</p>
          <button data-acao="criar-padrao" class="btn-primary text-sm px-3 py-1.5">Criar categorias padrão</button>
        </div>
      `;
      lista.querySelector("[data-acao='criar-padrao']").addEventListener("click", criarCategoriasPadrao);
      return;
    }

    lista.innerHTML = Object.keys(ROTULOS_TIPO)
      .map((tipo) => {
        const itensDoTipo = categorias
          .filter((c) => c.tipo === tipo)
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

        return `
          <div>
            <h3 class="text-xs font-semibold text-muted uppercase mb-2">${ROTULOS_TIPO[tipo]}</h3>
            <div class="space-y-2">${itensDoTipo.map((c) => cartaoCategoria(c)).join("") || `<p class="text-sm text-muted">Nenhuma.</p>`}</div>
          </div>
        `;
      })
      .join("");

    lista.querySelectorAll("[data-acao='editar-categoria']").forEach((botao) => {
      botao.addEventListener("click", () => {
        const categoria = categorias.find((c) => c.id === botao.dataset.id);
        if (categoria) abrirParaEdicao(categoria);
      });
    });

    lista.querySelectorAll("[data-acao='excluir-categoria']").forEach((botao) => {
      botao.addEventListener("click", async () => {
        if (confirm("Excluir esta categoria?")) {
          await deleteDoc(doc(referenciaColecao, botao.dataset.id));
        }
      });
    });
  });
}

// 008 - Gera o HTML de um cartão de categoria na lista
function cartaoCategoria(categoria) {
  return `
    <div class="card p-3 flex items-center justify-between gap-2">
      <span class="text-sm text-primary dark:text-white">${categoria.nome}</span>
      <div class="flex items-center gap-1">
        <button data-acao="editar-categoria" data-id="${categoria.id}" class="text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-white p-1" aria-label="Editar">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828z" />
          </svg>
        </button>
        <button data-acao="excluir-categoria" data-id="${categoria.id}" class="text-gray-400 dark:text-gray-500 hover:text-status-atrasado p-1" aria-label="Excluir">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  `;
}
