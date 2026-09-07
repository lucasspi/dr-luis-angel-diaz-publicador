import React from 'react'
import ReactDOM from 'react-dom/client'
import dayjs from 'dayjs'
import 'dayjs/locale/es'
import App from './App'

// El calendario del filtro de fechas saca los nombres de mes y día de dayjs,
// no del locale de antd — sin esto sale en inglés dentro de una app en español.
dayjs.locale('es')

// Soltar un archivo fuera de un recuadro de arrastre haría que Electron abriera
// ese archivo en lugar de la app (pantalla en blanco). Se anula en toda la ventana;
// los recuadros (Dragger) siguen recibiendo el suyo porque el evento les llega antes.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
