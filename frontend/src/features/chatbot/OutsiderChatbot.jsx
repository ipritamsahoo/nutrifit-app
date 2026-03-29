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
import InteractiveMuscleMap from './InteractiveMuscleMap';
import botIcon from './chatboticon.png';
import './OutsiderChatbot.css';

const API_URL = 'http://127.0.0.1:8000';

// Quick reply options mapped to question keywords (ORDER MATTERS — first match wins)
const QUICK_REPLIES = [
  { keywords: ['goal', 'objective', 'achieve', 'looking to', 'fitness goal'], options: ['🏋️ Build Muscle', '🔥 Lose Weight', '💪 Stay Fit', '🧘 Flexibility'] },
  { keywords: ['equipment', 'gym', 'access to'], options: ['🏠 No Equipment', '🏋️ With Equipment'] },
  { keywords: ['food', 'diet', 'veg or', 'non-veg', 'food preference'], options: ['🥬 Veg', '🍗 Non-Veg'] },
  { keywords: ['medical', 'injur', 'health issue', 'condition'], options: ['✅ No Issues', 'Back Pain', 'Knee Injury', 'Shoulder Issue'] },
  { keywords: ['focus', 'body part', 'specific area', 'particular area'], options: ['Full Body', 'Upper Body', 'Chest & Arms', 'Abs & Core', 'Legs'] },
  { keywords: ['how old', 'your age', 'what is your age', "what's your age"], options: ['18', '20', '22', '25', '30', '35'] },
  { keywords: ['your height', 'how tall', 'tall are you'], options: ['5\'4"', '5\'6"', '5\'8"', '5\'10"', '6\'0"', '6\'2"'] },
  { keywords: ['your weight', 'how much do you weigh', 'weigh'], options: ['55 kg', '60 kg', '65 kg', '70 kg', '75 kg', '80 kg', '85 kg'] },
  { keywords: ['water', 'drink', 'hydrat'], options: ['1-2 liters', '2-3 liters', '3+ liters', 'Not enough'] },
  { keywords: ['sleep', 'hours of sleep', 'rest'], options: ['4-5 hours', '6-7 hours', '7-8 hours', '8+ hours'] },
  { keywords: ['sitting', 'desk', 'active during', 'sedentary'], options: ['🪑 Desk Job', '🚶 Moderately Active', '🏃 Very Active'] },
  { keywords: ['stress', 'stress level'], options: ['😌 Low', '😐 Moderate', '😰 High'] },
];

