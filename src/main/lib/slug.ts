/**
 * "Oración" → "oracion". La misma normalización que hace el sitio en
 * `content/loader.mjs::slugifyCategoria` — es la que decide la URL de
 * /categoria/{slug}, así que las dos tienen que coincidir carácter por
 * carácter o el app enlazaría a páginas que no existen.
 *
 * Aquí sirve además para no ofrecer dos grafías del mismo tema al publicar.
 */
export function slugificarCategoria(nombre: string): string {
  return String(nombre)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
