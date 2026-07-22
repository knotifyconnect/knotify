import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { registerServiceWorker } from './lib/push'
import { installVisualViewportContract } from './lib/visualViewport'

const disposeVisualViewportContract = installVisualViewportContract()
if (import.meta.hot) import.meta.hot.dispose(disposeVisualViewportContract)
void registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' })
  })
}
