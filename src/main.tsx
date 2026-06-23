import { StrictMode, Component } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

class RootBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(e: Error) { return { err: e }; }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 24, color: 'red', background: 'white', fontSize: 14,
          position: 'fixed', inset: 0, zIndex: 9999, overflow: 'auto', fontFamily: 'monospace' }}>
          <strong style={{ fontSize: 18 }}>React crash — root error boundary caught:</strong>
          <pre style={{ marginTop: 12 }}>{this.state.err.message}</pre>
          <pre style={{ fontSize: 11, marginTop: 8 }}>{this.state.err.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootBoundary>
      <App />
    </RootBoundary>
  </StrictMode>,
);
