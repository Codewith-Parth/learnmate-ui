/* ═══════════════════════════════════════════════════════════════════════════
   LearnMate – Main Script
   IBM Granite via watsonx.ai
═══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Marked.js config ─────────────────────────────────────────────────────────
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const messagesEl    = document.getElementById('messages');
const welcomeScreen = document.getElementById('welcomeScreen');
const chatArea      = document.getElementById('chatArea');
const userInput     = document.getElementById('userInput');
const sendBtn       = document.getElementById('sendBtn');
const clearBtn      = document.getElementById('clearBtn');
const menuBtn       = document.getElementById('menuBtn');
const sidebar       = document.getElementById('sidebar');
const sidebarClose  = document.getElementById('sidebarClose');
const btnNewChat    = document.getElementById('btnNewChat');
const btnHistory    = document.getElementById('btnHistory');
const btnProgress   = document.getElementById('btnProgress');
const btnRoadmap    = document.getElementById('btnRoadmap');

// ── State ────────────────────────────────────────────────────────────────────
let conversationHistory = [];   // [{role, content}, ...]
let isGenerating        = false;
let milestones          = [];   // progress tracking items
let studentProfile      = {};   // collected profile data

// ── Load persisted data ───────────────────────────────────────────────────────
(function loadState() {
  try {
    const saved = localStorage.getItem('learnmate_history');
    if (saved) {
      const parsed = JSON.parse(saved);
      conversationHistory = parsed.history || [];
      milestones          = parsed.milestones || [];
      studentProfile      = parsed.profile || {};
      if (conversationHistory.length > 0) {
        hideWelcome();
        conversationHistory.forEach(msg => renderMessage(msg.role, msg.content, false));
      }
    }
  } catch (_) { /* ignore parse errors */ }
})();

// ── Persist state ─────────────────────────────────────────────────────────────
function saveState() {
  try {
    localStorage.setItem('learnmate_history', JSON.stringify({
      history: conversationHistory,
      milestones,
      profile: studentProfile,
    }));
  } catch (_) {}
}

// ── Welcome ───────────────────────────────────────────────────────────────────
function hideWelcome() {
  welcomeScreen.style.display = 'none';
}

function showWelcome() {
  welcomeScreen.style.display = 'flex';
}

// ── Textarea auto-resize ──────────────────────────────────────────────────────
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 180) + 'px';
  sendBtn.disabled = userInput.value.trim() === '';
});

// Send on Enter (Shift+Enter = newline)
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
    if (prompt) {
      userInput.value = prompt;
      userInput.dispatchEvent(new Event('input'));
      handleSend();
    }
  });
});

// ── Clear chat ────────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  if (isGenerating) return;
  if (!confirm('Clear the entire conversation?')) return;
  conversationHistory = [];
  milestones = [];
  studentProfile = {};
  messagesEl.innerHTML = '';
  showWelcome();
  saveState();
  showToast('Conversation cleared');
});

// ── Sidebar toggle ────────────────────────────────────────────────────────────
menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));

