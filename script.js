/* ═══════════════════════════════════════════════════════════════════════════
   LearnMate – Main Script
   IBM watsonx · Llama 3.3 70B · 100% IBM stack
═══════════════════════════════════════════════════════════════════════════ */

'use strict';

if (typeof marked !== 'undefined') {
  marked.setOptions({ breaks: true, gfm: true });
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const messagesEl    = document.getElementById('messages');
const welcomeScreen = document.getElementById('welcomeScreen');
const chatArea      = document.getElementById('chatArea');
const userInput     = document.getElementById('userInput');
const sendBtn       = document.getElementById('sendBtn');
const clearBtn      = document.getElementById('clearBtn');
const settingsBtn   = document.getElementById('settingsBtn');
const menuBtn       = document.getElementById('menuBtn');
const sidebar       = document.getElementById('sidebar');
const sidebarClose  = document.getElementById('sidebarClose');
const btnNewChat    = document.getElementById('btnNewChat');
const btnHistory    = document.getElementById('btnHistory');
const btnProgress   = document.getElementById('btnProgress');
const btnRoadmap    = document.getElementById('btnRoadmap');

// ── App state ─────────────────────────────────────────────────────────────────
let conversationHistory = [];
let isGenerating        = false;
let milestones          = [];
let studentProfile      = {};

// ═══════════════════════════════════════════════════════════════════════════
//  INIT — load persisted chat, skip setup screen entirely
// ═══════════════════════════════════════════════════════════════════════════
(function init() {
  // Hide setup overlay immediately — credentials are baked into config.js
  const overlay = document.getElementById('setupOverlay');
  if (overlay) overlay.classList.add('hidden');

  try {
    const saved = localStorage.getItem('learnmate_history');
    if (saved) {
      const parsed        = JSON.parse(saved);
      conversationHistory = parsed.history    || [];
      milestones          = parsed.milestones || [];
      studentProfile      = parsed.profile    || {};
      if (conversationHistory.length > 0) {
        hideWelcome();
        conversationHistory.forEach(msg => renderMessage(msg.role, msg.content, false));
      }
    }
  } catch (_) {}
})();

// ── Persist chat ──────────────────────────────────────────────────────────────
function saveState() {
  try {
    localStorage.setItem('learnmate_history', JSON.stringify({
      history: conversationHistory, milestones, profile: studentProfile,
    }));
  } catch (_) {}
}

function hideWelcome() { welcomeScreen.style.display = 'none'; }
function showWelcome()  { welcomeScreen.style.display = 'flex'; }

// ── Textarea ──────────────────────────────────────────────────────────────────
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 180) + 'px';
  sendBtn.disabled = userInput.value.trim() === '';
});

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled && !isGenerating) handleSend();
  }
});

sendBtn.addEventListener('click', () => {
  if (!sendBtn.disabled && !isGenerating) handleSend();
});

// ── Suggestion cards ──────────────────────────────────────────────────────────
document.querySelectorAll('.suggestion-card').forEach(card => {
  card.addEventListener('click', () => {
    const prompt = card.dataset.prompt;
    if (prompt) { userInput.value = prompt; userInput.dispatchEvent(new Event('input')); handleSend(); }
  });
});

// ── Clear ─────────────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  if (isGenerating) return;
  if (!confirm('Clear the entire conversation?')) return;
  conversationHistory = []; milestones = []; studentProfile = {};
  messagesEl.innerHTML = '';
  showWelcome(); saveState();
  showToast('Conversation cleared');
});

// ── Sidebar ───────────────────────────────────────────────────────────────────
menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 768 && sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

btnNewChat.addEventListener('click',  () => { clearBtn.click(); sidebar.classList.remove('open'); });
btnHistory.addEventListener('click',  () => { showToast('History stored in this session'); sidebar.classList.remove('open'); });
btnProgress.addEventListener('click', () => { openProgressPanel(); sidebar.classList.remove('open'); });
btnRoadmap.addEventListener('click',  () => { openRoadmapPanel();  sidebar.classList.remove('open'); });

// Settings button — no-op in baked-in mode
if (settingsBtn) settingsBtn.style.display = 'none';