export default function OutsiderChatbot() {
  const { currentUser, userData, logout } = useAuth();
  const navigate = useNavigate();

  // ── State ─────────────────────────────────────────
  const [messages, setMessages] = useState([
    {
      role: 'model',
      text: `Hey ${userData?.name || 'there'}! 👋 I'm your NutriFit Virtual Coach. I'm here to create a personalized fitness and diet plan just for you! Let's get started.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [detectedPlan, setDetectedPlan] = useState(null);
  const [detectedPlanId, setDetectedPlanId] = useState(null);
  const [approving, setApproving] = useState(false);
  const [showMuscleMap, setShowMuscleMap] = useState(false);

  // Track whether muscle map was already shown (prevent re-triggering)
  const muscleMapUsed = useRef(false);
  const hasStarted = useRef(false); // Prevent double-fire in React 18 StrictMode

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showMuscleMap]);

  // On mount, trigger the AI's first question (ONCE only)
  useEffect(() => {
    if (hasStarted.current) return; // Guard against StrictMode double-fire

    async function startConversation() {
      hasStarted.current = true;
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: currentUser.uid,
            messages: messages.map(m => ({ role: m.role, text: m.text })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Initial chat failed');
        const assistantMsg = { role: 'model', text: data.response };
        setMessages(prev => [...prev, assistantMsg]);
      } catch (err) {
        setMessages(prev => [
          ...prev,
          {
            role: 'model',
            text: `⚠️ Sorry, something went wrong: ${err.message}. Please try again.`,
          },
        ]);
      } finally {
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }

    const isInitialMount = messages.length === 1;
    if (isInitialMount && currentUser?.uid) {
      startConversation();
    }
  }, [currentUser]); // Depends on currentUser to ensure UID is available

  // ── Detect muscle-targeting question from AI ───────
  function checkForMuscleQuestion(responseText) {
    // Only trigger ONCE per session
    if (muscleMapUsed.current) return;

    // Extremely broad keyword detection to catch any AI rephrasing
    const muscleKeywords = [
      'specific muscle', 'muscle group', 'target muscle', 'focus on',
      'particular muscle', 'body part', 'muscle ke specific',
      'specific korte', 'any muscles', 'focus areas', 'areas of your body',
      'focus area', 'target area', 'particular body part', 'focus on certain',
      'prioritize any', 'target part', 'body areas', 'specific parts',
      'kono muscle', 'kono body part', 'focus korte chao', 'target korte chao'
    ];

    const lowerResp = responseText.toLowerCase();
    console.log("[Chatbot Debug] AI Response:", lowerResp);

    // Also trigger if the string contains both "target" AND "muscle", or "focus" AND "muscle"
    const hasFocusMuscleCombo = (lowerResp.includes('target') || lowerResp.includes('focus')) && lowerResp.includes('muscle');
    const isMuscleQuestion = hasFocusMuscleCombo || muscleKeywords.some(kw => lowerResp.includes(kw));

    if (isMuscleQuestion) {
      console.log("[Chatbot Debug] ✨ Muscle question detected! Triggering widget.");
      muscleMapUsed.current = true;
      setShowMuscleMap(true);
    }
  }

  // ── Get quick replies for last bot message ─────────
  function getQuickReplies() {
    if (loading || detectedPlan) return null;
    const lastBotMsg = [...messages].reverse().find(m => m.role === 'model' && !m.hidden);
    if (!lastBotMsg) return null;

    // Focus on the LAST question sentence to avoid matching old context
    // e.g. "Thanks for confirming your goal! Now, what equipment do you have?"
    const fullText = lastBotMsg.text.toLowerCase();
    const sentences = fullText.split(/[.!]\s*/);
    // Use the last 1-2 sentences (where the actual question is)
    const questionPart = sentences.slice(-2).join(' ');

    for (const qr of QUICK_REPLIES) {
      if (qr.keywords.some(kw => questionPart.includes(kw))) {
        return qr.options;
      }
    }
    return null;
  }

  // ── Handle quick reply click ──────────────────────
  function handleQuickReply(text) {
    // Simulate typing + submit
    setInput(text);
    // Use a tiny timeout so React updates input state before submit
    setTimeout(() => {
      const fakeEvent = { preventDefault: () => { } };
      // Directly send the message
      const userMsg = { role: 'user', text };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput('');
      setLoading(true);
      fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: currentUser.uid,
          messages: updatedMessages.map(m => ({ role: m.role, text: m.text })),
        }),
      })
        .then(res => res.json())
        .then(data => {
          const assistantMsg = { role: 'model', text: data.response };
          setMessages(prev => [...prev, assistantMsg]);
          checkForMuscleQuestion(data.response);
          if (data.plan_detected && data.plan) {
            setDetectedPlan(data.plan);
            setDetectedPlanId(data.plan_id);
          }
        })
        .catch(err => {
          setMessages(prev => [...prev, {
            role: 'model',
            text: `⚠️ Sorry, something went wrong: ${err.message}. Please try again.`,
          }]);
        })
        .finally(() => {
          setLoading(false);
          setTimeout(() => inputRef.current?.focus(), 0);
        });
    }, 50);
  }

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

      // Check if AI is asking about muscle targeting
      checkForMuscleQuestion(data.response);

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

      // Navigate to unified workspace
      navigate('/workspace');
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

  // ── Muscle map handlers ────────────────────────────
  async function sendMuscleMessage(text) {
    // Sends the selected muscles as a visible user message
    const userMsg = { role: 'user', text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: currentUser.uid,
          messages: updated.map(m => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Chat failed');
      setMessages(prev => [...prev, { role: 'model', text: data.response }]);

      checkForMuscleQuestion(data.response);

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

  function handleMuscleConfirm(selectedLabels) {
    setShowMuscleMap(false);
    const text = selectedLabels.join(', ');
    sendMuscleMessage(text);
  }

  function handleMuscleSkip() {
    setShowMuscleMap(false);
    sendMuscleMessage("I don't have a specific focus area, a balanced full-body plan is fine.");
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


      {/* Header */}
      <header className="chat-header">
        <div className="chat-brand">
          <div className="chatbot-brand-logo-wrapper">
            <img src={botIcon} alt="NutriFit Logo" className="chatbot-brand-logo" />
          </div>
          <h1>NutriFit</h1>
        </div>
        <div className="chat-actions">
          <button className="btn-logout-enhanced" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((msg, i) => {
            // Skip hidden messages (muscle selection messages sent silently)
            if (msg.hidden) return null;

            return (
              <div key={i} className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : 'bot-bubble'}`}>
                {msg.role === 'model' && (
                  <div className="bubble-avatar custom-logo-wrapper">
                    <img src={botIcon} alt="NutriFit Bot" className="custom-bot-logo" />
                  </div>
                )}
                
                {msg.role === 'user' && (
                  <div className="bubble-avatar user-avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                )}

                <div
                  className="bubble-text"
                  dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }}
                />
              </div>
            );
          })}

          {/* Loading indicator */}
          {loading && (
            <div className="chat-bubble bot-bubble">
              <div className="bubble-avatar custom-logo-wrapper">
                <img src={botIcon} alt="NutriFit Bot" className="custom-bot-logo" />
              </div>
              <div className="bubble-text typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}

          {/* Interactive Muscle Map Widget */}
          {showMuscleMap && (
            <InteractiveMuscleMap
              onConfirm={handleMuscleConfirm}
              onSkip={handleMuscleSkip}
            />
          )}

          {/* Plan detected banner */}
          {detectedPlan && (
            <div className="plan-detected-banner">
              <div className="pdb-content">
                <span className="pdb-icon">✨</span>
                <div className="pdb-text">
                  <h3>Plan Ready</h3>
                  <p>A 7-day fitness & nutrition guide is optimized for you.</p>
                </div>
              </div>
              <div className="pdb-actions">
                <button className="btn-approve" onClick={handleApprovePlan} disabled={approving}>
                  {approving ? 'Saving...' : 'Approve & Save'}
                </button>
                <button className="btn-modify" onClick={handleModifyPlan}>
                  Modify
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Reply Pills */}
        {getQuickReplies() && (
          <div className="quick-replies">
            {getQuickReplies().map((opt, i) => (
              <button key={i} className="qr-pill" onClick={() => handleQuickReply(opt)}>
                {opt}
              </button>
            ))}
          </div>
        )}

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
