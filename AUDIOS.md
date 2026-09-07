# Oraciones en audio

La pestaña **Oraciones en audio** permite arrastrar (o buscar) una nota de voz,
escuchar la versión comprimida, escribir título y descripción, y publicarla.
Al preparar el audio, la transcripción arranca sola si el transcriptor local
está listo; si no, se publica sólo el audio y se ofrece configurarlo. El texto
queda editable (sección colapsada) pero no exige revisión párrafo a párrafo.
Con el texto listo, Codex (la cuenta ChatGPT del Dr. Luis, igual que en las
reflexiones) propone título y descripción; si Codex falla o está en su límite,
no se muestra error: los campos se escriben a mano. Mientras hay un audio
en curso, el recuadro de arrastre se oculta y un botón **Cancelar** vuelve al
inicio (corta la transcripción si estaba en marcha). Soltar un archivo fuera del
recuadro no hace nada: la ventana anula el drop global. Todo el flujo está en
español. No usa Codex, fal.ai ni otra API de pago (la transcripción es local).

## Almacenamiento y costo

Se conserva S3 privado + CloudFront del sitio. Los MP3 se guardan en
`public/audio/<uuid>.mp3`. La tabla de oraciones es `content/oraciones.json`
(id, slug, título, descripción, fecha, `temaId` → `temas.json`, audio, duración,
bytes, `transcripcion`); los párrafos van aparte en `content/oraciones/<uuid>.json`.
Un tema tiene varias oraciones; una oración, un tema o ninguno. El tema se da de
alta en `temas.json` dentro del mismo commit. El contrato completo está en
`content/README.md` del sitio ("Oraciones en audio").
El publicador hace commit/push a master; el deploy existente copia ambos al
sitio. El catálogo público se genera en `/oraciones`, con reproductores nativos,
descarga y enlace de WhatsApp. Los archivos sólo se solicitan al reproducir
(`preload="none"`); nombres únicos permiten aprovechar el cache inmutable actual.
El público escucha desde CloudFront, no desde GitHub.

Compresión local: MP3 mono, 24 kHz, 48 kbps (~360 kB/minuto). Diez minutos ocupan
~3,6 MB; mil oraciones de esa duración, ~3,6 GB. El costo de almacenamiento S3
será pequeño, pero no es una garantía de gratuidad: depende de región, volumen,
solicitudes y transferencia. El nivel gratuito de CloudFront pay-as-you-go
incluye 1 TB/mes de transferencia y 10 millones de solicitudes, compartidos con
los demás usos de la cuenta. No se cambió el plan ni la infraestructura AWS.

Referencias consultadas el 7 de septiembre de 2026:
- https://aws.amazon.com/s3/pricing/
- https://aws.amazon.com/cloudfront/faqs/

Límites del módulo: 50 MB de entrada, 60 minutos de duración, 20 MB por MP3.
No se recorta una grabación que exceda la duración; se rechaza. Estos límites
controlan el tamaño por publicación, no constituyen un tope de facturación AWS.
El historial Git crecerá con el archivo de audios; si el archivo crece mucho,
convendrá separar los binarios del repositorio y adaptar el deploy (hoy usa
`--delete`, por lo que un upload directo aislado a S3 sería borrado).

La pestaña **Audios** lista el catálogo (título, tema, fecha, duración, texto).
Editar y borrar desde ahí es el siguiente paso; el modelo ya lo permite.

## Activación

1. Desplegar primero los cambios del sitio que generan `/oraciones`.
2. Instalar FFmpeg en el Mac del Dr. Luis: `brew install ffmpeg`.
   El setup incluye esta dependencia; el app busca Homebrew en Apple Silicon,
   Intel y después PATH. No incluye FFmpeg dentro del instalador.
3. Construir/distribuir la nueva versión del publicador con el proceso habitual.
   No se necesita credencial AWS en ese Mac: usa el acceso Git existente.
   Para usar sólo audios, basta `repoPath` en config.json; falApiKey es opcional.
4. Publicar una oración real y esperar el deploy. La confirmación del app indica
   que Git recibió el contenido, no que CloudFront ya esté actualizado.

La CSP actual del sitio permite medios del mismo origen por `default-src 'self'`.
No requiere relajar cabeceras ni abrir el bucket al público.

## Recuperación y pruebas

Una publicación fallida al enviar conserva el commit y permite pulsar Publicar
otra vez sin duplicar la oración. Si se cierra la aplicación tras ese error,
el commit sigue en el clone: Lucas debe revisar y enviar el commit pendiente
antes de volver a seleccionar la misma grabación. No seleccionar otro archivo
hasta resolver el envío pendiente. Los borradores de previsualización no se
conservan al cerrar la aplicación.

Comprobaciones locales (requieren FFmpeg):

```sh
npm run typecheck
npm run build
node tests/audios.cjs
```

La integración usa sólo repositorios temporales y un remoto Git local: prueba
compresión real, archivos inválidos, validación, cambios pendientes, fallo del
push, reintento sin duplicación y rechazo de catálogo con audio ausente.
El test del catálogo requiere este checkout hermano `../site`.
