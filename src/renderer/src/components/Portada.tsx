import { useState } from 'react'
import { PictureOutlined } from '@ant-design/icons'

const MARCO: React.CSSProperties = {
  width: 72,
  height: 48,
  borderRadius: 4,
  background: '#f5f5f5',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  flexShrink: 0
}

/**
 * La portada llega por el esquema propio `reflexion-img://` (ver
 * main/lib/imagenes.ts). El archivo puede faltar aunque el frontmatter lo
 * nombre: entonces cae al marcador en vez de dejar el hueco roto.
 */
export function Portada({ src, alt }: { src: string; alt: string }): JSX.Element {
  const [falló, setFalló] = useState(false)

  if (!src || falló) {
    return (
      <div style={MARCO}>
        <PictureOutlined style={{ color: '#bfbfbf' }} />
      </div>
    )
  }

  return (
    <div style={MARCO}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFalló(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  )
}
