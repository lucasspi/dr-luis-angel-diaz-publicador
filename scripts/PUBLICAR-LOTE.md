# Publicar en masa documentos históricos — guía de operación

Guía para ejecutar `scripts/publicar-lote.mjs`, que publica de una vez varios
documentos antiguos del Dr. Luis en drluisangeldiaz.com, cada uno con **la
fecha de creación del documento original** (no la de hoy). Procesa varios en
paralelo y hace **un solo** commit+push al final (= un solo deploy).

Está escrita para poder seguirla **sin contexto previo y sin improvisar** —
incluida una sesión de un agente/asistente de IA. Sigue los pasos en orden.
Si algo no coincide con lo que dice aquí, **detente y reporta el error
textual** en vez de inventar una solución.

## Reglas duras (para agentes)

1. **Nunca inventes una fecha.** Si el script marca un documento con ✗ por
   fecha inválida o futura, pregunta al usuario qué fecha usar y ponla en el
   manifest. La fecha es el dato central de todo este proceso.
2. **Nunca ejecutes `--push` sin que el usuario lo haya pedido/confirmado
   explícitamente.** El push dispara el deploy a producción.
3. **No edites posts ya existentes** en `content/posts/` ni borres nada del
   clon del sitio.
4. Si un documento falla, los demás siguen: al final re-ejecuta **solo los
   archivos fallidos** (el resumen final lista exactamente cuáles y por qué).
   No re-ejecutes el lote completo: los ya escritos fallarían por duplicado.
5. Ante cualquier error que esta guía no cubra: copia el mensaje de error
   completo al usuario y espera instrucciones.

## Requisitos (verifícalos antes de empezar)

Ejecuta cada comando; si la salida no es la esperada, aplica el remedio.

| # | Comando | Salida esperada | Si falla |
|---|---------|-----------------|----------|
| 1 | `node --version` | v18 o superior | En este Mac node vive en `/opt/homebrew/bin/node` — usa la ruta completa o `export PATH="/opt/homebrew/bin:$PATH"` |
| 2 | `codex login status` | `Logged in using ChatGPT` | Ejecuta `codex login` (lo hace el usuario, abre navegador) |
| 3 | `ls <repo-del-sitio>/.git` | existe | Clonar: `git clone https://github.com/lucasspi/dr-luis-angel-diaz.git` |
| 4 | `ls node_modules/mammoth` (en ESTE repo, el del publicador) | existe | `npm install --ignore-scripts` en este repo |
| 5 | Clave de fal.ai disponible | — | Pídesela al usuario, o usa `--sin-imagen` si él lo aprueba |

## Procedimiento

Todos los comandos se ejecutan **desde la raíz de este repo**
(`dr-luis-angel-diaz-publicador`). `<REPO>` = ruta al clon del sitio
`dr-luis-angel-diaz`.

### Paso 1 — Inventario

Reúne las rutas de los documentos (.docx, .pdf o .txt; los `.doc` antiguos hay
que guardarlos como `.docx` primero). Un documento = una reflexión.

### Paso 2 — Plan (no publica nada, no gasta nada)

```bash
node scripts/publicar-lote.mjs --repo <REPO> --solo-plan /ruta/doc1.docx /ruta/doc2.docx
```

Revisa la lista impresa: **cada archivo → fecha detectada → fuente de la
fecha**. Presta atención a las marcadas con ⚠ (fecha del archivo en disco:
puede ser la fecha de una copia o descarga, no la de escritura real).
**Muestra este plan al usuario y confirma las fechas con él** antes de seguir.

### Paso 3 — Corregir fechas si hace falta (manifest)

Solo si alguna fecha del plan está mal o el script marcó ✗. Crea `lote.json`:

```json
[
  { "archivo": "/ruta/doc1.docx" },
  { "archivo": "/ruta/doc2.docx", "fecha": "2026-03-02" }
]
```

y usa `--manifest lote.json` en lugar de las rutas sueltas (repite el Paso 2
con el manifest hasta que el plan salga limpio y confirmado).

### Paso 4 — Ejecución real (escribe en el clon, todavía sin publicar)

```bash
node scripts/publicar-lote.mjs --repo <REPO> --fal-key <CLAVE> /ruta/doc1.docx /ruta/doc2.docx
```

- Procesa 3 documentos a la vez (ajustable con `--paralelo N`, máx 8).
- La clave de fal.ai también puede ir en la variable `FAL_API_KEY`. Sin
  imágenes (aprobado por el usuario): `--sin-imagen`.
- Salida esperada: una línea `✓` por documento y un resumen final con las
  URLs. Código de salida 0 = todo bien; 1 = algunos fallaron (re-ejecuta solo
  esos, ver Reglas duras #4).

### Paso 5 — Revisión

```bash
cd <REPO> && git status && git diff --stat
```

Comprueba:

- Hay un `.md` nuevo en `content/posts/` por documento, con nombre
  `AAAA-MM-DD-slug.md` y la fecha correcta.
- Ningún título quedó con prefijo de numeración:
  `grep -rn 'titulo:' content/posts/ | grep -iE 'devocional [0-9]|reflexi.n [0-9]'`
  no debe devolver nada.
- (Si hubo imágenes) hay un `.jpg` por post en `public/img/`.

Reporta al usuario la lista de títulos+fechas y espera su OK.

### Paso 6 — Publicar (SOLO con confirmación explícita del usuario)

Re-ejecutar el script completo con `--push` volvería a procesar los
documentos (y fallaría por duplicados) — para publicar lo ya escrito el
commit se hace directo con git:

```bash
cd <REPO> && git add content/posts public/img && git commit -m "reflexiones: publica el lote histórico" && git push origin master
```

(Alternativa: si aún no ejecutaste el Paso 4, puedes hacerlo todo de una vez
añadiendo `--push` a ese comando — el script entonces corre además un
`npm run build` de verificación y solo pushea si el build pasa.)

### Paso 7 — Verificar el deploy

El push dispara el GitHub Action `deploy.yml`; el sitio se actualiza en 1–2
minutos. Confirma abriendo 1–2 de las URLs del resumen
(`https://drluisangeldiaz.com/<slug>`). Los posts históricos NO desplazan al
destacado de la portada salvo que su fecha sea la más reciente.

## Errores comunes

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| `Falta --repo` / `no es un repo git` | Ruta del clon del sitio mal | Verifica requisito #3 y la ruta pasada |
| `No se encontró el comando "codex"` | Codex CLI no instalado / fuera de PATH | Requisito #2 |
| `Codex no tiene sesión iniciada` | Login vencido | El usuario ejecuta `codex login` |
| `límite de uso de la cuenta de ChatGPT` | Cuota agotada | Espera (o baja `--paralelo`), re-ejecuta solo los que faltan |
| `fecha … está en el futuro` | Metadatos del documento raros | Fecha correcta en el manifest (pregunta al usuario) |
| `Ya existe una reflexión con el slug` | Colisión de URL con un post existente o dentro del lote | `"titulo"` distinto en el manifest para ese documento |
| `Ya existe AAAA-MM-DD-slug.md` | Ese documento parece ya publicado | Confírmalo con el usuario; si es re-intento, no hay nada que hacer |
| `El build del sitio falló — NO se hizo commit` | Un post generado rompe el build | Copia el error al usuario; nada salió a producción |
