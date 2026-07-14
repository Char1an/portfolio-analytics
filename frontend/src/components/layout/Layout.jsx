import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ColdStartBanner from '../ColdStartBanner';

export default function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
      {/* Ambient blobs */}
      <div className="ambient-blob" style={{ width: 500, height: 500, background: '#c4a035', top: -150, left: -100 }} />
      <div className="ambient-blob" style={{ width: 400, height: 400, background: '#8b7635', top: '50%', right: -120, animationDelay: '-8s' }} />

      <ColdStartBanner />
      <Sidebar />

      {/* Main Content — offset by sidebar width */}
      <main style={{
        marginLeft: 236,
        flex: 1,
        padding: 24,
        position: 'relative',
        zIndex: 10,
        minWidth: 0,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Outlet />
        </div>

        {/* ── Disclaimer footer ── */}
        <footer style={{
          marginTop: 48, paddingTop: 20, paddingBottom: 20,
          borderTop: '1px solid #ddd5c4',
          maxWidth: 1200, margin: '48px auto 0',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 10, color: '#9a9283' }}>
            <div style={{ maxWidth: 640 }}>
              <p style={{ fontWeight: 700, color: '#6b6558', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 9 }}>
                Disclaimer
              </p>
              <p style={{ lineHeight: 1.55 }}>
                Folio Klarity is an <strong>educational analytics tool</strong>, not investment advice.
                Data is fetched from <a href="https://www.mfapi.in" target="_blank" rel="noreferrer" style={{ color: '#8b7635' }}>MFAPI.in</a> (unofficial AMFI mirror) and cached for up to 24 hours.
                Historical returns don't predict future performance. Consult a SEBI-registered advisor before making investment decisions.
                Your portfolio data is stored locally in your browser; opt-in cloud sync uses HMAC-SHA256 auth.
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 700, color: '#6b6558', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 9, marginBottom: 4 }}>Folio Klarity</p>
              <p>
                Open source ·{' '}
                <a href="https://github.com/Char1an/portfolio-analytics" target="_blank" rel="noreferrer" style={{ color: '#8b7635' }}>GitHub</a>
                {' · '}
                <a href="https://folio-klarity-api.onrender.com/docs" target="_blank" rel="noreferrer" style={{ color: '#8b7635' }}>API</a>
              </p>
              <p style={{ marginTop: 3 }}>Not affiliated with any AMC.</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
