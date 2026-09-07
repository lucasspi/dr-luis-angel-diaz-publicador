import { AutoComplete } from 'antd'
import type { Tema } from '../../../preload'

// "Oración" ~ "oracion": la búsqueda ignora tildes y mayúsculas.
const plano = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * El tema de una oración: desplegable alfabético con búsqueda. Lo que se
 * escribe y no coincide con ninguno es un tema nuevo (se da de alta al
 * guardar, como en las reflexiones). El valor es el nombre del tema.
 */
export function SelectorTema({ id, temas, value, onChange, disabled }: {
  id?: string
  temas: Tema[]
  value: string
  onChange: (nombre: string) => void
  disabled?: boolean
}): JSX.Element {
  const opciones = [...temas]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
    .map(t => ({ value: t.nombre }))
  return (
    <AutoComplete
      id={id}
      style={{ width: '100%' }}
      options={opciones}
      value={value}
      onChange={v => onChange(String(v ?? ''))}
      filterOption={(texto, opcion) => plano(String(opcion?.value ?? '')).includes(plano(texto))}
      placeholder={temas.length ? 'Busca un tema o escribe uno nuevo…' : 'Ej.: Familia, Oración, Sanidad…'}
      allowClear
      disabled={disabled}
      maxLength={120}
    />
  )
}
