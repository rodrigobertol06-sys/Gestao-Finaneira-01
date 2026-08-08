// 001 - Ponto de entrada do shell autenticado: protege a tela, monta navbar/sidebar e inicia o router
import { protegerTela, sair } from "./auth/auth-guard.js";
import { renderizarNavbar } from "./components/navbar.js";
import { renderizarSidebar } from "./components/sidebar.js";
import { iniciarRouter, destacarRotaAtiva } from "./core/router.js";
import { registrarServiceWorker } from "./core/pwa.js";

// 002 - Aguarda a confirmação de autenticação antes de montar a interface
const usuario = await protegerTela();

// 003 - Referências dos elementos do shell usados nos controles de menu.
// "area-conteudo" é quem recebe o deslocamento (padding) do menu lateral, não mais o "conteudo-principal".
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay-menu");
const areaConteudo = document.getElementById("area-conteudo");

// 004 - Controla a abertura/fechamento do menu lateral no mobile (drawer)
function alternarMenu() {
  sidebar.classList.toggle("-translate-x-full");
  overlay.classList.toggle("hidden");
}

// 005 - Controla o recolher/expandir do menu lateral em telas grandes (desktop).
// O botão que dispara isso agora fica na navbar (ver components/navbar.js).
let sidebarRecolhida = false;

function alternarRecolher() {
  sidebarRecolhida = !sidebarRecolhida;

  sidebar.classList.toggle("w-64", !sidebarRecolhida);
  sidebar.classList.toggle("w-20", sidebarRecolhida);
  areaConteudo.classList.toggle("lg:pl-64", !sidebarRecolhida);
  areaConteudo.classList.toggle("lg:pl-20", sidebarRecolhida);

  renderizarSidebar(usuario, sidebarRecolhida);
  destacarRotaAtiva();
}

overlay.addEventListener("click", alternarMenu);

// 006 - Renderiza navbar (já liga o clique do botão de recolher internamente) e sidebar
renderizarNavbar(usuario, alternarMenu, alternarRecolher, sair);
renderizarSidebar(usuario, sidebarRecolhida);

// 007 - Inicia a navegação entre módulos e habilita o funcionamento como PWA
iniciarRouter(usuario);
registrarServiceWorker();
