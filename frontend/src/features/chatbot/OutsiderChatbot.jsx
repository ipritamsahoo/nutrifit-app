/**
 * OutsiderChatbot.jsx
 * ====================
 * Virtual Coach Chatbot for Outsiders (self-users).
 * Multi-turn conversational AI that collects user info and generates plans.
 * When a plan is detected, shows approve/modify options.
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './OutsiderChatbot.css';

const API_URL = 'http://127.0.0.1:8000';

export default function OutsiderChatbot() {
  const { currentUser, userData, logout } = useAuth();
  const navigate = useNavigate();

  // ── State ─────────────────────────────────────────
  const [messages, setMessages] = useState([
    {
      role: 'model',
      text: `Hey ${userData?.name || 'there'}! 👋 I'm your HonFit Virtual Coach. I'm here to create a personalized fitness and diet plan just for you!\n\nLet's start — what's your main fitness goal? Are you looking to lose weight, build muscle, stay fit, or improve flexibility?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [detectedPlan, setDetectedPlan] = useState(null);
  const [detectedPlanId, setDetectedPlanId] = useState(null);
  const [approving, setApproving] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──────────────────────────────────
  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = { role: 'user', text: input.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: currentUser.uid,
          messages: updatedMessages.map(m => ({ role: m.role, text: m.text })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Chat failed');

      const assistantMsg = { role: 'model', text: data.response };
      setMessages(prev => [...prev, assistantMsg]);

      // Check if plan was detected
      if (data.plan_detected && data.plan) {
        setDetectedPlan(data.plan);
        setDetectedPlanId(data.plan_id);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'model',
        text: `⚠️ Sorry, something went wrong: ${err.message}. Please try again.`,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  // ── Approve plan ──────────────────────────────────
  async function handleApprovePlan() {
    if (!detectedPlanId) return;
    setApproving(true);

    try {
      const res = await fetch(`${API_URL}/approve-plan/${detectedPlanId}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Approval failed');

      // Navigate to outsider workspace
      navigate('/outsider-workspace');
    } catch (err) {
      alert('Failed to approve plan: ' + err.message);
    } finally {
      setApproving(false);
    }
  }

  // ── Modify plan (continue chatting) ───────────────
  function handleModifyPlan() {
    setDetectedPlan(null);
    setDetectedPlanId(null);
    setMessages(prev => [...prev, {
      role: 'user',
      text: "I'd like to modify this plan. Can we adjust it?",
    }]);
    // Trigger a new chat round
    setTimeout(async () => {
      setLoading(true);
      try {
        const allMsgs = [...messages, {
          role: 'user',
          text: "I'd like to modify this plan. Can we adjust it?",
        }];
        const res = await fetch(`${API_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: currentUser.uid,
            messages: allMsgs.map(m => ({ role: m.role, text: m.text })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        setMessages(prev => [...prev, { role: 'model', text: data.response }]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 100);
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  // ── Format message text ───────────────────────────
  function formatMessage(text) {
    // Remove JSON code blocks for cleaner display
    let clean = text.replace(/```json[\s\S]*?```/g, '');
    // Convert markdown bold
    clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Convert markdown lists
    clean = clean.replace(/^- (.*)/gm, '• $1');
    // Convert newlines to br
    clean = clean.replace(/\n/g, '<br/>');
    return clean;
  }

  // ── Render ────────────────────────────────────────
  return (
    <div className="chatbot-page">
      <div className="bg-blob blob-1" />
      <div className="bg-blob blob-2" />

      {/* Floating Dashboard Button */}
      <button className="floating-dashboard-btn" onClick={() => navigate('/outsider-workspace')}>
        📊 Workspace
      </button>

      {/* Header */}
      <header className="chat-header">
        <div className="chat-brand">
          <span>🤖</span>
          <h1>HonFit — Virtual Coach</h1>
        </div>
        <div className="chat-actions">
          <button className="btn-dashboard" onClick={() => navigate('/outsider-workspace')}>
            📊 Workspace
          </button>
          <button className="btn-ghost" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* Chat Area */}
      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : 'bot-bubble'}`}>
              {msg.role === 'model' && <div className="bubble-avatar">🤖</div>}
              <div
                className="bubble-text"
                dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }}
              />
              {msg.role === 'user' && <div className="bubble-avatar user-avatar">🙂</div>}
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="chat-bubble bot-bubble">
              <div className="bubble-avatar">🤖</div>
              <div className="bubble-text typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}

          {/* Plan detected banner */}
          {detectedPlan && (
            <div className="plan-detected-card">
              <div className="pdc-icon">🎯</div>
              <h3>Your Personalized Plan is Ready!</h3>
              <p>Your AI coach has created a complete 7-day fitness and diet plan for you.</p>
              <div className="pdc-actions">
                <button className="btn-primary" onClick={handleApprovePlan} disabled={approving}>
                  {approving ? 'Saving…' : '✅ Approve & Go to Workspace'}
                </button>
                <button className="btn-outline-sm" onClick={handleModifyPlan}>
                  🔄 Modify Plan
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form className="chat-input-area" onSubmit={handleSend}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type your message…"
            disabled={loading}
            autoFocus
          />
          <button type="submit" disabled={loading || !input.trim()} className="send-btn">
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}
