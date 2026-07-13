import { useEffect, useState, useRef } from 'react';
import { Server } from 'lucide-react';
import { subscribePendingRequests } from '../services/api';

const SHOW_AFTER_MS = 5000; // only show if a request has been in-flight this long

export default function ColdStartBanner() {
  const [visible, setVisible] = useState(false);
  const pendingSinceRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const unsub = subscribePendingRequests(count => {
      if (count > 0 && pendingSinceRef.current === null) {
        pendingSinceRef.current = Date.now();
        timerRef.current = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
      } else if (count === 0) {
        pendingSinceRef.current = null;
        if (timerRef.current) clearTimeout(timerRef.current);
        setVisible(false);
      }
    });
    return () => { unsub(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
      display: 'flex', alignItems: 'center', gap: 9, padding: '9px 16px',
      background: 'rgba(20,18,14,0.95)', border: '1px solid rgba(139,118,53,0.4)',
      borderRadius: 99, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
      animation: 'fadeInDown 0.3s ease',
    }}>
      <div style={{
        width: 14, height: 14, border: '2px solid rgba(139,118,53,0.3)', borderTop: '2px solid #c9a84a',
        borderRadius: '50%', animation: 'spinRing 0.9s linear infinite', flexShrink: 0,
      }} />
      <Server size={13} style={{ color: '#c9a84a', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: '#f0ebe0', fontWeight: 600 }}>
        Waking up the server — it sleeps after inactivity on the free tier, first load takes ~30s
      </span>
    </div>
  );
}
