// 001 - Renderiza a barra superior (navbar): menu mobile, recolher menu (desktop), marca/início
// (logo clicável), alternância de tema, nome/nível do usuário e botão de sair
import { alternarTema, temaEscuroAtivo } from "../core/tema.js";

export function renderizarNavbar(usuario, aoClicarMenu, aoRecolher, aoSair) {
  const navbar = document.getElementById("navbar");

  navbar.innerHTML = `
    <div class="flex items-center justify-between h-14 px-4">
      <div class="flex items-center gap-3">
        <button id="botao-menu" class="lg:hidden text-white" aria-label="Abrir menu">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <!-- 002 - Botão de recolher/expandir o menu lateral, visível apenas em telas grandes -->
        <button id="botao-recolher" class="hidden lg:inline-flex text-white/80 hover:text-white" aria-label="Recolher menu">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>

        <!-- 003 - Marca do app: logo (câmbio/fluxo financeiro) + nome, clicável para voltar ao início -->
        <a href="#dashboard" class="flex items-center gap-2" aria-label="Voltar ao início">
          <span class="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center text-white shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4.5 12a7.5 7.5 0 0113-5M19.5 12a7.5 7.5 0 01-13 5" />
              <path d="M17 4.5v3h-3M7 19.5v-3h3" />
              <path d="M12 7.5v9" />
              <path d="M14 9.8c0-1-.9-1.8-2-1.8s-2 .8-2 1.8.9 1.5 2 1.5 2 .5 2 1.5-.9 1.8-2 1.8-2-.8-2-1.8" stroke-width="1.3" />
            </svg>
          </span>
          <span class="text-white font-semibold">Gestão Financeira</span>
        </a>
      </div>

      <!-- 004 - Grupo do canto superior direito: tema, usuário e sair -->
      <div class="flex items-center gap-4">
        <button id="botao-tema" class="text-white/80 hover:text-white" aria-label="Alternar tema">${iconeTema()}</button>
        <span class="hidden sm:inline text-white/80 text-sm">${usuario.nomeExibicao} · ${formatarNivel(usuario.nivel)}</span>
        <button id="botao-sair" class="text-white/80 hover:text-white text-sm">Sair</button>
      </div>
    </div>
  `;

  // 005 - Liga os eventos de clique: menu mobile, recolher (desktop), tema e sair
  document.getElementById("botao-menu").addEventListener("click", aoClicarMenu);
  document.getElementById("botao-recolher").addEventListener("click", aoRecolher);
  document.getElementById("botao-sair").addEventListener("click", aoSair);

  const botaoTema = document.getElementById("botao-tema");
  botaoTema.addEventListener("click", () => {
    alternarTema();
    botaoTema.innerHTML = iconeTema();
  });
}

// 006 - Ícone do botão de tema: mostra o sol/lua representando para ONDE o clique leva
// (lua = "clique para escurecer", sol = "clique para clarear")
function iconeTema() {
  return temaEscuroAtivo()
    ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>`;
}

// 007 - Traduz o nível técnico do usuário para um rótulo amigável na interface
function formatarNivel(nivel) {
  const rotulos = { simples: "Simples", pro: "Pro", master: "Master" };
  return rotulos[nivel] || nivel;
}
