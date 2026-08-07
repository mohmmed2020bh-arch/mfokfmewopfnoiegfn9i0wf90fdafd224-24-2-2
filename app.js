/* ============================================================
   شات نوني ولابوبو - JavaScript الكامل
   ============================================================ */

// ===== USERS CONFIG =====
const USERS = {
  nooni: {
    id: 'nooni',
    name: 'نوني',
    tag: '@nooni',
    emoji: '🌸',
    color: '#f472b6',
    password: '',          // لا تحتاج باسورد
    avatarImg: 'nooni.jpg'
  },
  labubu: {
    id: 'labubu',
    name: 'لابوبو',
    tag: '@labubu',
    emoji: '🐾',
    color: '#a78bfa',
    password: 'a7bk',      // الباسورد
    avatarImg: 'labubu.jpg'
  }
};

// ===== APP STATE =====
let currentUser = null;
let otherUser   = null;
let selectedAccount = null;
let messages    = [];
let mediaRecorder = null;
let recordingChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let typingTimeout = null;
let notifTimeout  = null;

// ===== STORAGE KEY =====
const STORAGE_KEY = 'nooni_labubu_chat';

// ===== INIT =====
window.onload = () => {
  loadMessages();
  requestNotifPermission();
};

// ===== REQUEST NOTIFICATION PERMISSION =====
function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ===== LOGIN FUNCTIONS =====
function selectAccount(id) {
  selectedAccount = id;
  const user = USERS[id];

  if (user.password === '') {
    // نوني لا تحتاج باسورد
    loginAs(id);
  } else {
    // لابوبو تحتاج باسورد
    showPasswordModal(user);
  }
}

function showPasswordModal(user) {
  document.getElementById('modalAvatar').textContent = user.emoji;
  document.getElementById('modalAvatar').style.background =
    `radial-gradient(circle, ${user.color}33, transparent)`;
  document.getElementById('modalAvatar').style.borderColor = user.color;
  document.getElementById('modalTitle').textContent = `مرحباً ${user.name} 👋`;
  document.getElementById('passwordInput').value = '';
  document.getElementById('loginError').classList.add('hidden');
  document.getElementById('passwordModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('passwordInput').focus(), 100);
}

function closeModal() {
  document.getElementById('passwordModal').classList.add('hidden');
  selectedAccount = null;
}

function togglePwd() {
  const inp = document.getElementById('passwordInput');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function doLogin() {
  const user = USERS[selectedAccount];
  const input = document.getElementById('passwordInput').value.trim();

  if (input !== user.password) {
    const err = document.getElementById('loginError');
    err.classList.remove('hidden');
    err.style.animation = 'none';
    requestAnimationFrame(() => err.style.animation = 'shake 0.4s ease');
    document.getElementById('passwordInput').value = '';
    return;
  }

  closeModal();
  loginAs(selectedAccount);
}

function loginAs(id) {
  currentUser = USERS[id];
  otherUser   = USERS[id === 'nooni' ? 'labubu' : 'nooni'];

  setupChatUI();
  switchScreen('loginScreen', 'chatScreen');
  renderMessages();
  scrollToBottom(false);
}

function logout() {
  currentUser = null;
  otherUser   = null;
  switchScreen('chatScreen', 'loginScreen');
  document.getElementById('messagesArea').innerHTML =
    '<div class="chat-date-divider"><span>اليوم</span></div>';
}

// ===== SETUP CHAT UI =====
function setupChatUI() {
  // Header
  document.getElementById('headerName').textContent    = otherUser.name;
  document.getElementById('headerAvatar').textContent  = otherUser.emoji;
  document.getElementById('headerAvatar').style.background =
    `radial-gradient(circle, ${otherUser.color}33, transparent)`;
  document.getElementById('headerAvatar').style.borderColor = otherUser.color;
  document.getElementById('currentUserBadge').textContent = currentUser.name + ' ' + currentUser.emoji;
}

// ===== SWITCH SCREENS =====
function switchScreen(from, to) {
  document.getElementById(from).classList.remove('active');
  document.getElementById(to).classList.add('active');
}

// ===== MESSAGES: LOAD & SAVE =====
function loadMessages() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) messages = JSON.parse(saved);
  } catch(e) { messages = []; }
}

function saveMessages() {
  // Keep max 200 messages (avoid storage overflow from images)
  const toSave = messages.map(m => {
    // Don't store blob URLs; store flag instead
    if (m.type === 'image' && m.src && m.src.startsWith('blob:')) {
      return { ...m, src: null, blobLost: true };
    }
    if (m.type === 'audio' && m.src && m.src.startsWith('blob:')) {
      return { ...m, src: null, blobLost: true };
    }
    return m;
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave.slice(-200)));
  } catch(e) {}
}

