// 001 - Importa funções do Firebase Auth/Firestore e a instância compartilhada (auth, db)
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { auth, db } from "../core/firebase.js";
import { setCurrentUser, clearCurrentUser } from "../core/state.js";

// 002 - Protege a tela atual: redireciona para o login se não houver usuário autenticado.
// Retorna uma Promise que resolve com os dados do usuário (uid, nivel, familiaId, nomeExibicao).
export function protegerTela() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }

      // 003 - Busca os dados complementares do usuário (nível de acesso e família) no Firestore
      const referenciaUsuario = doc(db, "usuarios", user.uid);
      const snapshotUsuario = await getDoc(referenciaUsuario);

      if (!snapshotUsuario.exists()) {
        // 004 - Usuário autenticado mas sem cadastro em "usuarios": bloqueia o acesso
        await signOut(auth);
        window.location.href = "index.html";
        return;
      }

      const dadosUsuario = {
        uid: user.uid,
        ...snapshotUsuario.data(),
      };

      setCurrentUser(dadosUsuario);
      resolve(dadosUsuario);
    });
  });
}

// 005 - Encerra a sessão do usuário e volta para a tela de login
export async function sair() {
  await signOut(auth);
  clearCurrentUser();
  window.location.href = "index.html";
}
