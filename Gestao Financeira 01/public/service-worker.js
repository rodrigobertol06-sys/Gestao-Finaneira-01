// 001 - Nome/versão do cache; incremente ao alterar a lista de arquivos essenciais
const CACHE_NOME = "gestao-financeira-v1";

// 002 - Arquivos estáticos essenciais para o funcionamento offline básico
const ARQUIVOS_ESSENCIAIS = ["index.html", "app.html", "css/output.css", "manifest.json"];

// 003 - Na instalação, armazena em cache os arquivos essenciais
self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE_NOME).then((cache) => cache.addAll(ARQUIVOS_ESSENCIAIS)));
  self.skipWaiting();
});

// 004 - Na ativação, remove caches de versões antigas do app
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((chave) => chave !== CACHE_NOME).map((chave) => caches.delete(chave)))
    )
  );
  self.clients.claim();
});

// 005 - Estratégia "cache primeiro, com atualização em segundo plano" para requisições GET
self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;

  evento.respondWith(
    caches.match(evento.request).then((respostaCache) => {
      const buscaRede = fetch(evento.request)
        .then((respostaRede) => {
          caches.open(CACHE_NOME).then((cache) => cache.put(evento.request, respostaRede.clone()));
          return respostaRede;
        })
        .catch(() => respostaCache);

      return respostaCache || buscaRede;
    })
  );
});
