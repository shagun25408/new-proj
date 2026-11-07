'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';

type Page = 'dashboard' | 'study' | 'history';

type StudySession = {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  created_at: string;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
};

type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognizer;
  webkitSpeechRecognition?: new () => SpeechRecognizer;
};

const LOCAL_SESSIONS_KEY = 'study-buddy-sessions';
const quickPrompts = [
  'Explain photosynthesis in simple terms',
  'Summarize the causes of World War I',
  'Give me a quick revision plan for chemistry',
];

const initialMessages: ChatMessage[] = [
  {
    role: 'assistant',
    text: 'Hi! Ask a question, request a clear explanation, or try voice input. Your completed Q&A will appear in session history.',
  },
];

function readLocalSessions(): StudySession[] {
  try {
    const saved = window.localStorage.getItem(LOCAL_SESSIONS_KEY);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? (parsed as StudySession[]) : [];
  } catch {
    return [];
  }
}

function writeLocalSession(session: StudySession): void {
  const sessions = [session, ...readLocalSessions()].slice(0, 100);
  window.localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(sessions));
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function StudyBuddy({ page }: { page: Page }) {
  const [supabase] = useState(getSupabaseClient);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const recognitionRef = useRef<SpeechRecognizer | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const supabaseEnabled = Boolean(supabase);

  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    setVoiceSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    if (!supabase) {
      setSessions(readLocalSessions());
      return;
    }

    let active = true;
    let loadGeneration = 0;
    const loadUser = async (session: Session | null) => {
      const generation = ++loadGeneration;
      if (!active) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (session?.user) {
        const { data, error } = await supabase
          .from('study_sessions')
          .select('id, question, answer, sources, created_at')
          .order('created_at', { ascending: false })
          .limit(100);
        if (!active || generation !== loadGeneration) return;
        if (error) {
          setNotice(`Could not load cloud history: ${error.message}`);
          setSessions([]);
        } else {
          setSessions((data ?? []) as StudySession[]);
        }
      } else {
        setSessions(readLocalSessions());
      }
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthMessage(error.message);
      void loadUser(data.session);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthLoading(false);
      setAuthMessage(error instanceof Error ? error.message : 'Could not check the current sign-in session.');
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadUser(session);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (page === 'study') {
      const prompt = new URLSearchParams(window.location.search).get('prompt');
      if (prompt) setQuestion(prompt);
    }
  }, [page]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, answerLoading]);

  const weeklyActivity = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const count = sessions.filter((session) => {
        const created = new Date(session.created_at);
        return created >= date && created < nextDay;
      }).length;
      return { label: date.toLocaleDateString(undefined, { weekday: 'short' }), count };
    });
    const max = Math.max(1, ...days.map((day) => day.count));
    return days.map((day) => ({ ...day, height: Math.max(5, (day.count / max) * 100) }));
  }, [sessions]);

  const saveSession = async (session: StudySession) => {
    if (supabase && user) {
      const { data, error } = await supabase
        .from('study_sessions')
        .insert({
          user_id: user.id,
          question: session.question,
          answer: session.answer,
          sources: session.sources,
        })
        .select('id, question, answer, sources, created_at')
        .single();

      if (!error && data) {
        setSessions((current) => [data as StudySession, ...current].slice(0, 100));
        return;
      }
      setNotice(`Answer received, but cloud save failed: ${error?.message ?? 'unknown error'}`);
    }

    try {
      writeLocalSession(session);
      setSessions(readLocalSessions());
    } catch {
      setNotice('Answer received, but this browser could not save the session.');
    }
  };

  const askQuestion = async (prompt = question) => {
    const value = prompt.trim();
    if (!value || answerLoading) return;

    setMessages((current) => [...current, { role: 'user', text: value }]);
    setQuestion('');
    setAnswerLoading(true);
    setNotice('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: value,
          history: messages.slice(-6).map(({ role, text }) => ({ role, text })),
        }),
      });
      const data = (await response.json()) as { answer?: string; sources?: string[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'The assistant could not answer this question.');

      const answer = data.answer || 'I could not generate a response right now.';
      const sources = Array.isArray(data.sources) ? data.sources : [];
      setMessages((current) => [...current, { role: 'assistant', text: answer, sources }]);
      await saveSession({
        id: crypto.randomUUID(),
        question: value,
        answer,
        sources,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Please try again.';
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: `I couldn't complete that request. ${errorText}` },
      ]);
    } finally {
      setAnswerLoading(false);
    }
  };

  const toggleVoice = () => {
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice('Voice input is not supported in this browser. You can still type your question.');
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join('');
      setQuestion(transcript.trim());
    };
    recognition.onerror = () => {
      setListening(false);
      setNotice('Voice recognition stopped. Check microphone permissions and try again.');
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage('');
    const result =
      authMode === 'sign-up'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);

    if (result.error) {
      setAuthMessage(result.error.message);
    } else if (authMode === 'sign-up' && !result.data.session) {
      setAuthMessage('Account created. Check your email to confirm it, then sign in.');
    } else {
      setAuthMessage(authMode === 'sign-up' ? 'Account created and signed in.' : 'Signed in successfully.');
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setAuthMessage(error.message);
    else setAuthMessage('Signed out. Cloud history remains in your account.');
  };

  const deleteSession = async (sessionId: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    if (supabase && user) {
      const { error } = await supabase.from('study_sessions').delete().eq('id', sessionId);
      if (error) {
        setNotice(`Could not delete this session: ${error.message}`);
        return;
      }
    } else {
      try {
        const remaining = readLocalSessions().filter((item) => item.id !== sessionId);
        window.localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(remaining));
      } catch {
        setNotice('Could not update local session history.');
        return;
      }
    }
    setSessions((current) => current.filter((item) => item.id !== sessionId));
  };

  const title = page === 'dashboard' ? 'Your learning dashboard' : page === 'study' ? 'Study room' : 'Session history';
  const navItems: Array<{ label: string; href: string; key: Page }> = [
    { label: 'Overview', href: '/', key: 'dashboard' },
    { label: 'Study room', href: '/study', key: 'study' },
    { label: 'History', href: '/history', key: 'history' },
  ];

  return (
    <main className="dashboard-shell">
      <aside className="app-sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">S</span>
          <span>Study Buddy<small>AI learning companion</small></span>
        </Link>
        <div className="sidebar-label">Workspace</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`nav-link ${page === item.key ? 'selected' : ''}`}
              aria-current={page === item.key ? 'page' : undefined}
            >
              <span className="nav-indicator" />
              {item.label}
              {item.key === 'history' && <span className="nav-count">{sessions.length}</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className={`connection-dot ${supabaseEnabled ? 'connected' : ''}`} />
          <span>{supabaseEnabled ? 'Supabase configured' : 'Local demo mode'}</span>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> {title}</div>
          <div className="topbar-user">
            <span className="avatar">{user?.email?.[0]?.toUpperCase() ?? 'S'}</span>
            <span>{user?.email ?? (authLoading ? 'Checking account…' : 'Guest learner')}</span>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR STUDY SPACE</div>
              <h1>{title}</h1>
              <p className="muted">
                {page === 'dashboard' && 'A clear view of your questions, recent sessions, and weekly study rhythm.'}
                {page === 'study' && 'Ask your tutor a question by voice or text, and keep the answer for later.'}
                {page === 'history' && 'Revisit answers from your saved study sessions.'}
              </p>
            </div>
            {page !== 'study' && <Link className="primary-btn" href="/study">Start studying <span aria-hidden="true">→</span></Link>}
          </div>

          {notice && <div className="notice" role="status">{notice}</div>}

          {page === 'dashboard' && (
            <>
              <section className="stats-grid" aria-label="Study statistics">
                <article className="stat-card">
                  <span className="stat-icon blue">Q</span><span className="stat-label">Questions saved</span>
                  <strong>{sessions.length}</strong><small>Across your study sessions</small>
                </article>
                <article className="stat-card">
                  <span className="stat-icon green">7</span><span className="stat-label">Active days</span>
                  <strong>{new Set(sessions.map((session) => new Date(session.created_at).toDateString())).size}</strong><small>Days with a saved question</small>
                </article>
                <article className="stat-card">
                  <span className="stat-icon pink">↗</span><span className="stat-label">This week</span>
                  <strong>{weeklyActivity.reduce((sum, day) => sum + day.count, 0)}</strong><small>Questions answered in 7 days</small>
                </article>
              </section>

              <section className="dashboard-grid">
                <article className="panel activity-panel">
                  <div className="panel-heading">
                    <div><h2>Study activity</h2><p className="muted">Saved Q&A over the last seven days</p></div>
                    <span className="tag">LAST 7 DAYS</span>
                  </div>
                  <div className="activity-chart" aria-label="Weekly questions activity">
                    {weeklyActivity.map((day) => (
                      <div className="chart-column" key={day.label}>
                        <span className="chart-count">{day.count || ''}</span>
                        <div className="chart-track"><div className="chart-bar" style={{ height: `${day.height}%` }} /></div>
                        <span className="chart-day">{day.label}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="panel prompts-panel">
                  <div className="panel-heading">
                    <div><h2>Jump back in</h2><p className="muted">A good question starts a good session</p></div>
                  </div>
                  <div className="prompt-list">
                    {quickPrompts.map((prompt, index) => (
                      <Link className="prompt-link" href={`/study?prompt=${encodeURIComponent(prompt)}`} key={prompt}>
                        <span className={`prompt-number tone-${index + 1}`}>0{index + 1}</span><span>{prompt}</span><span aria-hidden="true">↗</span>
                      </Link>
                    ))}
                  </div>
                </article>
              </section>

              <section className="panel recent-panel">
                <div className="panel-heading">
                  <div><h2>Recent sessions</h2><p className="muted">Your latest questions and answers</p></div>
                  <Link className="text-link" href="/history">View all <span aria-hidden="true">→</span></Link>
                </div>
                <SessionList sessions={sessions.slice(0, 4)} onDelete={deleteSession} />
              </section>
            </>
          )}

          {page === 'study' && (
            <section className="study-layout">
              <article className="panel chat-panel">
                <div className="panel-heading chat-heading">
                  <div><h2>Ask your study buddy</h2><p className="muted">Answers are automatically saved to your history.</p></div>
                  <span className={`status-pill ${answerLoading ? 'working' : ''}`}><span />{answerLoading ? 'Thinking' : 'Ready'}</span>
                </div>
                <div className="chat-messages">
                  {messages.map((message, index) => (
                    <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                      <span className="message-avatar">{message.role === 'assistant' ? 'S' : 'Y'}</span>
                      <div className="message-body">
                        <span className="message-author">{message.role === 'assistant' ? 'Study Buddy' : 'You'}</span>
                        <p>{message.text}</p>
                        {message.sources && message.sources.length > 0 && (
                          <div className="source-list">{message.sources.map((source) => <span className="source-chip" key={source}>{source}</span>)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {answerLoading && <div className="typing-indicator" role="status">Study Buddy is thinking…</div>}
                  <div ref={endOfMessagesRef} />
                </div>
                <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void askQuestion(); }}>
                  <label className="sr-only" htmlFor="question">Your study question</label>
                  <input id="question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question, e.g. How does natural selection work?" />
                  <button type="button" className={`voice-btn ${listening ? 'active' : ''}`} onClick={toggleVoice} aria-label={listening ? 'Stop voice input' : 'Start voice input'}>
                    {listening ? 'Stop' : 'Voice'}
                  </button>
                  <button className="send-btn" type="submit" disabled={answerLoading || !question.trim()}>{answerLoading ? 'Thinking…' : 'Ask Buddy'}</button>
                </form>
                <div className="composer-note">Microphone access may be required for voice input. {voiceSupported ? 'Voice is supported in this browser.' : 'Voice input depends on browser support.'}</div>
              </article>
              <aside className="study-aside">
                <article className="panel">
                  <div className="panel-heading"><div><h2>Try a prompt</h2><p className="muted">Start with one of these</p></div></div>
                  <div className="prompt-list">
                    {quickPrompts.map((prompt) => <button className="prompt-link prompt-button" key={prompt} onClick={() => void askQuestion(prompt)}><span>{prompt}</span><span aria-hidden="true">→</span></button>)}
                  </div>
                </article>
                <article className="tip-card"><div className="tip-kicker">STUDY TIP</div><h3>Make it stick</h3><p>After an explanation, ask for a short quiz or a real-world example to check what you understood.</p></article>
              </aside>
            </section>
          )}

          {page === 'history' && (
            <section className="panel history-panel">
              <div className="panel-heading">
                <div><h2>Saved study sessions</h2><p className="muted">{sessions.length} {sessions.length === 1 ? 'question' : 'questions'} saved {user ? 'to your account' : 'in this browser'}.</p></div>
                <Link className="secondary-btn" href="/study">Ask a question</Link>
              </div>
              <SessionList sessions={sessions} onDelete={deleteSession} expanded />
            </section>
          )}
        </div>
      </div>

      <aside className="account-panel">
        {user ? (
          <div className="account-card">
            <div className="account-avatar">{user.email?.[0]?.toUpperCase() ?? 'S'}</div>
            <div className="account-label">SIGNED IN</div>
            <h2>Your account</h2>
            <p className="muted account-email">{user.email}</p>
            <div className="account-storage"><span className="connection-dot connected" /> Sessions synced to Supabase</div>
            <button className="secondary-btn full-width" onClick={() => void signOut()}>Sign out</button>
          </div>
        ) : (
          <div className="account-card">
            <div className="account-label">{supabaseEnabled ? 'SAVE YOUR PROGRESS' : 'LOCAL DEMO'}</div>
            <h2>{supabaseEnabled ? 'Your study account' : 'Your study space'}</h2>
            <p className="muted">{supabaseEnabled ? 'Sign in to sync your questions securely across devices.' : 'Questions are saved in this browser. Configure Supabase to enable account sign-in and cloud sync.'}</p>
            {supabaseEnabled ? (
              <form className="auth-form" onSubmit={(event) => void handleAuth(event)}>
                <label htmlFor="email">Email</label>
                <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                <label htmlFor="password">Password</label>
                <input id="password" type="password" autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" />
                <button className="primary-btn full-width" type="submit" disabled={authBusy || authLoading}>{authBusy ? 'Please wait…' : authMode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
                <button className="auth-switch" type="button" onClick={() => { setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in'); setAuthMessage(''); }}>
                  {authMode === 'sign-in' ? 'New here? Create an account' : 'Already registered? Sign in'}
                </button>
                {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
              </form>
            ) : <p className="setup-hint">Add your Supabase URL and anon key to <code>.env.local</code>, then run <code>supabase/schema.sql</code> in the Supabase SQL Editor.</p>}
          </div>
        )}
        <div className="account-footnote">Private by design. Cloud sessions are scoped to your account with row-level security.</div>
      </aside>
    </main>
  );
}

function SessionList({
  sessions,
  onDelete,
  expanded = false,
}: {
  sessions: StudySession[];
  onDelete: (sessionId: string) => void;
  expanded?: boolean;
}) {
  if (sessions.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">✦</span>
        <h3>No saved sessions yet</h3>
        <p>Ask your first question in the study room. Answers will show up here.</p>
        <Link className="text-link" href="/study">Go to study room →</Link>
      </div>
    );
  }

  return (
    <div className="session-rows">
      {sessions.map((session) => (
        <article className="session-row" key={session.id}>
          <div className="session-row-icon">Q</div>
          <div className="session-copy">
            <div className="session-meta">{formatDate(session.created_at)}</div>
            <h3>{session.question}</h3>
            <p className={expanded ? 'answer-preview expanded' : 'answer-preview'}>{session.answer}</p>
            {session.sources.length > 0 && <div className="history-sources">{session.sources.map((source) => <span className="source-chip" key={source}>{source}</span>)}</div>}
          </div>
          <button type="button" className="delete-session" onClick={() => onDelete(session.id)} aria-label={`Delete session: ${session.question}`}>Delete</button>
        </article>
      ))}
    </div>
  );
}
