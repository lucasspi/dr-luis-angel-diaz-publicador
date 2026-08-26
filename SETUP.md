# Setup en la máquina del Dr. Luis (Mac)

Checklist para hacer **una sola vez**, antes de dejarle el `.dmg` instalado.
Todo esto lo hace Lucas — el Dr. Luis nunca necesita tocar una terminal.

> **Atajo: casi todo esto lo hace [`scripts/setup-mac.sh`](scripts/setup-mac.sh).**
> En el Mac del Dr. Luis, una sola línea:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/lucasspi/dr-luis-angel-diaz-publicador/main/scripts/setup-mac.sh | bash
> ```
>
> Cubre los pasos 1–5 (Homebrew, git/node, identidad git para los commits,
> Codex + login, clone del sitio con el token, clave de fal.ai, `config.json`
> e instalación del `.dmg` del último release). Es idempotente — se puede
> correr de nuevo y salta lo que ya está hecho. Solo pide lo que no puede
> adivinar: el token de GitHub, la clave de fal.ai y el login de Codex.
> Los pasos 6 (prueba de punta a punta) y 7 (infra AWS, del lado de Lucas)
> siguen siendo manuales. El detalle de cada paso queda documentado abajo.

## 1. Prerrequisitos en el Mac

```bash
# Homebrew, si no está instalado
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install git node
```

## 2. Codex CLI, autenticado con la cuenta ChatGPT del Dr. Luis

```bash
brew install codex   # o: npm install -g @openai/codex
codex login          # abre el navegador — inicia sesión con la cuenta ChatGPT del Dr. Luis
codex login status   # confirma que quedó autenticado
```

**Importante**: esta autenticación es la que evita pagar por API key — usa
la suscripción ChatGPT que él ya tiene. Si su cuenta llega al límite de uso,
la app va a avisarlo con un mensaje claro (no un error críptico).

## 3. Clonar el sitio y configurar el push

```bash
mkdir -p ~/Sitios && cd ~/Sitios
git clone https://github.com/lucasspi/dr-luis-angel-diaz.git
```

Genera un **Personal Access Token de GitHub escopado solo a este
repositorio** (fine-grained token, GitHub → Settings → Developer settings →
Fine-grained tokens → Only select repositories → `dr-luis-angel-diaz`,
permiso `Contents: Read and write`).

Configura el remote para usar ese token (evita que git pida usuario/clave
cada vez):

```bash
cd ~/Sitios/dr-luis-angel-diaz
git remote set-url origin https://<TOKEN>@github.com/lucasspi/dr-luis-angel-diaz.git
```

## 4. Clave de Fal.ai

Consigue una API key en fal.ai (cuenta de la casa) — el costo es pequeño,
por imagen generada.

## 5. Instalar la app y configurarla

1. Instala `Publicador Dr. Luis-0.1.0.dmg`.
2. Ábrela una vez (para que cree su carpeta de datos), luego ciérrala.
3. En el menú de la app: **Publicador → Abrir carpeta de configuración**.
4. Copia `config.example.json` (de este repo) a esa carpeta como
   `config.json` y complétalo:

```json
{
  "repoPath": "/Users/<usuario-del-Dr-Luis>/Sitios/dr-luis-angel-diaz",
  "falApiKey": "<la clave de fal.ai>"
}
```

5. Vuelve a abrir la app — debería mostrar la zona para soltar el
   documento en vez del aviso de "falta configurar".

## 6. Prueba de punta a punta (antes de dejárselo al Dr. Luis)

Suelta un `.docx` o `.pdf` de prueba y confirma que:
- El paso de Codex no falla (login vigente, sin límite de uso).
- La imagen se genera y aparece en `public/img/` del clone local.
- El commit+push funciona (revisa `git log` en el clone).
- El GitHub Action (`deploy.yml`) corre y el post aparece en
  `drluisangeldiaz.com` en 1–2 minutos.

## 7. Confirmar la infraestructura de deploy (una sola vez, del lado tuyo)

Antes de que el primer push real dispare el deploy automático:
- El bucket S3 + certificado ACM + distribución CloudFront de `DEPLOY.md`
  ya deben existir (pasos 1–6).
- Los secrets del repo GitHub (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `CLOUDFRONT_DISTRIBUTION_ID`) deben estar configurados con el IAM
  least-privilege dedicado a esto (no el profile local de alcance amplio).

## 8. Auto-actualización de la app

La app revisa GitHub Releases al abrirse (`electron-updater`) y, si hay una
versión nueva, la descarga sola en segundo plano — se instala en el
próximo cierre de la app, sin que el Dr. Luis tenga que hacer nada. El repo
del app es **público** (solo código, ningún secreto commiteado) para que
esta revisión funcione sin ningún token embebido en el `.dmg` distribuido.

Para publicar una versión nueva (tú, no el Dr. Luis):

```bash
cd ~/Work/dr-luis-angel-diaz-publicador
# sube la versión en package.json (ej: 0.1.0 -> 0.2.0)
export GH_TOKEN=$(gh auth token)
npm run release:mac
```

Esto builda, firma (usa la identity "Developer ID Application" ya presente
en este Mac) y sube el `.dmg`/`.zip` + los metadatos de actualización como
un GitHub Release. La próxima vez que la app del Dr. Luis abra, se entera
sola.

**Nota honesta sobre notarización**: el build queda firmado, pero no
notarizado por Apple (eso requiere credenciales de un Apple Developer
Program aparte). Sin notarizar, el primer instalador puede pedir "Abrir de
todos modos" en Gatekeeper (ya cubierto en el paso 5), y no hay garantía
100% de que el ciclo de auto-update corra sin fricción en todas las
versiones de macOS. Si en la práctica da problemas, notarizar es el
siguiente paso — pero no lo asumí de entrada porque implica una cuenta de
desarrollador Apple que no confirmamos que exista para este proyecto.
