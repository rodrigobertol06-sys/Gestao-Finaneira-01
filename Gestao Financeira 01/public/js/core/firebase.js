// 001 - Inicializa o Firebase App UMA ÚNICA VEZ e exporta as instâncias compartilhadas.
// Todo o resto do projeto deve importar "auth" e "db" daqui, em vez de chamar
// initializeApp() de novo em cada arquivo (chamar mais de uma vez para o app
// padrão gera o erro "Firebase App named '[DEFAULT]' already exists").
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