// ═══════════════════════════════════════════════════════════════════════════
//  SEND HANDLER
// ═══════════════════════════════════════════════════════════════════════════
async function handleSend() {
  const text = userInput.value.trim();
  if (!text || isGenerating) return;

  userInput.value = ''; userInput.style.height = 'auto'; sendBtn.disabled = true;
  hideWelcome();
  renderMessage('user', text);
  conversationHistory.push({ role: 'user', content: text });
  saveState(); extractProfileData(text);

  const typingId = showTyping();
  isGenerating   = true;
  setInputState(false);

  try {
    const response = await callWatsonxAPI(conversationHistory);
    removeTyping(typingId);
    renderMessage('assistant', response);
    conversationHistory.push({ role: 'assistant', content: response });
    extractMilestones(response); saveState();
  } catch (err) {
    removeTyping(typingId);
    const expired = err.message.includes('401') || err.message.includes('403');
    renderMessage('assistant',
      expired
        ? `**Token expired.** The demo token has expired (they last 1 hour).\n\nThe site owner needs to refresh it. Please check back shortly! ⏳`
        : `**Error:** ${err.message}`
    );
  } finally {
    isGenerating = false; setInputState(true); userInput.focus();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  IBM watsonx API — direct call
// ═══════════════════════════════════════════════════════════════════════════
async function callWatsonxAPI(history) {
  const messages = [
    { role: 'system', content: LEARNMATE_CONFIG.SYSTEM_PROMPT },
    ...history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
  ];

  const res = await fetch(LEARNMATE_CONFIG.WATSONX_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${LEARNMATE_CONFIG.IAM_TOKEN}`,
    },
    body: JSON.stringify({
      model_id:   LEARNMATE_CONFIG.MODEL_ID,
      project_id: LEARNMATE_CONFIG.PROJECT_ID,
      messages,
      parameters: {
        max_new_tokens:     LEARNMATE_CONFIG.MAX_NEW_TOKENS,
        temperature:        LEARNMATE_CONFIG.TEMPERATURE,
        top_p:              LEARNMATE_CONFIG.TOP_P,
        repetition_penalty: LEARNMATE_CONFIG.REPETITION_PENALTY,
      }
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data    = await res.json();
  const content = data?.choices?.[0]?.message?.content || data?.results?.[0]?.generated_text || '';
  if (!content.trim()) throw new Error('Empty response from model.');
  return content.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDER MESSAGE
// ═══════════════════════════════════════════════════════════════════════════
function renderMessage(role, content, scroll = true) {
  const isUser = role === 'user';
  const div    = document.createElement('div');
  div.className = `message ${isUser ? 'user' : 'bot'}`;

  const avatar = document.createElement('div');
  avatar.className = `avatar ${isUser ? 'user' : 'bot'}`;
  if (isUser) {
    avatar.textContent = getInitials();
  } else {
    const img = document.createElement('img');
    img.src = 'assets/LearnMate.png'; img.alt = 'LearnMate';
    avatar.appendChild(img);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (isUser) {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = typeof marked !== 'undefined'
      ? marked.parse(content)
      : escapeHtml(content).replace(/\n/g, '<br>');
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn'; copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => copyToClipboard(content, copyBtn));
    bubble.appendChild(copyBtn);
  }

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = formatTime(new Date());

  const col = document.createElement('div');
  col.className = 'msg-col';
  col.appendChild(bubble); col.appendChild(meta);
  div.appendChild(avatar); div.appendChild(col);
  messagesEl.appendChild(div);
  if (scroll) scrollToBottom();
}

// ── Typing indicator ──────────────────────────────────────────────────────────
let typingCounter = 0;
function showTyping() {
  const id  = ++typingCounter;
  const div = document.createElement('div');
  div.className = 'message bot'; div.dataset.typingId = id;
  const avatar = document.createElement('div'); avatar.className = 'avatar bot';
  const img = document.createElement('img'); img.src = 'assets/LearnMate.png'; img.alt = 'LearnMate';
  avatar.appendChild(img);
  const bubble = document.createElement('div'); bubble.className = 'bubble';
  bubble.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
  div.appendChild(avatar); div.appendChild(bubble);
  messagesEl.appendChild(div); scrollToBottom();
  return id;
}
function removeTyping(id) {
  const el = messagesEl.querySelector(`[data-typing-id="${id}"]`);
  if (el) el.remove();
}

// ── Panels ────────────────────────────────────────────────────────────────────
function openProgressPanel() {
  const overlay = createOverlay('My Progress');
  const body    = overlay.querySelector('.panel-body');
  if (milestones.length === 0) {
    body.innerHTML = `<div class="progress-empty">No milestones yet. Start chatting with LearnMate to generate your roadmap!</div>`;
  } else {
    milestones.forEach(m => {
      const item = document.createElement('div'); item.className = 'milestone-item';
      const check = document.createElement('div'); check.className = `milestone-check ${m.done ? 'done' : ''}`;
      const textEl = document.createElement('div'); textEl.className = `milestone-text ${m.done ? 'done' : ''}`;
      textEl.textContent = m.text;
      check.addEventListener('click', () => {
        m.done = !m.done; check.classList.toggle('done', m.done); textEl.classList.toggle('done', m.done); saveState();
      });
      item.appendChild(check); item.appendChild(textEl); body.appendChild(item);
    });
  }
  document.body.appendChild(overlay); overlay.classList.add('open');
}

function openRoadmapPanel() {
  const overlay = createOverlay('My Roadmap');
  const body    = overlay.querySelector('.panel-body');
  const msgs    = conversationHistory.filter(m =>
    m.role === 'assistant' && (m.content.toLowerCase().includes('phase') ||
    m.content.toLowerCase().includes('roadmap') || m.content.toLowerCase().includes('week'))
  );
  body.innerHTML = msgs.length === 0
    ? `<div class="progress-empty">No roadmap yet. Ask LearnMate to create your personalized learning pathway!</div>`
    : (typeof marked !== 'undefined' ? marked.parse(msgs[msgs.length-1].content) : escapeHtml(msgs[msgs.length-1].content));
  document.body.appendChild(overlay); overlay.classList.add('open');
}

function createOverlay(title) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay';
  overlay.innerHTML = `<div class="panel"><div class="panel-header"><h2>${escapeHtml(title)}</h2><button class="panel-close">&#10005;</button></div><div class="panel-body"></div></div>`;
  overlay.querySelector('.panel-close').addEventListener('click', () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 300); });
  overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 300); }});
  return overlay;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractMilestones(text) {
  const matches = text.match(/\*\*Phase\s*\d+[^*]*\*\*|##\s+Phase\s*\d+[^\n]*/gi);
  if (matches) matches.forEach(m => {
    const clean = m.replace(/\*\*/g,'').replace(/##\s+/,'').trim();
    if (!milestones.find(x => x.text === clean)) milestones.push({ text: clean, done: false });
  });
}

function extractProfileData(text) {
  const lower = text.toLowerCase();
  ['frontend','backend','full stack','data scientist','ai engineer','machine learning',
   'cybersecurity','cloud engineer','devops','ui/ux','mobile','game developer','software engineer']
   .forEach(c => { if (lower.includes(c)) studentProfile.careerGoal = c; });
  if (lower.includes('beginner'))     studentProfile.level = 'Beginner';
  if (lower.includes('intermediate')) studentProfile.level = 'Intermediate';
  if (lower.includes('advanced'))     studentProfile.level = 'Advanced';
  const h = lower.match(/(\d+)\s*hours?\s*(per|a)?\s*week/);
  if (h) studentProfile.hoursPerWeek = parseInt(h[1]);
}

function scrollToBottom() { requestAnimationFrame(() => { chatArea.scrollTop = chatArea.scrollHeight; }); }
function setInputState(on) { userInput.disabled = !on; sendBtn.disabled = !on || !userInput.value.trim(); if (on) userInput.focus(); }
function getInitials()     { return studentProfile.name ? studentProfile.name.slice(0,2).toUpperCase() : 'ME'; }
function formatTime(d)     { return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }
function escapeHtml(s)     { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  }).catch(() => showToast('Copy failed'));
}

let toastTimeout;
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove('show'), 2500);
}
