# Handoff — configurar o Mac do Dr. Luis do zero

> **Como usar (Lucas):** abra o Claude Code no Mac do Dr. Luis e cole este
> documento inteiro como primeira mensagem. Ele assume uma máquina zerada:
> sem Homebrew, sem repos clonados, sem nada. Tenha em mãos antes de começar:
>
> 1. **Token do GitHub** (fine-grained, escopado só ao repo
>    `lucasspi/dr-luis-angel-diaz`, permissão `Contents: Read and write`).
> 2. **Chave da fal.ai** (fal.ai → API keys, conta da casa).
> 3. A **conta ChatGPT do Dr. Luis** logável no navegador (para o `codex login`).
> 4. A senha de administrador do Mac (para o Homebrew).

---

Você (Claude) vai deixar este Mac pronto para o **Publicador Dr. Luis** — um
app Electron em que o Dr. Luis solta um `.docx`/`.pdf`, escolhe o tema, e o
app reescreve o texto com o Codex CLI (conta ChatGPT dele, sem API key), gera
uma imagem de capa na fal.ai, escreve um Markdown em `content/posts/` do
clone local do site, commita e pusha. Um GitHub Action no repo do site builda
e publica em https://drluisangeldiaz.com (S3 + CloudFront — já provisionados,
nada de AWS aqui).

Repos (ambos de `lucasspi` no GitHub):

- `dr-luis-angel-diaz` — o site estático (é este que o app commita; clone via
  token abaixo).
- `dr-luis-angel-diaz-publicador` — o app (público; o `.dmg` vem dos
  Releases; **não** precisa clonar, só baixar o instalador).

Estado final desejado:

- Homebrew, `git`, `node` e `codex` instalados; `codex login status` OK.
- Identidade git global configurada (os commits saem como o Dr. Luis).
- Site clonado em `~/Sitios/dr-luis-angel-diaz`, remote `origin` com o token
  embutido (`https://<TOKEN>@github.com/lucasspi/dr-luis-angel-diaz.git`) e
  `git ls-remote` funcionando.
- `~/Library/Application Support/Publicador Dr. Luis/config.json` com
  `repoPath` (o clone acima) e `falApiKey`.
- App instalada em `/Applications/Publicador Dr. Luis.app` (baixe o `.dmg` do
  último release: `https://api.github.com/repos/lucasspi/dr-luis-angel-diaz-publicador/releases/latest`,
  monte com `hdiutil attach`, copie o `.app`, desmonte).
- Teste de ponta a ponta feito (abaixo).

Como trabalhar:

- Existe um script que automatiza tudo isso —
  `https://raw.githubusercontent.com/lucasspi/dr-luis-angel-diaz-publicador/main/scripts/setup-mac.sh` —
  mas ele é interativo (usa `/dev/tty`), então **não rode ele via tool de
  Bash**. Use-o como referência da sequência exata e execute os passos você
  mesmo, um a um, de forma não-interativa; ou, se preferir, peça ao Lucas
  para rodá-lo no Terminal e apenas verifique o resultado.
- Peça ao Lucas o token do GitHub, a chave fal.ai e o email dos commits antes
  de precisar deles. **Nunca** escreva esses valores em arquivo nenhum além
  dos dois lugares previstos (remote URL do clone e `config.json`), e nunca
  os commite.
- Dois passos precisam do humano no Terminal/navegador: a instalação do
  Homebrew (pede senha do Mac) e o `codex login` (abre o navegador — conta
  ChatGPT do Dr. Luis, não a do Lucas). Oriente o Lucas a executá-los e
  confirme depois (`brew --version`, `codex login status`).
- Se `git config --global user.name` estiver vazio, configure
  `"Dr. Luis Ángel Díaz"` e o email que o Lucas indicar.
- Gatekeeper: o app é assinado mas não notarizado — a primeira abertura é
  clique-direito → Abrir → "Abrir de todos modos". Não remova quarantine via
  `xattr`; use o fluxo normal do Gatekeeper.

Teste de ponta a ponta (obrigatório antes de encerrar):

1. Abra o app, solte um `.docx`/`.pdf` de teste, escolha um tema (o app
   mostra chips de categorias) e confirme em "Publicar".
2. Confirme: o passo do Codex não falha; a imagem aparece em `public/img/` do
   clone; `git log` do clone mostra o commit `reflexión: …` pushado.
3. O post aparece em https://drluisangeldiaz.com em 1–2 minutos (o Action
   `deploy.yml` do repo do site faz o build + upload + invalidation).
4. Se o post de teste não for para ficar no ar, avise o Lucas para removê-lo
   depois (apagar o `.md` e a imagem, commit + push) — não faça `git push
   --force` nem apague nada sem confirmar com ele.

Solução de problemas comuns:

- `codex` não encontrado pelo app → o app roda `codex` do PATH de GUI; se só
  existir via npm em caminho fora do PATH padrão, prefira `brew install
  codex`.
- Commit falha com "Please tell me who you are" → identidade git do passo
  acima.
- Push pede usuário/senha → o remote não ficou com o token embutido.
- Codex reclama de limite de uso → a conta ChatGPT do Dr. Luis atingiu a
  cota; só esperar.