document.addEventListener('click', (e) => {
  if (window.innerWidth <= 768 &&
      sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      !menuBtn.contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

// ── Nav buttons ───────────────────────────────────────────────────────────────
btnNewChat.addEventListener('click', () => {
  clearBtn.click();
  sidebar.classList.remove('open');
});

btnHistory.addEventListener('click', () => {
  showToast('History is stored in this browser session');
  sidebar.classList.remove('open');
});

btnProgress.addEventListener('click', () => {
  openProgressPanel();
  sidebar.classList.remove('open');
});

btnRoadmap.addEventListener('click', () => {
  openRoadmapPanel();
  sidebar.classList.remove('open');
});

// ── Main send handler ─────────────────────────────────────────────────────────
async function handleSend() {
  const text = userInput.value.trim();
  if (!text || isGenerating) return;

  // Reset input
  userInput.value = '';
  userInput.style.height = 'auto';
  sendBtn.disabled = true;

  hideWelcome();

  // Render user message
  renderMessage('user', text);

  // Add to history
  conversationHistory.push({ role: 'user', content: text });
  saveState();

  // Extract any profile updates from user text
  extractProfileData(text);

  // Show typing
  const typingId = showTyping();

  isGenerating = true;
  setInputState(false);

  try {
    const response = await callWatsonxAPI(conversationHistory);
    removeTyping(typingId);
    renderMessage('assistant', response);
    conversationHistory.push({ role: 'assistant', content: response });

    // Extract milestones from the response
    extractMilestones(response);
    saveState();
  } catch (err) {
    removeTyping(typingId);
    renderMessage('assistant', buildErrorMessage(err));
  } finally {
    isGenerating = false;
    setInputState(true);
    userInput.focus();
  }
}

// ── IBM watsonx API call ──────────────────────────────────────────────────────
async function callWatsonxAPI(history) {
  const messages = [
    { role: 'system', content: LEARNMATE_CONFIG.SYSTEM_PROMPT },
    ...history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
  ];

  const body = {
    model_id:   LEARNMATE_CONFIG.MODEL_ID,
    project_id: LEARNMATE_CONFIG.PROJECT_ID,
    messages,
    parameters: {
      max_new_tokens:     LEARNMATE_CONFIG.MAX_NEW_TOKENS,
      temperature:        LEARNMATE_CONFIG.TEMPERATURE,
      top_p:              LEARNMATE_CONFIG.TOP_P,
      repetition_penalty: LEARNMATE_CONFIG.REPETITION_PENALTY,
    }
  };

  const res = await fetch(LEARNMATE_CONFIG.WATSONX_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': LEARNMATE_CONFIG.IAM_TOKEN,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();

  // /text/chat response shape: data.choices[0].message.content
  const content =
    data?.choices?.[0]?.message?.content ||
    data?.results?.[0]?.generated_text ||
    '';

  if (!content.trim()) throw new Error('Empty response from model.');
  return content.trim();
}

// ── Render a message bubble ───────────────────────────────────────────────────
function renderMessage(role, content, scroll = true) {
  const isUser = role === 'user';
  const div    = document.createElement('div');
  div.className = `message ${isUser ? 'user' : 'bot'}`;

  // Avatar
  const avatar = document.createElement('div');
  avatar.className = `avatar ${isUser ? 'user' : 'bot'}`;
  if (isUser) {
    avatar.textContent = getInitials();
  } else {
    const img = document.createElement('img');
    img.src = 'assets/LearnMate.png';
    img.alt = 'LearnMate';
    avatar.appendChild(img);
  }

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (isUser) {
    bubble.textContent = content;
  } else {
    // Render markdown
    bubble.innerHTML = typeof marked !== 'undefined'
      ? marked.parse(content)
      : escapeHtml(content).replace(/\n/g, '<br>');

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => copyToClipboard(content, copyBtn));
    bubble.appendChild(copyBtn);
  }

  // Timestamp
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = formatTime(new Date());

  const col = document.createElement('div');
  col.className = 'msg-col';
  col.appendChild(bubble);
  col.appendChild(meta);

  div.appendChild(avatar);
  div.appendChild(col);

  messagesEl.appendChild(div);

  if (scroll) scrollToBottom();
}

// ── Typing indicator ──────────────────────────────────────────────────────────
let typingCounter = 0;

function showTyping() {
  const id = ++typingCounter;
  const div = document.createElement('div');
  div.className = 'message bot';
  div.dataset.typingId = id;

  const avatar = document.createElement('div');
  avatar.className = 'avatar bot';
  const img = document.createElement('img');
  img.src = 'assets/LearnMate.png';
  img.alt = 'LearnMate';
  avatar.appendChild(img);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = `
    <div class="typing-indicator">
      <span></span><span></span><span></span>
    </div>`;

  div.appendChild(avatar);
  div.appendChild(bubble);
  messagesEl.appendChild(div);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  const el = messagesEl.querySelector(`[data-typing-id="${id}"]`);
  if (el) el.remove();
}

// ── Progress panel ────────────────────────────────────────────────────────────
function openProgressPanel() {
  const overlay = createOverlay('My Progress');
  const body = overlay.querySelector('.panel-body');

  if (milestones.length === 0) {
    body.innerHTML = `<div class="progress-empty">No milestones yet. Start a conversation with LearnMate to generate your learning roadmap!</div>`;
  } else {
    milestones.forEach((m, i) => {
      const item = document.createElement('div');
      item.className = 'milestone-item';

      const check = document.createElement('div');
      check.className = `milestone-check ${m.done ? 'done' : ''}`;
      check.addEventListener('click', () => {
        m.done = !m.done;
        check.classList.toggle('done', m.done);
        textEl.classList.toggle('done', m.done);
        saveState();
      });

      const textEl = document.createElement('div');
      textEl.className = `milestone-text ${m.done ? 'done' : ''}`;
      textEl.textContent = m.text;

      item.appendChild(check);
      item.appendChild(textEl);
      body.appendChild(item);
    });
  }

  document.body.appendChild(overlay);
  overlay.classList.add('open');
}

// ── Roadmap panel ─────────────────────────────────────────────────────────────
function openRoadmapPanel() {
  const overlay = createOverlay('My Roadmap');
  const body = overlay.querySelector('.panel-body');

  const roadmapMsgs = conversationHistory.filter(m =>
    m.role === 'assistant' &&
    (m.content.toLowerCase().includes('phase') ||
     m.content.toLowerCase().includes('roadmap') ||
     m.content.toLowerCase().includes('week'))
  );

  if (roadmapMsgs.length === 0) {
    body.innerHTML = `<div class="progress-empty">No roadmap generated yet. Ask LearnMate to create your personalized learning pathway!</div>`;
  } else {
    const latest = roadmapMsgs[roadmapMsgs.length - 1].content;
    body.innerHTML = typeof marked !== 'undefined'
      ? marked.parse(latest)
      : escapeHtml(latest).replace(/\n/g, '<br>');
    body.style.fontFamily = 'inherit';
    body.style.fontSize = '13.5px';
    body.style.lineHeight = '1.7';
  }

  document.body.appendChild(overlay);
  overlay.classList.add('open');
}

// ── Generic overlay builder ───────────────────────────────────────────────────
function createOverlay(title) {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';

  overlay.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <h2>${escapeHtml(title)}</h2>
        <button class="panel-close">&#10005;</button>
      </div>
      <div class="panel-body"></div>
    </div>`;

  overlay.querySelector('.panel-close').addEventListener('click', () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 300);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
    }
  });

  return overlay;
}

// ── Milestone extraction ──────────────────────────────────────────────────────
function extractMilestones(text) {
  // Look for phase headers or bullet list items that look like milestones
  const phaseRegex = /\*\*Phase\s*\d+[^*]*\*\*|##\s+Phase\s*\d+[^\n]*/gi;
  const matches = text.match(phaseRegex);
  if (matches) {
    matches.forEach(m => {
      const clean = m.replace(/\*\*/g, '').replace(/##\s+/, '').trim();
      if (!milestones.find(x => x.text === clean)) {
        milestones.push({ text: clean, done: false });
      }
    });
  }
}

// ── Student profile extraction (lightweight) ──────────────────────────────────
function extractProfileData(text) {
  const lower = text.toLowerCase();

  // Career goal
  const careers = ['frontend', 'backend', 'full stack', 'data scientist', 'ai engineer',
    'machine learning', 'cybersecurity', 'cloud engineer', 'devops', 'ui/ux',
    'mobile', 'game developer', 'software engineer'];
  careers.forEach(c => {
    if (lower.includes(c)) studentProfile.careerGoal = c;
  });

  // Skill level
  if (lower.includes('beginner') || lower.includes('no experience')) studentProfile.level = 'Beginner';
  if (lower.includes('intermediate'))                                  studentProfile.level = 'Intermediate';
  if (lower.includes('advanced') || lower.includes('experienced'))    studentProfile.level = 'Advanced';

  // Hours
  const hoursMatch = lower.match(/(\d+)\s*hours?\s*(per|a)?\s*week/);
  if (hoursMatch) studentProfile.hoursPerWeek = parseInt(hoursMatch[1]);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function scrollToBottom() {
  requestAnimationFrame(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

function setInputState(enabled) {
  userInput.disabled = !enabled;
  sendBtn.disabled   = !enabled || userInput.value.trim() === '';
  if (enabled) userInput.focus();
}

function getInitials() {
  if (studentProfile.name) {
    return studentProfile.name.slice(0, 2).toUpperCase();
  }
  return 'ME';
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 2000);
  }).catch(() => showToast('Copy failed'));
}

function buildErrorMessage(err) {
  const isCredentialError =
    err.message.includes('401') ||
    err.message.includes('403') ||
    LEARNMATE_CONFIG.IAM_TOKEN.includes('YOUR_IBM');

  if (isCredentialError) {
    return `**Configuration required**

To connect LearnMate to IBM Granite, update \`config.js\` with your credentials:

\`\`\`
IAM_TOKEN:  "Bearer <your_ibm_iam_token>"
PROJECT_ID: "<your_watsonx_project_id>"
\`\`\`

**How to get credentials:**
1. Log in to [IBM Cloud](https://cloud.ibm.com)
2. Run \`ibmcloud iam oauth-tokens\` to get your IAM token
3. Open your watsonx.ai project and copy the Project ID from Settings

Once configured, refresh this page and start chatting!`;
  }

  return `Sorry, I encountered an error: \`${err.message}\`

Please check your internet connection and IBM credentials in \`config.js\`, then try again.`;
}

// ── Toast notification ────────────────────────────────────────────────────────
let toastTimeout;

function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2400);
}

// ── Initial greeting (if fresh session) ──────────────────────────────────────
(function maybeGreet() {
  if (conversationHistory.length === 0) {
    // No greeting pushed to history — let user initiate; welcome screen shown.
  }
})();
