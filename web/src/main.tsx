import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Dev only: poke at the store and the time of day from the console.
if (import.meta.env.DEV) {
  void Promise.all([import('./store'), import('./scene/atmosphere')]).then(([st, at]) => {
    ;(window as unknown as { __csky: unknown }).__csky = { store: st.useStore, atmosphere: at.atmosphere }
  })
}
