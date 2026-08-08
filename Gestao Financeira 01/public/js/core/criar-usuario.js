// 001 - Importa Firebase App e Auth via CDN (independente do app padrão, ver 002)
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { firebaseConfig, DOMINIO_INTERNO } from "../firebase-config.js";

// 002 - Cria um novo usuário no Firebase Auth usando uma instância SECUNDÁRIA e temporária do app.
// Isso é necessário porque criar um usuário no app padrão automaticamente loga como ele,
// o que derrubaria a sessão de quem está criando (Master ou Pro). Ao final, a instância
// secundária é destruída e a sessão original permanece intacta.
export async function criarUsuarioAuth(nomeUsuario, senha) {
  const email = `${nomeUsuario.trim().toLowerCase()}${DOMINIO_INTERNO}`;
  const appSecundario = initializeApp(firebaseConfig, `secundario-${Date.now()}`);
  const authSecundario = getAuth(appSecundario);

  try {
    const credencial = await createUserWithEmailAndPassword(authSecundario, email, senha);
    await signOut(authSecundario);
    return credencial.user.uid;
  } finally {
    await deleteApp(appSecundario);
  }
}
