/**
 * Agent.jsx — Folio Klarity Chat Interface
 * LLM-powered chatbot backed by Groq + Llama 3.3 70B.
 * Supports tool-call indicators, suggested questions, rate-limit display.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Send, Loader2, AlertCircle, Zap, BarChart3, Shield,
  Scissors, Layers, FlaskConical, TrendingUp, Search, RefreshCw,
  ChevronDown, User, Sparkles, Info,
} from 'lucide-react';
import { agentChat, agentStatus } from '../services/api';
import { usePortfolio } from '../hooks/usePortfolio';

// ── Tool display config ──────────────────────────────────────────────────────
const TOOL_META = {
  analyze_portfolio_performance: { label: 'Performance',      icon: BarChart3,    color: '#6366f1' },
  analyze_portfolio_risk:        { label: 'Risk Analysis',    icon: Shield,       color: '#f59e0b' },
  tax_harvest_analysis:          { label: 'Tax Harvesting',   icon: Scissors,     color: '#34d399' },
  portfolio_overlap:             { label: 'Overlap',          icon: Layers,       color: '#8b5cf6' },
  factor_attribution:            { label: 'Factor Attribution', icon: FlaskConical, color: '#06b6d4' },
  optimize_portfolio:            { label: 'Optimizer',        icon: TrendingUp,   color: '#f97316' },
  forecast_nav:                  { label: 'NAV Forecast',     icon: Zap,          color: '#ec4899' },
  search_funds:                  { label: 'Fund Search',      icon: Search,       color: '#a3e635' },
  get_fund_nav_summary:          { label: 'NAV Summary',      icon: BarChart3,    color: '#64748b' },
};

// ── Suggested starter questions ──────────────────────────────────────────────
const SUGGESTIONS = [
  { text: 'How is my portfolio performing overall?',       icon: BarChart3 },
  { text: 'Which funds have the highest risk?',            icon: Shield },
  { text: 'Are there any tax loss harvesting opportunities?', icon: Scissors },
  { text: 'How diversified is my portfolio?',              icon: Layers },
  { text: 'What is the factor attribution of my funds?',  icon: FlaskConical },
  { text: 'Optimize my portfolio for max Sharpe ratio.',   icon: TrendingUp },
];

// ── Helper: format assistant text with basic markdown ───────────────────────
function formatText(text) {
  if (!text) return null;
  // Bold **...**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#e2e8f0', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    // Handle newlines
    return part.split('\n').map((line, j, arr) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </span>
    ));
  });
}

// ── Tool pill component ──────────────────────────────────────────────────────
function ToolPill({ toolName }) {
  const meta = TOOL_META[toolName] || { label: toolName, icon: Zap, color: '#6366f1' };
  const Icon = meta.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20,
      background: `${meta.color}18`,
      border: `1px solid ${meta.color}40`,
      fontSize: 10, fontWeight: 700, color: meta.color,
      letterSpacing: '0.04em', marginRight: 4, marginBottom: 4,
    }}>
      <Icon size={9} strokeWidth={2.5} />
      {meta.label}
    </span>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  const isError = msg.role === 'error';

  if (isError) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', padding: '4px 0',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: 520,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 12, padding: '10px 14px',
        }}>
          <AlertCircle size={14} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 12.5, color: '#f87171', lineHeight: 1.55, margin: 0 }}>{msg.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: '4px 0',
    }}>
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isUser
          ? 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))'
          : 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(6,182,212,0.2))',
        border: `1px solid ${isUser ? 'rgba(99,102,241,0.4)' : 'rgba(52,211,153,0.3)'}`,
      }}>
        {isUser
          ? <User size={14} color="#818cf8" />
          : <Bot size={14} color="#34d399" />
        }
      </div>

      {/* Bubble */}
      <div style={{ maxWidth: 'min(72%, 620px)', minWidth: 0 }}>
        {/* Tool pills (assistant only) */}
        {!isUser && msg.tools_used && msg.tools_used.length > 0 && (
          <div style={{ marginBottom: 6, display: 'flex', flexWrap: 'wrap' }}>
            {[...new Set(msg.tools_used)].map(t => <ToolPill key={t} toolName={t} />)}
          </div>
        )}

        <div style={{
          background: isUser
            ? 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.12))'
            : 'rgba(15,23,42,0.7)',
          border: `1px solid ${isUser ? 'rgba(99,102,241,0.3)' : 'rgba(51,65,85,0.6)'}`,
          borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
          padding: '10px 14px',
          backdropFilter: 'blur(8px)',
        }}>
          <p style={{
            fontSize: 13, lineHeight: 1.65, color: isUser ? '#c4cde8' : '#cbd5e1',
            margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {isUser ? msg.content : formatText(msg.content)}
          </p>
        </div>

        {/* Timestamp */}
        {msg.timestamp && (
          <p style={{ fontSize: 9.5, color: '#334155', marginTop: 3, textAlign: isUser ? 'right' : 'left' }}>
            {msg.timestamp}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator({ toolsInProgress }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 0' }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(6,182,212,0.2))',
        border: '1px solid rgba(52,211,153,0.3)',
      }}>
        <Bot size={14} color="#34d399" />
      </div>
      <div style={{
        background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(51,65,85,0.6)',
        borderRadius: '4px 14px 14px 14px', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: '50%', background: '#34d399',
              animation: `typingDot 1.2s ease-in-out ${i * 0.2}s infinite`,
              display: 'inline-block',
            }} />
          ))}
        </div>
        {toolsInProgress && (
          <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
            Analysing your portfolio…
          </span>
        )}
      </div>
    </div>
  );
}

