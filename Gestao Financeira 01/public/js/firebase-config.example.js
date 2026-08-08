// 001 - Template de configuração do Firebase.
// Copie este arquivo para "firebase-config.js" (mesma pasta) e preencha com os
// dados reais do seu projeto: Firebase Console > Configurações do Projeto > Seus Apps.
// O arquivo "firebase-config.js" é ignorado pelo git (.gitignore) por conter dados do projeto.

export const firebaseConfig = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
};

// 002 - Domínio interno usado para transformar "usuário" em "e-mail" do Firebase Auth
export const DOMINIO_INTERNO = "@gestaofamiliar.app";
