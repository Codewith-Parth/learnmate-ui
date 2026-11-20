/* ═══════════════════════════════════════════════════════════════════════════
   LearnMate – Main Script
   Personalized AI Career & Learning Coach
   Supports: Built-in Coach Prototype · Google Gemini API · IBM watsonx.ai
═══════════════════════════════════════════════════════════════════════════ */

'use strict';

if (typeof marked !== 'undefined') {
  marked.setOptions({ breaks: true, gfm: true });
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const messagesEl       = document.getElementById('messages');
const welcomeScreen    = document.getElementById('welcomeScreen');
const chatArea         = document.getElementById('chatArea');
const userInput        = document.getElementById('userInput');
const sendBtn          = document.getElementById('sendBtn');
const clearBtn         = document.getElementById('clearBtn');
const settingsBtn      = document.getElementById('settingsBtn');
const btnSettings      = document.getElementById('btnSettings');
const menuBtn          = document.getElementById('menuBtn');
const sidebar          = document.getElementById('sidebar');
const sidebarClose     = document.getElementById('sidebarClose');
const btnNewChat       = document.getElementById('btnNewChat');
const btnHistory       = document.getElementById('btnHistory');
const btnProgress      = document.getElementById('btnProgress');
const btnRoadmap       = document.getElementById('btnRoadmap');
const topbarStatus     = document.getElementById('topbarStatus');

// Setup overlay elements
const setupOverlay     = document.getElementById('setupOverlay');
const setupClose       = document.getElementById('setupClose');
const setupProvider    = document.getElementById('setupProvider');
const sectionPrototype = document.getElementById('sectionPrototype');
const sectionGemini    = document.getElementById('sectionGemini');
const sectionWatsonx   = document.getElementById('sectionWatsonx');
const setupGeminiKey   = document.getElementById('setupGeminiKey');
const toggleGeminiKey  = document.getElementById('toggleGeminiKey');
const setupIamToken    = document.getElementById('setupIamToken');
const toggleApiKey     = document.getElementById('toggleApiKey');
const setupProjectId   = document.getElementById('setupProjectId');
const setupRegion      = document.getElementById('setupRegion');
const setupBtn         = document.getElementById('setupBtn');
const setupBtnText     = document.getElementById('setupBtnText');
const setupSpinner     = document.getElementById('setupSpinner');
const setupError       = document.getElementById('setupError');

// ── App state & settings ──────────────────────────────────────────────────────
let conversationHistory = [];
let isGenerating        = false;
let milestones          = [];
let studentProfile      = {};

let AI_CONFIG = {
  provider:        'prototype', // 'prototype' | 'gemini' | 'watsonx'
  geminiApiKey:    '',
  watsonxIamToken: '',
  watsonxProjectId:'',
  watsonxRegion:   'au-syd',
};

// ═══════════════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════════════
(function init() {
  loadConfig();
  updateStatusBadge();

  // Load chat history
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

function loadConfig() {
  try {
    const raw = localStorage.getItem('learnmate_ai_config');
    if (raw) {
      AI_CONFIG = Object.assign(AI_CONFIG, JSON.parse(raw));
    } else {
      // Default to prototype mode so the app is immediately working
      AI_CONFIG.provider = 'prototype';
      if (typeof LEARNMATE_CONFIG !== 'undefined') {
        AI_CONFIG.watsonxIamToken  = LEARNMATE_CONFIG.IAM_TOKEN || '';
        AI_CONFIG.watsonxProjectId = LEARNMATE_CONFIG.PROJECT_ID || '';
      }
    }
  } catch (_) {}
}

function saveConfig() {
  try {
    localStorage.setItem('learnmate_ai_config', JSON.stringify(AI_CONFIG));
  } catch (_) {}
}

function updateStatusBadge() {
  if (!topbarStatus) return;
  if (AI_CONFIG.provider === 'gemini' && AI_CONFIG.geminiApiKey) {
    topbarStatus.textContent = 'Online (Gemini)';
    topbarStatus.className = 'topbar-status';
  } else if (AI_CONFIG.provider === 'watsonx' && AI_CONFIG.watsonxIamToken) {
    topbarStatus.textContent = 'Online (watsonx)';
    topbarStatus.className = 'topbar-status';
  } else {
    topbarStatus.textContent = '✦ Prototype Mode';
    topbarStatus.className = 'topbar-status mode-badge-proto';
  }
}

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

// ── Sidebar & Navigation ──────────────────────────────────────────────────────
menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 768 && sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

btnNewChat.addEventListener('click',  () => { clearBtn.click(); sidebar.classList.remove('open'); });
btnHistory.addEventListener('click',  () => { showToast('History stored in this browser session'); sidebar.classList.remove('open'); });
btnProgress.addEventListener('click', () => { openProgressPanel(); sidebar.classList.remove('open'); });
btnRoadmap.addEventListener('click',  () => { openRoadmapPanel();  sidebar.classList.remove('open'); });

// ── Settings Modal ────────────────────────────────────────────────────────────
function openSettingsModal() {
  setupOverlay.classList.remove('hidden');
  setupProvider.value = AI_CONFIG.provider || 'prototype';
  if (setupGeminiKey) setupGeminiKey.value = AI_CONFIG.geminiApiKey || '';
  if (setupIamToken)  setupIamToken.value  = AI_CONFIG.watsonxIamToken || '';
  if (setupProjectId) setupProjectId.value= AI_CONFIG.watsonxProjectId || '';
  if (setupRegion)    setupRegion.value   = AI_CONFIG.watsonxRegion || 'au-syd';
  renderProviderSections();
  hideSetupError();
  if (sidebar.classList.contains('open')) sidebar.classList.remove('open');
}

function closeSettingsModal() {
  setupOverlay.classList.add('hidden');
}

if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
if (btnSettings) btnSettings.addEventListener('click', openSettingsModal);
if (setupClose)  setupClose.addEventListener('click', closeSettingsModal);

if (setupProvider) {
  setupProvider.addEventListener('change', renderProviderSections);
}

function renderProviderSections() {
  const val = setupProvider.value;
  if (sectionPrototype) sectionPrototype.style.display = val === 'prototype' ? 'block' : 'none';
  if (sectionGemini)    sectionGemini.style.display    = val === 'gemini'    ? 'flex'  : 'none';
  if (sectionWatsonx)   sectionWatsonx.style.display   = val === 'watsonx'   ? 'flex'  : 'none';

  if (val === 'prototype') {
    setupBtnText.textContent = 'Activate Prototype Mode';
  } else if (val === 'gemini') {
    setupBtnText.textContent = 'Connect to Google Gemini';
  } else {
    setupBtnText.textContent = 'Connect to IBM watsonx';
  }
}

if (toggleGeminiKey && setupGeminiKey) {
  toggleGeminiKey.addEventListener('click', () => {
    setupGeminiKey.type = setupGeminiKey.type === 'password' ? 'text' : 'password';
  });
}
if (toggleApiKey && setupIamToken) {
  toggleApiKey.addEventListener('click', () => {
    setupIamToken.type = setupIamToken.type === 'password' ? 'text' : 'password';
  });
}

if (setupBtn) {
  setupBtn.addEventListener('click', () => {
    const provider = setupProvider.value;
    hideSetupError();

    if (provider === 'gemini') {
      const key = setupGeminiKey.value.trim();
      if (!key) return showSetupError('Please enter a Google Gemini API key.');
      AI_CONFIG.geminiApiKey = key;
    } else if (provider === 'watsonx') {
      const token = setupIamToken.value.trim().replace(/^Bearer\s+/i, '');
      const pid   = setupProjectId.value.trim();
      if (!token) return showSetupError('Please paste your IBM IAM Token.');
      if (!pid)   return showSetupError('Please enter your watsonx Project ID.');
      AI_CONFIG.watsonxIamToken   = token;
      AI_CONFIG.watsonxProjectId  = pid;
      AI_CONFIG.watsonxRegion     = setupRegion.value;
    }

    AI_CONFIG.provider = provider;
    saveConfig();
    updateStatusBadge();
    closeSettingsModal();
    showToast(`AI engine updated: ${provider.toUpperCase()}`);
  });
}

function showSetupError(msg) {
  if (setupError) {
    setupError.textContent = msg;
    setupError.classList.add('visible');
  }
}
function hideSetupError() {
  if (setupError) {
    setupError.classList.remove('visible');
    setupError.textContent = '';
  }
}

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
  saveState();
  extractProfileData(text);

  const typingId = showTyping();
  isGenerating   = true;
  setInputState(false);

  try {
    let response = '';

    // Route based on selected provider
    if (AI_CONFIG.provider === 'gemini' && AI_CONFIG.geminiApiKey) {
      try {
        response = await callGeminiAPI(conversationHistory, AI_CONFIG.geminiApiKey);
      } catch (geminiErr) {
        console.warn('Gemini error, falling back to simulator:', geminiErr);
        showToast('Gemini API failed, using Coach Engine');
        response = simulateLearnMateResponse(text, conversationHistory, studentProfile);
      }
    } else if (AI_CONFIG.provider === 'watsonx' && AI_CONFIG.watsonxIamToken) {
      try {
        response = await callWatsonxAPI(conversationHistory, AI_CONFIG.watsonxIamToken, AI_CONFIG.watsonxProjectId, AI_CONFIG.watsonxRegion);
      } catch (watsonxErr) {
        console.warn('watsonx error, falling back to simulator:', watsonxErr);
        const isAuth = watsonxErr.message.includes('401') || watsonxErr.message.includes('403');
        const notice = isAuth
          ? `> ⚠️ **IBM watsonx Token Expired:** IAM Bearer tokens expire hourly. LearnMate has seamlessly switched to the **Agentic Coach Engine** to generate your plan without disruption.\n\n`
          : ``;
        response = notice + simulateLearnMateResponse(text, conversationHistory, studentProfile);
      }
    } else {
      // Prototype Mode (Default & fallback)
      await new Promise(r => setTimeout(r, 650)); // natural typing delay
      response = simulateLearnMateResponse(text, conversationHistory, studentProfile);
    }

    removeTyping(typingId);
    renderMessage('assistant', response);
    conversationHistory.push({ role: 'assistant', content: response });
    extractMilestones(response);
    saveState();
  } catch (err) {
    removeTyping(typingId);
    renderMessage('assistant', `**Notice:** ${err.message}\n\nYou can click the ⚙️ Settings icon to customize your AI provider.`);
  } finally {
    isGenerating = false;
    setInputState(true);
    userInput.focus();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  GOOGLE GEMINI API CALL
// ═══════════════════════════════════════════════════════════════════════════
async function callGeminiAPI(history, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const systemPrompt = typeof LEARNMATE_CONFIG !== 'undefined' ? LEARNMATE_CONFIG.SYSTEM_PROMPT : 'You are LearnMate, an intelligent AI career and learning coach.';

  const payload = {
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) throw new Error('Empty response from Gemini.');
  return text.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
//  IBM watsonx API CALL
// ═══════════════════════════════════════════════════════════════════════════
async function callWatsonxAPI(history, token, projectId, region = 'au-syd') {
  const url = `https://${region}.ml.cloud.ibm.com/ml/v1/text/chat?version=2024-05-31`;
  const systemPrompt = typeof LEARNMATE_CONFIG !== 'undefined' ? LEARNMATE_CONFIG.SYSTEM_PROMPT : 'You are LearnMate, an AI career coach.';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model_id:   (typeof LEARNMATE_CONFIG !== 'undefined' && LEARNMATE_CONFIG.MODEL_ID) || 'meta-llama/llama-3-3-70b-instruct',
      project_id: projectId,
      messages,
      parameters: {
        max_new_tokens:     2048,
        temperature:        0.7,
        top_p:              0.9,
        repetition_penalty: 1.05,
      }
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`watsonx API error ${res.status}: ${errText.slice(0, 150)}`);
  }

  const data    = await res.json();
  const content = data?.choices?.[0]?.message?.content || data?.results?.[0]?.generated_text || '';
  if (!content.trim()) throw new Error('Empty response from watsonx model.');
  return content.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
//  INTELLIGENT COACH ENGINE (Built-in Prototype Simulator)
// ═══════════════════════════════════════════════════════════════════════════
function simulateLearnMateResponse(prompt, history, profile) {
  const p = prompt.toLowerCase();

  // 1. Full Stack / Web Development Roadmap
  if (p.includes('full stack') || p.includes('web dev') || p.includes('frontend') || p.includes('backend') || p.includes('roadmap')) {
    return `### 🗺️ Personalized Full Stack Career Pathway

Welcome to your personalized roadmap! Based on industry best practices and IBM's development stack, here is your customized phased learning roadmap:

| Metric | Target |
|---|---|
| **Career Track** | Full Stack Web Developer |
| **Pace** | ${profile.hoursPerWeek ? profile.hoursPerWeek + ' hrs/week' : '10-15 hrs/week'} |
| **Focus** | Modern JavaScript, React, Node.js & Cloud Deployment |

---

### ## Phase 1: Frontend Foundations & Responsive Design (Weeks 1–4)
* **Topics:** Semantic HTML5, CSS3 Grid/Flexbox, JavaScript ES6+ (Promises, Async/Await, DOM manipulation).
* **Learning Objectives:** Build responsive, accessible, mobile-first web layouts from scratch.
* **Recommended Courses:**
  * [IBM SkillsBuild: Web Development Fundamentals](https://skillsbuild.org/) *(Free with IBM credential badge)*
  * [freeCodeCamp: Responsive Web Design Certification](https://www.freecodecamp.org/)
* **Project Milestone:** Responsive Developer Portfolio with Dark Mode & Contact Form.

### ## Phase 2: Modern Frontend & State Management (Weeks 5–8)
* **Topics:** React 19, Hooks (useState, useEffect, useContext), Component Architecture, Tailwind CSS, REST API integration.
* **Learning Objectives:** Build dynamic Single Page Applications (SPAs) connecting to external APIs.
* **Recommended Courses:**
  * [Coursera: Meta Front-End Developer Professional Certificate](https://www.coursera.org/)
* **Project Milestone:** Collaborative Kanban Task Board with LocalStorage & Live Drag-and-Drop.

### ## Phase 3: Backend & Database Architecture (Weeks 9–14)
* **Topics:** Node.js runtime, Express.js, RESTful API design, MongoDB & PostgreSQL, JWT authentication, Security best practices.
* **Learning Objectives:** Design secure backend APIs with scalable databases.
* **Recommended Courses:**
  * [IBM SkillsBuild: Node.js & Cloud Native Basics](https://skillsbuild.org/)
* **Project Milestone:** Full Stack E-Commerce Platform with User Authentication, Product Catalog & Stripe Checkout.

### ## Phase 4: Cloud Deployment, DevOps & Capstone (Weeks 15–18)
* **Topics:** Docker containerization, CI/CD pipelines with GitHub Actions, IBM Cloud Code Engine / Vercel deployment, Monitoring.
* **Learning Objectives:** Package, containerize, and deploy production-ready cloud applications.
* **Recommended Certifications:**
  * **IBM Full Stack Cloud Developer Professional Certificate**
  * **AWS Certified Cloud Practitioner**

---

### 💡 Project Ladder
1. **Beginner:** Personal Portfolio Website
2. **Intermediate:** Interactive Weather & Habit Tracker Dashboard
3. **Advanced:** AI-Powered Career Coach Web App (Full Stack MERN / PERN)

**Next Step:** Check off **Phase 1** in the **My Progress** drawer once you start with semantic HTML & JavaScript! What programming language do you currently feel most confident in?`;
  }

  // 2. AI / Machine Learning / Data Science Track
  if (p.includes('ai') || p.includes('machine learning') || p.includes('data science') || p.includes('watsonx') || p.includes('deep learning')) {
    return `### 🧠 AI & Machine Learning Engineering Roadmap

Here is your tailored roadmap to master Artificial Intelligence and Generative AI, featuring the **IBM watsonx** ecosystem:

| Target Goal | AI & Machine Learning Engineer |
|---|---|
| **Pace** | ${profile.hoursPerWeek ? profile.hoursPerWeek + ' hrs/week' : '12-18 hrs/week'} |
| **Core Stack** | Python, PyTorch, Scikit-Learn, LangChain, IBM watsonx.ai |

---

### ## Phase 1: Python, Math & Data Manipulation (Weeks 1–4)
* **Topics:** Python 3 advanced concepts, NumPy, Pandas, Linear Algebra, Multivariable Calculus & Probability.
* **Learning Objectives:** Clean, analyze, and visualize complex datasets efficiently.
* **Recommended Courses:**
  * [IBM SkillsBuild: Artificial Intelligence Fundamentals](https://skillsbuild.org/) *(Free badge)*
  * [Harvard CS50: Introduction to Computer Science](https://pll.harvard.edu/course/cs50-introduction-computer-science)
* **Project Milestone:** Exploratory Data Analysis & Predictive Housing Price Model with Pandas & Matplotlib.

### ## Phase 2: Classical Machine Learning & Scikit-Learn (Weeks 5–9)
* **Topics:** Supervised vs. Unsupervised Learning, Regression, Classification (Random Forests, XGBoost), Model Evaluation (F1, ROC-AUC).
* **Learning Objectives:** Build, train, evaluate, and tune production ML models.
* **Recommended Courses:**
  * [Coursera: Machine Learning Specialization by Andrew Ng](https://www.coursera.org/)
* **Project Milestone:** Customer Churn & Fraud Detection Classifier with interactive Streamlit UI.

### ## Phase 3: Deep Learning & Neural Architectures (Weeks 10–14)
* **Topics:** Artificial Neural Networks (ANN), Convolutional Neural Networks (CNN), Recurrent Networks & Transformers in PyTorch.
* **Learning Objectives:** Understand transformer attention mechanisms and train neural networks.
* **Recommended Courses:**
  * [IBM AI Engineering Professional Certificate](https://www.coursera.org/professional-certificates/ai-engineer)
* **Project Milestone:** Medical Image Classification using Transfer Learning.

### ## Phase 4: Generative AI, LLMs & IBM watsonx (Weeks 15–20)
* **Topics:** Large Language Models (LLMs), Prompt Engineering, Retrieval-Augmented Generation (RAG), LangChain, IBM watsonx Orchestrate.
* **Learning Objectives:** Deploy agentic enterprise AI workflows and build domain-specific RAG applications.
* **Recommended Certifications:**
  * **IBM Certified Specialist – watsonx.ai**
  * **DeepLearning.AI: Generative AI with LLMs**
* **Project Milestone:** Production-grade RAG Document Assistant powered by watsonx & Vector Database.

---

### 🏆 Top Certifications to Pursue
* **IBM Applied AI Professional Certificate**
* **IBM watsonx.ai Technical Specialist**
* **TensorFlow / PyTorch Developer Certificate**

How much prior experience do you have with Python or mathematics?`;
  }

  // 3. Beginner with no coding experience / Career path exploration
  if (p.includes('beginner') || p.includes('no coding') || p.includes('career paths') || p.includes('start')) {
    return `### 🚀 Welcome to Tech! Choosing Your Best Career Path

Starting from scratch is an exciting journey! Here is an overview of the top tech career tracks to help you choose the right direction:

| Career Pathway | Why Choose It | Math Needed | Job Demand |
|---|---|---|---|
| **Full Stack Web Dev** | Build visible websites, apps & products | Low | ⭐⭐⭐⭐⭐ Very High |
| **AI & Data Science** | Work with AI models, data insights & LLMs | Moderate/High | ⭐⭐⭐⭐⭐ Highest Growth |
| **Cloud & DevOps** | Automate systems, cloud servers & CI/CD | Low | ⭐⭐⭐⭐ High Stability |
| **Cybersecurity** | Defend networks, ethical hacking & audits | Moderate | ⭐⭐⭐⭐⭐ Critical Need |

---

### ## Phase 1: Core Fundamentals for Every Programmer
1. **Computational Thinking:** Learn how computers solve problems and execute code.
2. **First Language:** **Python** (for versatility & AI) or **JavaScript** (for immediate visual web apps).
3. **Developer Tools:** Git, GitHub, and Visual Studio Code.

### 📚 Recommended Free Starter Courses
* **Harvard CS50x:** Introduction to Computer Science *(The gold standard free beginner course)*
* **IBM SkillsBuild:** [Job Readiness & Professional Skills](https://skillsbuild.org/) *(Includes digital credentials)*
* **freeCodeCamp:** [Scientific Computing with Python](https://www.freecodecamp.org/)

---

**Tell me a bit about yourself:**
1. What kind of projects sound most exciting to you (building visual websites, analyzing data, or building AI chatbots)?
2. How many hours per week can you dedicate to learning?`;
  }

  // 4. Certification Guidance
  if (p.includes('certif') || p.includes('credentials') || p.includes('badge')) {
    return `### 🏆 Top Industry Certifications for Career Growth

Certifications validate your skills and help your resume pass recruiter filters. Here is the curated list of high-value certifications:

#### 1. IBM Ecosystem (Highly Valued in Enterprise)
* **IBM Applied AI Professional Certificate** *(Coursera · Beginner/Intermediate)* — covers AI concepts, Python, and Watson services.
* **IBM Full Stack Cloud Developer Professional Certificate** *(Coursera · Intermediate)* — covers React, Node, Docker, Kubernetes, and IBM Cloud.
* **IBM watsonx Technical Specialist** *(IBM Training · Advanced)* — enterprise credential for Generative AI and agentic workflows.
* **IBM SkillsBuild Digital Badges** *(Free)* — Earn verifiable Credly badges in Cybersecurity, Cloud, and Web Fundamentals.

#### 2. Cloud & Infrastructure
* **AWS Certified Cloud Practitioner (CLF-C02)** — ideal entry-level cloud credential.
* **Microsoft Certified: Azure Fundamentals (AZ-900)**.
* **Google Cloud Associate Cloud Engineer**.

#### 3. Software Engineering & Data
* **Meta Front-End / Back-End Developer Certificate** (Coursera).
* **Google Data Analytics Professional Certificate**.

**Recommendation:** If you are preparing for hackathons or internships, pair 1 recognized certification with 2 solid GitHub projects. Which domain are you targeting first?`;
  }

  // 5. Project recommendations
  if (p.includes('project') || p.includes('portfolio') || p.includes('ladder')) {
    return `### 💡 High-Impact Project Ladder

Recruiters look for projects that solve real problems rather than standard tutorial clones. Here is a progressive ladder you can build:

| Level | Project Concept | Key Technologies |
|---|---|---|
| **Beginner** | Personal Interactive Portfolio & Blog | HTML5, CSS3, Vanilla JS, GitHub Pages |
| **Beginner** | Real-time Weather & City Air Quality App | Fetch API, OpenWeatherMap, CSS Glassmorphism |
| **Intermediate** | Expense & Budget Tracker with Visual Analytics | React, Chart.js, LocalStorage / Firebase |
| **Intermediate** | Real-time Collaborative Chat & Task Board | Node.js, Express, Socket.io, MongoDB |
| **Advanced** | Agentic AI Learning Assistant | IBM watsonx.ai / OpenAI API, Vector DB, LangChain, Next.js |
| **Advanced** | Multi-Vendor E-Commerce Platform | Next.js, Stripe Payments, PostgreSQL, Prisma, Docker |

---

### ## Phase 1: Build & Polish Your Portfolio
* Set up a clean GitHub profile with descriptive README files and architecture diagrams.
* Host live demos using GitHub Pages or Vercel.

Which project above would you like help architecting right now?`;
  }

  // 6. Generic / Adaptive response
  return `### 🎯 LearnMate Coaching Feedback

Great question! As your learning coach, my goal is to keep you moving forward step-by-step without feeling overwhelmed.

---

### ## Phase 1: Action Plan & Next Steps
* **Review Fundamentals:** Focus on consistent daily practice rather than marathon sessions.
* **Hands-on Implementation:** For every 1 hour of video tutorials, spend at least 2 hours writing code.
* **Track Your Milestones:** Open the **My Progress** drawer on the left to track each step as you complete it.

### Recommended Resource:
* Explore [IBM SkillsBuild](https://skillsbuild.org/) for free verified courses and digital credential badges that enhance your LinkedIn profile.

What specific concept or goal would you like to tackle next? Tell me your preferred learning style (videos, interactive exercises, or building projects)!`;
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
  const avatar = document.createElement('avatar bot');
  const img = document.createElement('img'); img.src = 'assets/LearnMate.png'; img.alt = 'LearnMate';
  const av = document.createElement('div'); av.className = 'avatar bot'; av.appendChild(img);
  const bubble = document.createElement('div'); bubble.className = 'bubble';
  bubble.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
  div.appendChild(av); div.appendChild(bubble);
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
    body.innerHTML = `<div class="progress-empty">No milestones yet. Ask LearnMate for a roadmap to populate your progress milestones!</div>`;
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
    ? `<div class="progress-empty">No roadmap generated yet. Ask LearnMate to build your personalized career roadmap!</div>`
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
