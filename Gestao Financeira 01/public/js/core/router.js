// 001 - Importa os módulos reais já implementados
import { montarDashboard } from "../modules/dashboard/dashboard.js";
import { montarEntradas } from "../modules/entradas/entradas.js";
import { montarSaidas } from "../modules/saidas/saidas.js";
import { montarContas } from "../modules/contas/contas.js";
import { montarCarteiras } from "../modules/carteiras/carteiras.js";
import { montarMercado } from "../modules/mercado/mercado.js";
import { montarMembros } from "../modules/membros/membros.js";
import { montarAdmin } from "../modules/admin/admin.js";

// 002 - Mapeamento das rotas (hash) para funções que montam cada módulo na tela.
// Cada função recebe (container, usuario) e pode devolver uma função de "desmontagem"
// (ex: cancelar um listener do Firestore), chamada automaticamente ao trocar de rota.
const rotas = {
  dashboard: montarDashboard,
  entradas: montarEntradas,
  saidas: montarSaidas,
  contas: montarContas,
  carteiras: montarCarteiras,
  mercado: montarMercado,
  membros: montarMembros,
  admin: montarAdmin,
};

// 003 - Restringe rotas a níveis de acesso específicos. Rotas ausentes daqui ficam liberadas a todos.
const NIVEIS_POR_ROTA = {
  admin: ["master"],
  membros: ["pro"],
};

// 004 - Marca visualmente o item de menu correspondente à rota ativa.
// Exportada à parte para poder ser reaplicada depois de recolher/expandir o menu lateral.
export function destacarRotaAtiva() {
  const nomeRota = window.location.hash.replace("#", "") || "dashboard";

  document.querySelectorAll("[data-rota]").forEach((link) => {
    const ativo = link.dataset.rota === nomeRota;
    link.classList.toggle("bg-primary-light", ativo);
    link.classList.toggle("text-white", ativo);
  });
}

// 005 - Inicializa o roteador: escuta mudanças de hash, desmonta a rota anterior e monta a nova
export function iniciarRouter(usuario) {
  const conteudo = document.getElementById("conteudo-principal");
  const barraVoltar = document.getElementById("barra-voltar");
  const botaoVoltar = document.getElementById("botao-voltar");
  let desmontarAtual = null;

  // 007 - O botão "Voltar" usa o histórico do navegador: cada troca de hash gera uma entrada,
  // então voltar sempre leva exatamente para a tela vista anteriormente
  botaoVoltar.addEventListener("click", () => window.history.back());

  async function renderizarRotaAtual() {
    const nomeRota = window.location.hash.replace("#", "") || "dashboard";

    // 008 - Bloqueia acesso a rotas restritas para níveis não autorizados
    const niveisPermitidos = NIVEIS_POR_ROTA[nomeRota];
    if (niveisPermitidos && !niveisPermitidos.includes(usuario.nivel)) {
      window.location.hash = "#dashboard";
      return;
    }

    // 009 - Desmonta a tela anterior (ex: cancela listener do Firestore) antes de trocar
    if (typeof desmontarAtual === "function") {
      desmontarAtual();
      desmontarAtual = null;
    }

    // 010 - A barra "Voltar" só faz sentido fora da tela inicial (Dashboard)
    barraVoltar.classList.toggle("hidden", nomeRota === "dashboard");

    const montar = rotas[nomeRota] || rotas.dashboard;
    conteudo.innerHTML = "";
    desmontarAtual = await montar(conteudo, usuario);
    destacarRotaAtiva();
  }

  window.addEventListener("hashchange", renderizarRotaAtual);
  renderizarRotaAtual();
}
