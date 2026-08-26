#!/bin/bash
# Setup del Mac del Dr. Luis — automatiza los pasos de SETUP.md.
#
# Lo corre Lucas, una sola vez, en el Mac del Dr. Luis:
#
#   curl -fsSL https://raw.githubusercontent.com/lucasspi/dr-luis-angel-diaz-publicador/main/scripts/setup-mac.sh | bash
#
# (o clonando este repo y corriendo bash scripts/setup-mac.sh)
#
# Es idempotente: se puede correr de nuevo sin romper nada — cada paso
# detecta lo que ya está hecho y lo salta. Pide de forma interactiva lo único
# que no puede adivinar: el token de GitHub, la clave de fal.ai y el login de
# Codex (que abre el navegador).
set -euo pipefail

REPO_SITIO="lucasspi/dr-luis-angel-diaz"
REPO_APP="lucasspi/dr-luis-angel-diaz-publicador"
DIR_CLONE="$HOME/Sitios/dr-luis-angel-diaz"
APP_NAME="Publicador Dr. Luis"
APP_PATH="/Applications/$APP_NAME.app"
# app.getPath('userData') de la app empaquetada — OJO: Electron usa el "name"
# del package.json (dr-luis-angel-diaz-publicador), NO el productName.
CONFIG_DIR="$HOME/Library/Application Support/dr-luis-angel-diaz-publicador"
CONFIG_JSON="$CONFIG_DIR/config.json"

azul()  { printf '\n\033[1;34m== %s ==\033[0m\n' "$1"; }
ok()    { printf '\033[0;32m✔ %s\033[0m\n' "$1"; }
aviso() { printf '\033[0;33m! %s\033[0m\n' "$1"; }

# Este script es interactivo (pide token/clave): necesita un TTY aunque se
# corra con "curl | bash", donde stdin es el pipe del propio script.
exec </dev/tty