// ===== SEND TEXT MESSAGE =====
function sendMessage() {
  const input = document.getElementById('msgInput');
  const text  = input.value.trim();
  if (!text) return;

  addMessage({ type: 'text', text, sender: currentUser.id });
  input.value = '';
  autoResize(input);
}

// ===== SEND IMAGES =====
function sendImages(event) {
  const files = Array.from(event.target.files);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      addMessage({ type: 'image', src: e.target.result, sender: currentUser.id });
    };
    reader.readAsDataURL(file);
  });
  event.target.value = '';
}

// ===== SEND FILE =====
function sendFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    addMessage({
      type: 'file',
      src: e.target.result,
      fileName: file.name,
      fileSize: formatSize(file.size),
      sender: currentUser.id
    });
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// ===== VOICE RECORDING =====
async function startRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordingChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recordingChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordingChunks, { type: 'audio/webm' });
      const url  = URL.createObjectURL(blob);
      addMessage({ type: 'audio', src: url, duration: recordingSeconds, sender: currentUser.id });
      hideRecordingUI();
    };

    mediaRecorder.start();
    showRecordingUI();

  } catch (err) {
    alert('لم يتم السماح بالوصول للميكروفون 🎙️');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

function showRecordingUI() {
  document.getElementById('voiceBtn').classList.add('recording');
  document.getElementById('recordingOverlay').classList.remove('hidden');
  recordingSeconds = 0;
  updateRecTimer();
  recordingTimer = setInterval(() => {
    recordingSeconds++;
    updateRecTimer();
    if (recordingSeconds >= 120) stopRecording(); // max 2 min
  }, 1000);
}

function hideRecordingUI() {
  document.getElementById('voiceBtn').classList.remove('recording');
  document.getElementById('recordingOverlay').classList.add('hidden');
  clearInterval(recordingTimer);
}

function updateRecTimer() {
  const m = Math.floor(recordingSeconds / 60);
  const s = recordingSeconds % 60;
  document.getElementById('recTimer').textContent = `${m}:${s.toString().padStart(2,'0')}`;
}

// ===== ADD MESSAGE (core) =====
function addMessage(msg) {
  msg.id   = Date.now() + Math.random();
  msg.time = nowTime();

  messages.push(msg);
  saveMessages();
  renderSingleMessage(msg, true);
  scrollToBottom(true);

  // Show notification if other user "sent" it (simulate for demo)
  // In real app this fires when receiving from server
  if (msg.sender !== currentUser.id) {
    showNotification(USERS[msg.sender], msg);
  }
}

// ===== RENDER ALL MESSAGES =====
function renderMessages() {
  const area = document.getElementById('messagesArea');
  area.innerHTML = '<div class="chat-date-divider"><span>اليوم</span></div>';

  messages.forEach(msg => renderSingleMessage(msg, false));
}

// ===== RENDER SINGLE MESSAGE =====
function renderSingleMessage(msg, animate) {
  const area   = document.getElementById('messagesArea');
  const isMe   = msg.sender === currentUser.id;
  const sender = USERS[msg.sender];

  const row = document.createElement('div');
  row.className = `msg-row ${isMe ? 'me' : 'other'}`;
  if (!animate) row.style.animation = 'none';

  // Avatar
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = sender.emoji;
  avatar.style.background  = `radial-gradient(circle, ${sender.color}33, transparent)`;
  avatar.style.borderColor = sender.color;

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (msg.type === 'text') {
    bubble.innerHTML = `<span>${escapeHtml(msg.text)}</span><span class="msg-time">${msg.time}</span>`;

  } else if (msg.type === 'image') {
    if (msg.blobLost || !msg.src) {
      bubble.innerHTML = `<span style="opacity:0.5">🖼️ صورة غير متاحة</span><span class="msg-time">${msg.time}</span>`;
    } else {
      const img = document.createElement('img');
      img.className = 'msg-image';
      img.src = msg.src;
      img.alt = 'صورة';
      img.onclick = () => openLightbox(msg.src);
      const time = document.createElement('span');
      time.className = 'msg-time';
      time.textContent = msg.time;
      bubble.appendChild(img);
      bubble.appendChild(time);
    }

  } else if (msg.type === 'audio') {
    if (msg.blobLost || !msg.src) {
      bubble.innerHTML = `<span style="opacity:0.5">🎙️ صوتية غير متاحة</span><span class="msg-time">${msg.time}</span>`;
    } else {
      bubble.appendChild(buildAudioPlayer(msg));
      const time = document.createElement('span');
      time.className = 'msg-time';
      time.textContent = msg.time;
      bubble.appendChild(time);
    }

  } else if (msg.type === 'file') {
    const fileDiv = document.createElement('div');
    fileDiv.className = 'file-msg';
    fileDiv.innerHTML = `
      <span class="file-icon">${getFileIcon(msg.fileName)}</span>
      <div class="file-info">
        <div class="file-name">${escapeHtml(msg.fileName)}</div>
        <div class="file-size">${msg.fileSize}</div>
      </div>
    `;
    if (msg.src) {
      fileDiv.onclick = () => {
        const a = document.createElement('a');
        a.href = msg.src; a.download = msg.fileName; a.click();
      };
    }
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = msg.time;
    bubble.appendChild(fileDiv);
    bubble.appendChild(time);
  }

  if (isMe) {
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
  }

  area.appendChild(row);
}

// ===== BUILD AUDIO PLAYER =====
function buildAudioPlayer(msg) {
  const audio = new Audio(msg.src);
  const wrap  = document.createElement('div');
  wrap.className = 'audio-player';

  const btn = document.createElement('button');
  btn.className = 'play-btn';
  btn.textContent = '▶️';

  const label = document.createElement('div');
  label.className = 'audio-wave';

  const timeLabel = document.createElement('div');
  timeLabel.className = 'audio-label';
  timeLabel.textContent = msg.duration ? formatDuration(msg.duration) : '🎵 صوتية';

  btn.onclick = () => {
    if (audio.paused) {
      audio.play();
      btn.textContent = '⏸️';
    } else {
      audio.pause();
      btn.textContent = '▶️';
    }
  };
  audio.onended = () => { btn.textContent = '▶️'; };

  wrap.appendChild(btn);
  wrap.appendChild(label);
  wrap.appendChild(timeLabel);
  return wrap;
}

// ===== LIGHTBOX =====
function openLightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.onclick = () => lb.remove();
  const img = document.createElement('img');
  img.src = src;
  lb.appendChild(img);
  document.body.appendChild(lb);
}

