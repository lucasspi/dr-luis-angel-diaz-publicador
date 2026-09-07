import Icon from '@ant-design/icons'

// Un destello con degradé: la marca de que ahí hay inteligencia artificial
// (Codex proponiendo texto). Se usa como cualquier icono de antd.
const Destello = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="ia-degrade" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#7c3aed" />
        <stop offset="0.55" stopColor="#2563eb" />
        <stop offset="1" stopColor="#06b6d4" />
      </linearGradient>
    </defs>
    <path fill="url(#ia-degrade)" d="M10 2.5c.3 2.9 1.2 5 2.7 6.4 1.4 1.4 3.4 2.2 6.1 2.6-2.7.4-4.7 1.3-6.1 2.7-1.5 1.4-2.4 3.5-2.7 6.3-.3-2.8-1.2-4.9-2.6-6.3C6 12.8 4 11.9 1.3 11.5c2.7-.4 4.7-1.2 6.1-2.6C8.8 7.5 9.7 5.4 10 2.5Z" />
    <path fill="url(#ia-degrade)" d="M18.5 1.5c.15 1.2.5 2.1 1.1 2.7.6.6 1.5 1 2.7 1.1-1.2.2-2.1.6-2.7 1.2-.6.6-1 1.5-1.1 2.7-.15-1.2-.5-2.1-1.1-2.7-.6-.6-1.5-1-2.7-1.2 1.2-.15 2.1-.5 2.7-1.1.6-.6.95-1.5 1.1-2.7Z" />
  </svg>
)

export function IconoIA(props: React.ComponentProps<typeof Icon>): JSX.Element {
  return <Icon component={Destello} {...props} />
}
