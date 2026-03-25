import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Minimize2, Send, Bot, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './DoctorChatbotWidget.css';

const API_URL = 'http://127.0.0.1:8000';

export default function DoctorChatbotWidget() {
  const { currentUser, userData } = useAuth();
  
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'model',
      text: `Hello Dr. ${userData?.name || ''}, I'm your AI Medical Assistant. How can I help you today?`
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);
  
  // Focus input when opening
  useEffect(() => {
    if (isOpen && !loading) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, loading]);

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = { role: 'user', text: input.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      // Re-using the chatbot API logic inside Doctor context
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
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'model',
        text: `⚠️ Sorry, something went wrong: ${err.message}. Please try again.`
      }]);
    } finally {
      setLoading(false);
    }
  }

  function formatMessage(text) {
    let clean = text.replace(/```json[\s\S]*?```/g, '');
    clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    clean = clean.replace(/^- (.*)/gm, '• $1');
    clean = clean.replace(/\n/g, '<br/>');
    return clean;
  }

  // Floating button state
  if (!isOpen) {
    return (
      <button 
        className="doc-chatbot-fab" 
        onClick={() => setIsOpen(true)}
        title="Open AI Assistant"
      >
        <MessageSquare size={24} />
      </button>
    );
  }

  // Open panel state
  return (
    <div className="doc-chatbot-panel">
      {/* Header */}
      <div className="doc-chatbot-header">
        <div className="doc-chatbot-title">
          <Bot size={18} />
          <span>AI Assistant</span>
        </div>
        <div className="doc-chatbot-actions">
          <button onClick={() => setIsOpen(false)} title="Close">
            <Minimize2 size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="doc-chatbot-messages cmd-scroll">
        {messages.map((msg, i) => (
          <div key={i} className={`doc-msg-row ${msg.role === 'user' ? 'user-row' : 'bot-row'}`}>
            {msg.role === 'model' && (
              <div className="doc-msg-avatar bot-avatar"><Bot size={14} /></div>
            )}
            <div 
              className={`doc-msg-bubble ${msg.role === 'user' ? 'user-bubble' : 'bot-bubble'}`}
              dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }}
            />
          </div>
        ))}
        
        {loading && (
          <div className="doc-msg-row bot-row">
            <div className="doc-msg-avatar bot-avatar"><Bot size={14} /></div>
            <div className="doc-msg-bubble bot-bubble typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form className="doc-chatbot-input-area" onSubmit={handleSend}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask me anything..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