// ── Rate limit bar ────────────────────────────────────────────────────────────
function RateBadge({ remaining }) {
  if (remaining === null) return null;
  const pct = (remaining / 5) * 100;
  const color = remaining === 0 ? '#f87171' : remaining <= 2 ? '#f59e0b' : '#34d399';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 48, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
      }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 10, color, fontWeight: 600 }}>{remaining}/5 left</span>
    </div>
  );
}

// ── Main page component ──────────────────────────────────────────────────────
export default function Agent() {
  const portfolio = usePortfolio();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState(() => {
    try { return sessionStorage.getItem('agent_draft') || ''; } catch { return ''; }
  });

  // Persist draft so switching pages doesn't lose unsent input
  useEffect(() => {
    try { sessionStorage.setItem('agent_draft', input); } catch { /* quota exceeded */ }
  }, [input]);
  const [loading, setLoading] = useState(false);
  const [agentReady, setAgentReady] = useState(null);   // null=checking, true/false
  const [remaining, setRemaining] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // ── Check agent status on mount ──
  useEffect(() => {
    agentStatus()
      .then(r => setAgentReady(r.data.configured))
      .catch(() => setAgentReady(false));
  }, []);

  // ── Auto-scroll ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Send message ──
  const send = useCallback(async (text) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;

    const ts = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const userMsg = { id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role: 'user', content: userText, timestamp: ts };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Build conversation history (last 10 turns max for token economy)
    const history = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    // Serialize portfolio for backend (portfolioStore uses snake_case keys)
    const portfolioPayload = (portfolio || []).map(f => ({
      scheme_code:       String(f.scheme_code || ''),
      name:              f.name || f.scheme_code || '',
      category:          f.category || '',
      investment_amount: Number(f.investment_amount || 0),
      monthly_sip:       Number(f.monthly_sip || 0),
      purchase_date:     f.purchase_date || null,
    })).filter(f => f.scheme_code);

    try {
      const res = await agentChat({ messages: history, portfolio: portfolioPayload });
      const data = res.data;
      const aiTs = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

      setMessages(prev => [...prev, {
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'assistant',
        content: data.response,
        tools_used: data.tools_used || [],
        timestamp: aiTs,
      }]);

      if (data.requests_remaining !== undefined) {
        setRemaining(data.requests_remaining);
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err.message || 'Unknown error';
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'error', content: detail }]);
      if (err?.response?.status === 429) setRemaining(0);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, loading, messages, portfolio]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setRemaining(null);
  };

  // ── Empty state suggestions ──
  const emptyState = messages.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', position: 'relative' }}>

      {/* ── Typing animation keyframes ── */}
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-4px); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .agent-suggestion:hover {
          background: rgba(99,102,241,0.12) !important;
          border-color: rgba(99,102,241,0.4) !important;
          transform: translateY(-1px);
        }
        .agent-send-btn:hover:not(:disabled) {
          background: rgba(99,102,241,0.3) !important;
        }
        .agent-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        padding: '18px 24px 14px',
        borderBottom: '1px solid rgba(51,65,85,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(6,182,212,0.2))',
            border: '1px solid rgba(52,211,153,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(52,211,153,0.15)',
          }}>
            <Bot size={18} color="#34d399" strokeWidth={2} />
          </div>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: '#e2e8f0', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
              Folio Klarity Agent
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              {agentReady === null && (
                <span style={{ fontSize: 10, color: '#64748b' }}>Connecting…</span>
              )}
              {agentReady === true && (
                <>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block', boxShadow: '0 0 5px rgba(52,211,153,0.5)' }} />
                  <span style={{ fontSize: 10, color: '#34d399', fontWeight: 600 }}>Llama 3.3 70B · Groq</span>
                </>
              )}
              {agentReady === false && (
                <>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171', display: 'inline-block' }} />
                  <span style={{ fontSize: 10, color: '#f87171', fontWeight: 600 }}>Agent offline — GROQ_API_KEY not set</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <RateBadge remaining={remaining} />
          <button
            onClick={() => setShowInfo(v => !v)}
            title="How this works"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#475569', padding: 4, display: 'flex', alignItems: 'center',
            }}
          >
            <Info size={16} />
          </button>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              title="Clear chat"
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 7, padding: '5px 10px', cursor: 'pointer', color: '#64748b',
                fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <RefreshCw size={11} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Info panel ── */}
      {showInfo && (
        <div style={{
          margin: '12px 24px 0', padding: '12px 16px',
          background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12, fontSize: 12, color: '#94a3b8', lineHeight: 1.7,
          animation: 'fadeSlideIn 0.2s ease',
        }}>
          <strong style={{ color: '#818cf8' }}>How Folio Klarity works:</strong>{' '}
          This agent uses <strong style={{ color: '#e2e8f0' }}>Llama 3.3 70B via Groq</strong> with
          live tool calling. It fetches real NAV data, runs analytics, and answers in plain English.
          Rate limit: <strong style={{ color: '#f59e0b' }}>5 messages per hour</strong> per IP (free tier).
          Your portfolio context is sent automatically so the agent knows your funds.
          <span
            onClick={() => setShowInfo(false)}
            style={{ float: 'right', cursor: 'pointer', color: '#475569', fontWeight: 700 }}
          >✕</span>
        </div>
      )}

      {/* ── Chat area ── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '20px 24px',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Empty state */}
        {emptyState && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 24,
            paddingBottom: 40,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
                background: 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(99,102,241,0.15))',
                border: '1px solid rgba(52,211,153,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 30px rgba(52,211,153,0.1)',
              }}>
                <Sparkles size={24} color="#34d399" />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0', marginBottom: 6 }}>
                Ask anything about your portfolio
              </h2>
              <p style={{ fontSize: 13, color: '#475569', maxWidth: 400 }}>
                I can analyse performance, risk, tax, overlap, factor attribution, and run ML forecasts using your live portfolio data.
              </p>
            </div>

            {/* Suggestion chips */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8,
              width: '100%', maxWidth: 560,
            }}>
              {SUGGESTIONS.map(({ text, icon }) => {
                const Icon = icon;
                return (
                <button
                  key={text}
                  className="agent-suggestion"
                  onClick={() => send(text)}
                  disabled={loading || agentReady === false}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(51,65,85,0.6)',
                    borderRadius: 10, padding: '10px 12px',
                    cursor: 'pointer', textAlign: 'left',
                    color: '#94a3b8', fontSize: 12, lineHeight: 1.4,
                    transition: 'all 0.15s', display: 'flex', gap: 8, alignItems: 'flex-start',
                  }}
                >
                  {Icon && <Icon size={13} style={{ flexShrink: 0, marginTop: 1, color: '#6366f1' }} />}
                  {text}
                </button>
                );
              })}
            </div>

            {(!portfolio || portfolio.length === 0) && (
              <p style={{
                fontSize: 11.5, color: '#f59e0b',
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 8, padding: '8px 14px', maxWidth: 400, textAlign: 'center',
              }}>
                ⚠ No funds in your portfolio yet. Add funds in Portfolio Builder for richer analysis.
              </p>
            )}
          </div>
        )}

        {/* Messages */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((msg, i) => (
            <div key={msg.id ?? i} style={{ animation: 'fadeSlideIn 0.25s ease' }}>
              <MessageBubble msg={msg} />
            </div>
          ))}
          {loading && <TypingIndicator toolsInProgress />}
        </div>

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div style={{
        borderTop: '1px solid rgba(51,65,85,0.5)',
        padding: '14px 24px 18px',
        flexShrink: 0,
      }}>
        {remaining === 0 && (
          <p style={{
            fontSize: 11.5, color: '#f87171', textAlign: 'center',
            marginBottom: 10,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8, padding: '7px 12px',
          }}>
            Rate limit reached — 5 messages per hour. Resets automatically.
          </p>
        )}
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end',
          background: 'rgba(15,23,42,0.6)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 14, padding: '8px 12px',
          transition: 'border-color 0.15s',
        }}
          onFocus={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'}
          onBlur={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              agentReady === false
                ? 'Agent offline — set GROQ_API_KEY to enable'
                : 'Ask about your portfolio… (Enter to send, Shift+Enter for newline)'
            }
            disabled={loading || agentReady === false || remaining === 0}
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#e2e8f0', fontSize: 13.5, lineHeight: 1.55, resize: 'none',
              fontFamily: 'inherit', paddingTop: 2, maxHeight: 120, overflowY: 'auto',
            }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
          />
          <button
            className="agent-send-btn"
            onClick={() => send()}
            disabled={loading || !input.trim() || agentReady === false || remaining === 0}
            style={{
              background: 'rgba(99,102,241,0.2)',
              border: '1px solid rgba(99,102,241,0.35)',
              borderRadius: 9, padding: '7px 9px',
              cursor: 'pointer', color: '#818cf8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s', flexShrink: 0,
            }}
          >
            {loading
              ? <Loader2 size={15} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
              : <Send size={15} />
            }
          </button>
        </div>
        <p style={{ fontSize: 10, color: '#1e293b', textAlign: 'center', marginTop: 8 }}>
          Folio Klarity uses live MFAPI data · Not investment advice · Free tier: 5 req/hour
        </p>
      </div>
    </div>
  );
}
