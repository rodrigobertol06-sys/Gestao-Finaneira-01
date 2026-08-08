// 001 - Alterna entre os temas claro e escuro e salva a escolha (usado pelo botão na navbar).
// A aplicação do tema salvo ao carregar a página é feita por um script inline no <head>
// de index.html/app.html, para evitar um "flash" da cor errada antes do CSS carregar.
export function alternarTema() {
  const escuro = document.documentElement.classList.toggle("dark");
  localStorage.setItem("tema", escuro ? "dark" : "light");
}

// 002 - Indica se o tema escuro está ativo no momento (usado para escolher o ícone do botão)
export function temaEscuroAtivo() {
  return document.documentElement.classList.contains("dark");
}
