// 001 - Importa a instância compartilhada do Firebase Auth e o helper de e-mail interno
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { auth } from "../core/firebase.js";
import { DOMINIO_INTERNO } from "../firebase-config.js";
import { registrarServiceWorker } from "../core/pwa.js";

// 002 - Referências aos elementos do formulário de login
const form = document.getElementById("form-login");
const inputUsuario = document.getElementById("input-usuario");
const inputSenha = document.getElementById("input-senha");
const mensagemErro = document.getElementById("mensagem-erro");
const botaoEntrar = document.getElementById("botao-entrar");

// 003 - Converte o nome de usuário digitado em um e-mail interno do Firebase Auth
function usuarioParaEmailInterno(usuario) {
  return `${usuario.trim().toLowerCase()}${DOMINIO_INTERNO}`;
}

// 004 - Trata o envio do formulário de login
form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mensagemErro.classList.add("hidden");
  botaoEntrar.disabled = true;
  botaoEntrar.textContent = "Entrando...";

  const emailInterno = usuarioParaEmailInterno(inputUsuario.value);

  try {
    // 005 - Autentica o usuário no Firebase usando o e-mail interno gerado
    await signInWithEmailAndPassword(auth, emailInterno, inputSenha.value);
    window.location.href = "app.html";
  } catch (erro) {
    // 006 - Exibe mensagem amigável em caso de usuário/senha inválidos
    mensagemErro.textContent = "Usuário ou senha inválidos.";
    mensagemErro.classList.remove("hidden");
    botaoEntrar.disabled = false;
    botaoEntrar.textContent = "Entrar";
  }
});

// 007 - Habilita o funcionamento como PWA também na tela de login
registrarServiceWorker();
