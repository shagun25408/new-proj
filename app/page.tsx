'use client';

import { useEffect, useRef, useState } from 'react';

type Message = {
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
};

const starterPrompts = [
  'Explain photosynthesis in simple terms',
  'Summarize the causes of World War I',
  'Give me a quick revision plan for chemistry',
];

const initialMessages: Message[] = [
  {
    role: 'assistant',
    text: 'Hi! I can answer questions, explain concepts, and pull live references when you ask for them. Try speaking or type a question below.',
  },
];

export default function Home() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any)?.SpeechRecognition || (window as any)?.webkitSpeechRecognition;
    setVoiceSupported(Boolean(SpeechRecognition));
  }, []);

  const startListening = () => {
    const SpeechRecognition =
      (window as any)?.SpeechRecognition || (window as any)?.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setQuestion(transcript.trim());
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const askQuestion = async (prompt?: string) => {
    const nextPrompt = (prompt ?? question).trim();
    if (!nextPrompt || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', text: nextPrompt }]);
    setQuestion('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: nextPrompt,
          history: messages.slice(-4),
        }),
      });

      const data = await response.json();
      const assistantText = data?.answer || 'I could not generate a response right now.';
      const assistantSources = data?.sources || [];

      setMessages((prev) => [...prev, { role: 'assistant', text: assistantText, sources: assistantSources }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Something went wrong while fetching the answer. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="app">
        <section className="hero">
          <div className="hero-card">
            <div className="eyebrow">● Study Buddy</div>
            <h1>Voice-powered AI learning assistant.</h1>
            <p className="subtitle">
              Real-time academic Q&A built for quick explanations, exam prep, and hands-free study sessions.
              Ask anything, speak naturally, and get grounded answers with live references.
            </p>

            <div className="cta-row">
              <button className="primary-btn" onClick={() => askQuestion('Explain the key idea of active recall in one minute')}>
                Try a demo ask
              </button>
              <button className="secondary-btn" onClick={isListening ? stopListening : startListening}>
                {isListening ? 'Stop listening' : 'Start voice input'}
              </button>
            </div>
          </div>

          <div className="status-box">
            <div className="metric">
              <span className="metric-label">Average latency</span>
              <span className="metric-value">&lt;5s</span>
            </div>
            <div className="metric">
              <span className="metric-label">Answer depth</span>
              <span className="metric-value">Live + guided</span>
            </div>
            <div className="metric">
              <span className="metric-label">Search mode</span>
              <span className="metric-value">SERP-backed</span>
            </div>
            <div className="metric">
              <span className="metric-label">Voice support</span>
              <span className="metric-value">{voiceSupported ? 'Ready' : 'Browser-only'}</span>
            </div>
          </div>
        </section>

        <section className="chat-section">
          <div className="chat-box">
            <div className="panel-header">
              <h2>Study chat</h2>
              <span className="muted">{isLoading ? 'Thinking…' : 'Ready'}</span>
            </div>

            <div className="messages">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                  {message.text}
                  {message.sources && message.sources.length > 0 && (
                    <div className="message-sources">
                      {message.sources.map((source) => (
                        <span key={source} className="source-pill">
                          {source}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="composer">
              <input
                className="input"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask a study question or speak into the mic..."
                onKeyDown={(event) => {
                  if (event.key === 'Enter') askQuestion();
                }}
              />

              <button className={`voice-btn ${isListening ? 'active' : ''}`} onClick={isListening ? stopListening : startListening}>
                {isListening ? 'Mic on' : 'Voice'}
              </button>
              <button className="send-btn" onClick={() => askQuestion()} disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Ask'}
              </button>
            </div>
          </div>

          <aside className="sidebar">
            <div className="panel">
              <div className="panel-header">
                <h2>Quick prompts</h2>
              </div>
              <div className="quick-prompt-grid">
                {starterPrompts.map((prompt) => (
                  <button key={prompt} className="quick-prompt" onClick={() => askQuestion(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Session focus</h2>
              </div>
              <ul className="session-list">
                <li>
                  <strong>Biology</strong>
                  <div className="muted">Cell transport recap • 12 min</div>
                </li>
                <li>
                  <strong>History</strong>
                  <div className="muted">Cold War flashcards • 8 min</div>
                </li>
                <li>
                  <strong>Math</strong>
                  <div className="muted">Derivative drill • 15 min</div>
                </li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
