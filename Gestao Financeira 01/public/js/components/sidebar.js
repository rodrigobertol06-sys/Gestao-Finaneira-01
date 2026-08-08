// 001 - Itens de navegação disponíveis, com ícone e controle de visibilidade por nível de acesso
const ITENS_MENU = [
  {
    rota: "dashboard",
    label: "Dashboard",
    niveis: ["simples", "pro", "master"],
    icone: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>`,
  },
  {
    rota: "entradas",
    label: "Entradas",
    niveis: ["simples", "pro", "master"],
    icone: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m0-16l-5 5m5-5l5 5" /></svg>`,
  },
  {
    rota: "saidas",
    label: "Saídas",
    niveis: ["simples", "pro", "master"],
    icone: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 20V4m0 16l-5-5m5 5l5-5" /></svg>`,
  },
  {
    rota: "contas",
    label: "Contas a Pagar",
    niveis: ["simples", "pro", "master"],
    icone: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" /></svg>`,
  },
  {
    rota: "carteiras",
    label: "Carteiras",
    niveis: ["simples", "pro", "master"],
    icone: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a2 2 0 00-2-2H5a2 2 0 00-2 2m18 0v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6m18 0V9a2 2 0 00-2-2H8l-3-3H5a2 2 0 00-2 2v6m14 3h.01" /></svg>`,
  },
  {
    rota: "mercado",
    label: "Lista de Mercado",
    niveis: ["simples", "pro", "master"],
    icone: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>`,
  },
  {
    rota: "membros",
    label: "Membros",
    niveis: ["pro"],
    icone: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-2.5-7.13" /></svg>`,
  },
  {
    rota: "admin",
    label: "Painel Master",
    niveis: ["master"],
    icone: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
  },
];

// 002 - Renderiza os links do menu lateral de acordo com o nível do usuário e o estado (recolhido ou não).
// Quando "recolhido" é true, mantém só os ícones e oculta o texto do rótulo.
export function renderizarSidebar(usuario, recolhido = false) {
  const sidebar = document.getElementById("sidebar-links");

  const itensVisiveis = ITENS_MENU.filter((item) => item.niveis.includes(usuario.nivel));

  sidebar.innerHTML = itensVisiveis
    .map(
      (item) => `
        <a href="#${item.rota}" data-rota="${item.rota}" title="${item.label}"
           class="flex items-center gap-3 px-4 py-3 rounded-lg text-white/70 hover:bg-primary-light hover:text-white transition-colors">
          ${item.icone}
          <span class="${recolhido ? "hidden" : ""} whitespace-nowrap">${item.label}</span>
        </a>
      `
    )
    .join("");
}
