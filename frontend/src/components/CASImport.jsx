/**
 * CASImport.jsx — Modal for uploading a CAMS/KFinTech PDF statement.
 * Parses the PDF server-side, previews the extracted funds + transactions,
 * and merges them into the user's portfolio on confirm.
 */
import { useState, useRef } from 'react';
import { Upload, FileText, X, CheckCircle, AlertTriangle, Info, Lock, Loader2 } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export default function CASImport({ onClose, onImport }) {
  const [file, setFile]           = useState(null);
  const [password, setPassword]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [result, setResult]       = useState(null);
  const [selectedCodes, setSelectedCodes] = useState({}); // scheme_code -> bool
  const inputRef = useRef(null);

  async function upload() {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (password) form.append('password', password);
      const token = localStorage.getItem('auth_token');
      const resp = await fetch(`${API_BASE}/data/import-cas`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` }));
        throw new Error(err.detail || 'Failed to parse');
      }
      const data = await resp.json();
      setResult(data);
      // Auto-select all matched funds
      const sel = {};
      (data.funds || []).forEach(f => { if (f.matched) sel[f.scheme_code] = true; });
      setSelectedCodes(sel);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function confirmImport() {
    if (!result) return;
    const toImport = (result.funds || [])
      .filter(f => f.matched && selectedCodes[f.scheme_code])
      .map(f => ({
        scheme_code:       f.scheme_code,
        name:              f.matched_name,
        category:          f.category,
        investment_amount: f.total_invested,
        monthly_sip:       0,
        purchase_date:     f.purchase_date,
        plan_type:         (f.raw_name || '').toLowerCase().includes('regular') ? 'Regular' : 'Direct',
        transactions:      f.transactions.map(t => ({ date: t.date, amount: t.amount, type: t.type, note: t.note })),
      }));
    onImport(toImport);
  }

  const matched   = (result?.funds || []).filter(f => f.matched);
  const unmatched = (result?.funds || []).filter(f => !f.matched);
  const selectedCount = Object.values(selectedCodes).filter(Boolean).length;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-card" style={{
        width: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={18} style={{ color: 'var(--indigo)' }} />
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 800 }}>Import CAS Statement</h2>
              <p style={{ fontSize: 10, color: 'var(--text-3)' }}>Upload your CAMS or KFinTech consolidated statement PDF</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
          {!result && (
            <>
              {/* Explanation */}
              <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.55, display: 'flex', gap: 8 }}>
                  <Info size={13} style={{ color: 'var(--indigo)', flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Get a free CAS from <a href="https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement" target="_blank" rel="noreferrer" style={{ color: 'var(--indigo)' }}>CAMSonline</a>. It arrives as a PDF by email, usually password-protected with your PAN (in uppercase). Your file is parsed in-memory — nothing is saved on our servers.
                  </span>
                </p>
              </div>

              {/* File dropzone */}
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.toLowerCase().endsWith('.pdf')) setFile(f); }}
                onClick={() => inputRef.current?.click()}
                style={{
                  padding: 30, textAlign: 'center', cursor: 'pointer',
                  border: '2px dashed var(--border)', borderRadius: 12,
                  background: file ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)',
                  transition: 'all 0.15s',
                }}>
                <input ref={inputRef} type="file" accept=".pdf" style={{ display: 'none' }}
                  onChange={e => setFile(e.target.files[0])} />
                {file ? (
                  <>
                    <CheckCircle size={32} style={{ color: 'var(--green)', margin: '0 auto 8px', display: 'block' }} />
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{file.name}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{(file.size / 1024).toFixed(0)} KB · Click to change</p>
                  </>
                ) : (
                  <>
                    <Upload size={32} style={{ color: 'var(--text-3)', margin: '0 auto 8px', display: 'block', opacity: 0.6 }} />
                    <p style={{ fontSize: 13, fontWeight: 700 }}>Drop your CAS PDF here</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>or click to browse · max 15 MB</p>
                  </>
                )}
              </div>

              {/* Password */}
              {file && (
                <div style={{ marginTop: 14 }}>
                  <label className="label-upper" style={{ display: 'block', marginBottom: 6, gap: 4 }}>
                    <Lock size={10} style={{ display: 'inline', marginRight: 4 }} /> PDF Password (usually your PAN)
                  </label>
                  <input type="password" placeholder="ABCDE1234F"
                    value={password} onChange={e => setPassword(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-1)', fontSize: 13,
                      fontFamily: 'monospace', letterSpacing: '0.05em',
                    }} />
                  <p style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 4 }}>Leave blank if the PDF is not password-protected.</p>
                </div>
              )}
            </>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Loader2 size={28} style={{ margin: '0 auto 12px', display: 'block', color: 'var(--indigo)', animation: 'spin 1s linear infinite' }} />
              <p style={{ fontSize: 12, color: 'var(--text-2)' }}>Parsing your statement…</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>This usually takes 3–8 seconds</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, marginTop: 12 }}>
              <p style={{ fontSize: 12, color: 'var(--red)', display: 'flex', gap: 8 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </p>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <>
              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                <div style={{ padding: 12, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8 }}>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matched</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)', fontFamily: 'monospace' }}>{result.stats.matched_count}</p>
                </div>
                <div style={{ padding: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8 }}>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unmatched</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace' }}>{result.stats.unmatched_count}</p>
                </div>
                <div style={{ padding: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8 }}>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transactions</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--indigo)', fontFamily: 'monospace' }}>{result.stats.total_transactions}</p>
                </div>
              </div>

              {/* Matched funds — selectable */}
              {matched.length > 0 && (
                <>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Matched funds ({matched.length}) — uncheck to skip
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                    {matched.map(f => (
                      <label key={f.scheme_code} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                        background: selectedCodes[f.scheme_code] ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${selectedCodes[f.scheme_code] ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
                        borderRadius: 8, cursor: 'pointer',
                      }}>
                        <input type="checkbox" checked={!!selectedCodes[f.scheme_code]}
                          onChange={e => setSelectedCodes(prev => ({ ...prev, [f.scheme_code]: e.target.checked }))}
                          style={{ accentColor: 'var(--green)' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{f.matched_name}</p>
                          <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{f.category} · {f.transactions.length} txns · Since {f.purchase_date}</p>
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: 'var(--green)' }}>{formatCurrency(f.total_invested)}</p>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {/* Unmatched — informational only */}
              {unmatched.length > 0 && (
                <>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Unmatched ({unmatched.length}) — skipped (fund not in our schemes DB)
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                    {unmatched.map((f, i) => (
                      <div key={i} style={{ padding: '8px 12px', background: 'rgba(245,158,11,0.03)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 6 }}>
                        <p style={{ fontSize: 11, color: 'var(--text-2)' }}>{f.raw_name}</p>
                        <p style={{ fontSize: 9, color: 'var(--text-3)' }}>{f.transactions.length} transactions found</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 10, color: 'var(--text-3)' }}>
            {result ? `${selectedCount} of ${matched.length} funds selected` : 'Beta — parser handles most CAMS/KFin formats'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>Cancel</button>
            {!result && (
              <button onClick={upload} disabled={!file || loading} className="btn-primary" style={{ fontSize: 12 }}>
                {loading ? 'Parsing…' : 'Parse Statement'}
              </button>
            )}
            {result && selectedCount > 0 && (
              <button onClick={confirmImport} className="btn-primary" style={{ fontSize: 12 }}>
                Import {selectedCount} fund{selectedCount === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