// ===== NOTIFICATIONS =====
function showNotification(sender, msg) {
  // In-app toast
  const toast = document.getElementById('notifToast');
  document.getElementById('notifIcon').textContent  = sender.emoji;
  document.getElementById('notifFrom').textContent  = sender.name;
  document.getElementById('notifMsg').textContent   = getMsgPreview(msg);

  toast.classList.remove('hidden');
  toast.style.animation = 'none';
  requestAnimationFrame(() => toast.style.animation = 'slideDown 0.4s cubic-bezier(.4,2,.6,1) both');

  if (notifTimeout) clearTimeout(notifTimeout);
  notifTimeout = setTimeout(closeNotif, 4000);

  // Browser notification
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    new Notification(`💌 ${sender.name}`, {
      body: getMsgPreview(msg),
      icon: 'nooni.jpg'
    });
  }
}

function closeNotif() {
  document.getElementById('notifToast').classList.add('hidden');
}

function getMsgPreview(msg) {
  if (msg.type === 'text')  return msg.text.slice(0, 60);
  if (msg.type === 'image') return '🖼️ أرسل صورة';
  if (msg.type === 'audio') return '🎙️ أرسل رسالة صوتية';
  if (msg.type === 'file')  return `📎 ${msg.fileName}`;
  return 'رسالة جديدة';
}

// ===== TYPING SIMULATION =====
function simulateTyping() {
  // This is a local-only app; typing indicator can be used for demo
}

// ===== SCROLL TO BOTTOM =====
function scrollToBottom(smooth) {
  const area = document.getElementById('messagesArea');
  area.scrollTo({ top: area.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

// ===== AUTO RESIZE TEXTAREA =====
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ===== HELPERS =====
function nowTime() {
  const d = new Date();
  return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/\n/g,'<br>');
}

function formatSize(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(1) + ' MB';
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s.toString().padStart(2,'0')}`;
}

function getFileIcon(name) {
  if (!name) return '📄';
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊',
    ppt:'📊', pptx:'📊', zip:'🗜️', rar:'🗜️', mp3:'🎵',
    mp4:'🎬', mov:'🎬', avi:'🎬', jpg:'🖼️', jpeg:'🖼️',
    png:'🖼️', gif:'🎞️', txt:'📋'
  };
  return icons[ext] || '📁';
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeNotif();
    const lb = document.querySelector('.lightbox');
    if (lb) lb.remove();
  }
});
