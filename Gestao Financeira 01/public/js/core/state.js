// 001 - Estado global simples, em memória, do usuário autenticado
const state = {
  currentUser: null, // { uid, username, nivel, familiaId, nomeExibicao }
};

// 002 - Define o usuário atual após login e leitura do Firestore
export function setCurrentUser(user) {
  state.currentUser = user;
}

// 003 - Retorna o usuário atualmente autenticado
export function getCurrentUser() {
  return state.currentUser;
}

// 004 - Limpa o estado (usado no logout)
export function clearCurrentUser() {
  state.currentUser = null;
}