# ---------------------------------------------------------------- 1. Homebrew
azul "1/7 Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  # brew existe pero fuera del PATH (instalación previa a medias)
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  else
    aviso "Homebrew no está — instalándolo (va a pedir la contraseña del Mac)…"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [ -x /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    else
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi
fi
# deja brew disponible también en las próximas terminales
if ! grep -qs 'brew shellenv' "$HOME/.zprofile" 2>/dev/null; then
  echo "eval \"\$($(command -v brew) shellenv)\"" >> "$HOME/.zprofile"
fi
ok "Homebrew listo ($(brew --version | head -1))"

# ------------------------------------------------------------- 2. git + node
azul "2/7 git y node"
for herramienta in git node; do
  if ! command -v "$herramienta" >/dev/null 2>&1; then
    brew install "$herramienta"
  fi
done
ok "git $(git --version | awk '{print $3}') · node $(node --version)"

# ------------------------------------------------- 3. identidad git (commits)
# La app hace commits como el Dr. Luis — sin user.name/email git se niega.
azul "3/7 Identidad git"
if [ -z "$(git config --global user.name || true)" ]; then
  git config --global user.name "Dr. Luis Ángel Díaz"
fi
if [ -z "$(git config --global user.email || true)" ]; then
  read -r -p "Email para los commits del Dr. Luis: " GIT_EMAIL
  git config --global user.email "$GIT_EMAIL"
fi
ok "Commits como: $(git config --global user.name) <$(git config --global user.email)>"

# ------------------------------------------------------------- 4. Codex CLI
azul "4/7 Codex CLI (cuenta ChatGPT del Dr. Luis)"
if ! command -v codex >/dev/null 2>&1; then
  brew install codex 2>/dev/null || npm install -g @openai/codex
fi
if codex login status >/dev/null 2>&1; then
  ok "Codex ya está autenticado"
else
  aviso "Se va a abrir el navegador — inicia sesión con la cuenta ChatGPT del Dr. Luis."
  codex login
  codex login status
  ok "Codex autenticado"
fi

# ------------------------------------------------- 5. clone del sitio + token
azul "5/7 Clone del sitio ($REPO_SITIO)"
echo "Necesitas un Personal Access Token de GitHub (fine-grained), escopado SOLO a"
echo "$REPO_SITIO con permiso 'Contents: Read and write'."
echo "(GitHub → Settings → Developer settings → Fine-grained tokens)"
if [ -d "$DIR_CLONE/.git" ]; then
  ok "El clone ya existe en $DIR_CLONE"
  read -r -s -p "Token nuevo para actualizar el remote (Enter para dejar el actual): " TOKEN
  echo
else
  read -r -s -p "Pega el token (no se muestra al escribir): " TOKEN
  echo
  [ -n "$TOKEN" ] || { echo "Sin token no se puede clonar. Corre el script de nuevo."; exit 1; }
  mkdir -p "$(dirname "$DIR_CLONE")"
  git clone "https://${TOKEN}@github.com/${REPO_SITIO}.git" "$DIR_CLONE"
fi
if [ -n "${TOKEN:-}" ]; then
  git -C "$DIR_CLONE" remote set-url origin "https://${TOKEN}@github.com/${REPO_SITIO}.git"
fi
# la prueba que importa: ¿este remote sirve para leer (y por ende el token vale)?
git -C "$DIR_CLONE" ls-remote origin HEAD >/dev/null
ok "Clone listo y token funcionando"

# --------------------------------------------------------- 6. config de la app
azul "6/7 Configuración de la app (fal.ai + ruta del clone)"
FAL_ACTUAL=""
if [ -f "$CONFIG_JSON" ]; then
  FAL_ACTUAL=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$CONFIG_JSON','utf8')).falApiKey||'')}catch{}" 2>/dev/null || true)
fi
if [ -n "$FAL_ACTUAL" ]; then
  read -r -s -p "Clave de fal.ai (Enter para dejar la que ya está): " FAL_KEY
  echo
  FAL_KEY="${FAL_KEY:-$FAL_ACTUAL}"
else
  read -r -s -p "Clave de fal.ai (fal.ai → API keys): " FAL_KEY
  echo
  [ -n "$FAL_KEY" ] || { echo "Sin clave de fal.ai la app no puede generar imágenes."; exit 1; }
fi
mkdir -p "$CONFIG_DIR"
printf '{\n  "repoPath": "%s",\n  "falApiKey": "%s"\n}\n' "$DIR_CLONE" "$FAL_KEY" > "$CONFIG_JSON"
ok "Escrito $CONFIG_JSON"

# ----------------------------------------------------------- 7. instalar la app
azul "7/7 Instalar $APP_NAME"
if [ -d "$APP_PATH" ]; then
  ok "La app ya está en /Applications (se actualiza sola vía GitHub Releases)"
else
  echo "Descargando el último release…"
  DMG_URL=$(curl -fsSL "https://api.github.com/repos/$REPO_APP/releases/latest" \
    | grep -o '"browser_download_url": *"[^"]*\.dmg"' | head -1 | sed 's/.*"\(https[^"]*\)".*/\1/')
  [ -n "$DMG_URL" ] || { echo "No encontré ningún .dmg en el último release de $REPO_APP."; exit 1; }
  DMG_LOCAL=$(mktemp -d)/publicador.dmg
  curl -fL -o "$DMG_LOCAL" "$DMG_URL"
  MOUNT=$(hdiutil attach -nobrowse "$DMG_LOCAL" | grep -o '/Volumes/.*' | tail -1)
  cp -R "$MOUNT"/*.app /Applications/
  hdiutil detach "$MOUNT" -quiet
  rm -f "$DMG_LOCAL"
  ok "Instalada en /Applications"
  aviso "Primera apertura: clic derecho sobre la app → Abrir → 'Abrir de todos"
  aviso "modos' (está firmada pero no notarizada por Apple; solo pasa una vez)."
fi

printf '\n\033[1;32mListo.\033[0m Prueba de punta a punta antes de entregarla:\n'
echo "  1. Abre \"$APP_NAME\" y suelta un .docx o .pdf de prueba."
echo "  2. Elige el tema (categoría) y confirma con \"Publicar\"."
echo "  3. Verifica que el post aparece en https://drluisangeldiaz.com en 1–2 min."
echo "  4. Si algo falla, revisa: codex login status · git -C \"$DIR_CLONE\" log"
