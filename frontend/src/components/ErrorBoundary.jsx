import { Component } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('Folio Klarity crashed:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#faf7f1', padding: 24,
      }}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 20px',
            background: 'rgba(181,64,58,0.08)', border: '1px solid rgba(181,64,58,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={28} style={{ color: '#b5403a' }} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#2d2a24', marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: '#6b6558', lineHeight: 1.6, marginBottom: 6 }}>
            Folio Klarity hit an unexpected error and couldn't continue rendering this page.
            Your portfolio data is safe — it's stored locally and wasn't affected.
          </p>
          {this.state.error?.message && (
            <p style={{
              fontSize: 11, color: '#9a9283', fontFamily: 'monospace', marginBottom: 20,
              padding: '8px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: 8,
              wordBreak: 'break-word',
            }}>
              {this.state.error.message}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px',
                borderRadius: 9, border: 'none', background: '#8b7635', color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
              <RotateCcw size={13} /> Reload page
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px',
                borderRadius: 9, border: '1px solid #ddd5c4', background: 'transparent', color: '#2d2a24',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
              <Home size={13} /> Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
