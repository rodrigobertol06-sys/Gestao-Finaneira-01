// 001 - Registra o Service Worker, habilitando cache offline básico e instalação como PWA
export function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((erro) => {
      console.warn("Falha ao registrar o Service Worker:", erro);
    });
  });
}
