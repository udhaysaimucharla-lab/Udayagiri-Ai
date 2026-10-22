import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "udayagiri-ai-chats-v2";
const welcomeText = "Namaste! 🙏 I'm Udayagiri AI. Ask me anything you'd like to learn or explore. I can chat in English or Telugu, depending on your question.";

function makeChat() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "New chat",
    updatedAt: Date.now(),
    messages: [{ role: "assistant", text: welcomeText }]
  };
}

function titleFrom(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 32 ? clean.slice(0, 32) + "…" : clean || "New chat";
}

function readSavedChats() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(value) && value.length) return value;
  } catch { /* invalid or unavailable local storage */ }
  return [makeChat()];
}

function chooseVoice(language) {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (language === "te") {
    return voices.find(v => /^te([-_]|$)/i.test(v.lang)) || null;
  }
  return voices.find(v => /^en-IN$/i.test(v.lang))
    || voices.find(v => /^en[-_]IN/i.test(v.lang))
    || voices.find(v => /^en/i.test(v.lang))
    || null;
}

function speak(text, language) {
  if (!("speechSynthesis" in window)) {
    alert("Voice playback is not supported in this browser.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === "te" ? "te-IN" : "en-IN";
  utterance.rate = 0.96;
  const voice = chooseVoice(language);
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

export default function App() {
  const [chats, setChats] = useState(readSavedChats);
  const [activeId, setActiveId] = useState(() => readSavedChats()[0]?.id);
  const [input, setInput] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceLanguage, setVoiceLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); }
    catch { setError("Browser storage is full or unavailable. You may need to delete older chats."); }
  }, [chats]);

  useEffect(() => {
    if (!chats.some(chat => chat.id === activeId) && chats[0]) setActiveId(chats[0].id);
  }, [chats, activeId]);

  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const activeChat = useMemo(
    () => chats.find(chat => chat.id === activeId) || chats[0],
    [chats, activeId]
  );

  function createChat() {
    const chat = makeChat();
    setChats(old => [chat, ...old]);
    setActiveId(chat.id);
    setInput("");
    setError("");
    setSidebarOpen(false);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function deleteChat(id, event) {
    event?.stopPropagation();
    const remaining = chats.filter(chat => chat.id !== id);
    const next = remaining.length ? remaining : [makeChat()];
    setChats(next);
    if (activeId === id) setActiveId(next[0].id);
    setError("");
  }

  function updateChat(id, updater) {
    setChats(old => old.map(chat => chat.id === id ? updater(chat) : chat));
  }

  async function sendMessage(raw = input) {
    const question = raw.trim();
    if (!question || !activeChat || busy) return;

    const chatId = activeChat.id;
    const userMessage = { role: "user", text: question };
    const historyForApi = [...activeChat.messages, userMessage]
      .filter((message, index) => !(index === 0 && message.role === "assistant" && message.text === welcomeText))
      .slice(-12);

    updateChat(chatId, chat => ({
      ...chat,
      title: chat.messages.length <= 1 ? titleFrom(question) : chat.title,
      updatedAt: Date.now(),
      messages: [...chat.messages, userMessage]
    }));
    setInput("");
    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyForApi })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The AI request failed.");
      const answer = String(data.answer || "").trim();
      if (!answer) throw new Error("The AI returned an empty answer.");

      updateChat(chatId, chat => ({
        ...chat,
        updatedAt: Date.now(),
        messages: [...chat.messages, { role: "assistant", text: answer }]
      }));
      if (voiceEnabled) speak(answer, voiceLanguage);
    } catch (err) {
      const message = err.message || "Could not connect to Udayagiri AI.";
      setError(message);
      updateChat(chatId, chat => ({
        ...chat,
        updatedAt: Date.now(),
        messages: [...chat.messages, {
          role: "assistant",
          text: `I couldn't get an AI response. ${message}`
        }]
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      {sidebarOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">ఉ</div>
          <div><strong>Udayagiri AI</strong><span>మీ ఆలోచనలకు కొత్త దారి</span></div>
          <button className="close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="Close menu">×</button>
        </div>
        <button className="new-chat" onClick={createChat}>＋ &nbsp; New chat</button>
        <div className="history-heading">RECENT CHATS</div>
        <div className="chat-list">
          {chats.slice().sort((a,b) => b.updatedAt - a.updatedAt).map(chat => (
            <div className={`chat-item ${chat.id === activeChat?.id ? "active" : ""}`} key={chat.id}>
              <button className="chat-select" onClick={() => { setActiveId(chat.id); setInput(""); setError(""); setSidebarOpen(false); }}>
                <span className="chat-icon">◷</span><span className="chat-title">{chat.title}</span>
              </button>
              <button className="delete-chat" title="Delete chat" aria-label={`Delete ${chat.title}`} onClick={(e) => deleteChat(chat.id, e)}>×</button>
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="status"><span className="dot" /> Gemini connection</div>
          <p>Chat history stays in this browser on this device.</p>
          <p className="privacy-note">Clearing browser data can erase saved chats.</p>
        </div>
      </aside>

      <section className="chat-area">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open chat history">☰</button>
          <div className="mobile-brand"><span className="mini-mark">ఉ</span> Udayagiri AI</div>
          <div className="topbar-right">
            <label className="voice-toggle">
              <input type="checkbox" checked={voiceEnabled} onChange={e => setVoiceEnabled(e.target.checked)} />
              <span>🔊 Voice</span>
            </label>
            <select className="voice-select" value={voiceLanguage} onChange={e => setVoiceLanguage(e.target.value)} aria-label="Voice language">
              <option value="en">English</option>
              <option value="te">తెలుగు</option>
            </select>
          </div>
        </header>

        <div className="conversation" key={activeChat?.id}>
          {activeChat?.messages.length <= 1 ? (
            <div className="welcome">
              <div className="welcome-mark">ఉ</div>
              <div className="namaste">నమస్తే • NAMASTE</div>
              <h1>What can I help you with?</h1>
              <p>Rooted in Indian warmth. Open to the whole world.</p>
              <div className="suggestions">
                {[
                  ["🪷", "Indian culture", "Tell me about Indian culture"],
                  ["📚", "Learn something", "Explain photosynthesis simply"],
                  ["💻", "Explore coding", "Show me a simple JavaScript example"]
                ].map(([icon, title, prompt]) => (
                  <button className="suggestion" key={title} onClick={() => sendMessage(prompt)} disabled={busy}>
                    <span>{icon}</span><strong>{title}</strong><small>{prompt}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {activeChat.messages.slice(1).map((message, index) => (
                <div className={`message-row ${message.role}`} key={`${activeChat.id}-${index}`}>
                  <div className={`avatar ${message.role}`}>{message.role === "user" ? "Y" : "ఉ"}</div>
                  <div className="message-content">
                    <strong>{message.role === "user" ? "You" : "Udayagiri AI"}</strong>
                    <p>{message.text}</p>
                    {message.role === "assistant" && (
                      <button className="speak-button" onClick={() => speak(message.text, voiceLanguage)} title="Read answer aloud">🔊 Read aloud</button>
                    )}
                  </div>
                </div>
              ))}
              {busy && <div className="typing"><span /> <span /> <span /> <small>Udayagiri AI is thinking…</small></div>}
              <div id="bottom-anchor" />
            </div>
          )}
          {error && <div className="error-message" role="alert">{error}</div>}
        </div>

        <form className="composer" onSubmit={e => { e.preventDefault(); sendMessage(); }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Message Udayagiri AI..." rows="1" aria-label="Message Udayagiri AI" />
          <button className="send-button" type="submit" disabled={!input.trim() || busy} aria-label="Send message">{busy ? "…" : "↑"}</button>
          <div className="composer-hint">AI can make mistakes. Check important information.</div>
        </form>
        <footer>Udayagiri AI · భారతీయ స్ఫూర్తితో తయారు చేయబడింది</footer>
      </section>
    </main>
  );
}