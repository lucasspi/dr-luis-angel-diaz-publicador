import React from 'react'
import ReactDOM from 'react-dom/client'
import dayjs from 'dayjs'
import 'dayjs/locale/es'
import App from './App'

// El calendario del filtro de fechas saca los nombres de mes y día de dayjs,
// no del locale de antd — sin esto sale en inglés dentro de una app en español.
dayjs.locale('es')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
