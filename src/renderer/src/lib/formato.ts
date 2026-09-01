/** '2026-09-01' → '01 sept 2026'. Vacío si no hay fecha. */
export function fechaLegible(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  const fecha = new Date(Number(y), Number(m) - 1, Number(d))
  if (Number.isNaN(fecha.getTime())) return iso
  return fecha.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Sin acentos y en minúsculas, para que "oracion" encuentre "Oración". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}
