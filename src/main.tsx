import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './i18n'
import { mockApi } from './mockApi'
import App from './App'
import './index.css'

// W przeglądarce (np. podgląd w Cursor) nie ma Electrona – podkładamy mock, żeby UI się wyświetlało
if (typeof window !== 'undefined' && !(window as unknown as { api?: unknown }).api) {
  (window as unknown as { api: typeof mockApi }).api = mockApi
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App error:', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 600 }}>
          <h1 style={{ color: '#dc2626' }}>Błąd aplikacji</h1>
          <pre style={{ background: '#1e1e1e', color: '#fafafa', padding: 16, borderRadius: 8, overflow: 'auto' }}>
            {this.state.error.message}
          </pre>
          <p style={{ color: '#737373' }}>Otwórz DevTools (F12) → Console, aby zobaczyć szczegóły.</p>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <React.Suspense fallback={<div style={{ padding: 24, fontFamily: 'system-ui' }}>Ładowanie…</div>}>
        <HashRouter>
          <App />
        </HashRouter>
      </React.Suspense>
    </AppErrorBoundary>
  </React.StrictMode>
)
