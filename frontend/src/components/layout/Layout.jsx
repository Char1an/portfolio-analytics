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
      </main>
    </div>
  );
}
