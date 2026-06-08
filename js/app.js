const API_BASE = 'https://workout-tracker.welly180.workers.dev';

const MUSCLE_LABELS = {
  chest: '胸', back: '背', shoulders: '肩', biceps: '二頭',
  triceps: '三頭', legs: '腿', core: '核心', cardio: '有氧'
};

let state = {
  token: localStorage.getItem('token') || null,
  workouts: [],
  currentExercises: [],
  selectedMuscles: [],
  timerInterval: null,
  timerSeconds: 90,
  timerRemaining: 90,
  timerRunning: false,
  draggedIndex: null
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  if (state.token) {
    showApp();
    loadWorkouts();
  }
  setupEventListeners();
  updateDateDisplay();
});

function setupEventListeners() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => toggleMuscle(chip));
  });

  document.getElementById('add-exercise-btn').addEventListener('click', openExerciseModal);
  document.getElementById('modal-close').addEventListener('click', closeExerciseModal);
  document.getElementById('exercise-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeExerciseModal();
  });
  document.getElementById('exercise-form').addEventListener('submit', addExercise);
  document.getElementById('add-set-btn').addEventListener('click', addSetRow);

  document.getElementById('save-workout-btn').addEventListener('click', saveWorkout);

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => setTimerPreset(btn));
  });
  document.getElementById('timer-start').addEventListener('click', startTimer);
  document.getElementById('timer-pause').addEventListener('click', pauseTimer);
  document.getElementById('timer-reset').addEventListener('click', resetTimer);

  document.getElementById('analysis-muscle').addEventListener('change', renderAnalysis);
  document.getElementById('analysis-period').addEventListener('change', renderAnalysis);

  // Autocomplete
  const nameInput = document.getElementById('exercise-name');
  nameInput.addEventListener('input', handleAutocomplete);
  nameInput.addEventListener('focus', handleAutocomplete);
  nameInput.addEventListener('blur', () => {
    setTimeout(() => {
      document.getElementById('autocomplete-list').classList.remove('active');
    }, 200);
  });
  nameInput.addEventListener('keydown', handleAutocompleteKeydown);
}

// --- Auth ---
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '登入失敗');
    }

    const data = await res.json();
    state.token = data.token;
    localStorage.setItem('token', data.token);
    showApp();
    loadWorkouts();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function handleLogout() {
  state.token = null;
  localStorage.removeItem('token');
  document.getElementById('main-app').classList.remove('active');
  document.getElementById('login-screen').classList.add('active');
}

function showApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('main-app').classList.add('active');
}

// --- API ---
async function apiCall(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.token}`
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (res.status === 401) {
    handleLogout();
    throw new Error('請重新登入');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '請求失敗');
  }
  return res.json();
}

async function loadWorkouts() {
  try {
    const data = await apiCall('GET', '/api/workouts');
    state.workouts = data.workouts || [];
    renderDashboard();
    renderAnalysis();
    loadTodayWorkout();
  } catch (err) {
    console.error('載入失敗:', err);
  }
}

function loadTodayWorkout() {
  const today = getDateStr(new Date());
  const existing = state.workouts.find(w => w.date === today);
  if (existing) {
    state.selectedMuscles = existing.muscles || [];
    state.currentExercises = existing.exercises || [];
    document.getElementById('duration-input').value = existing.duration || '';

    document.querySelectorAll('.chip').forEach(chip => {
      chip.classList.toggle('active', state.selectedMuscles.includes(chip.dataset.muscle));
    });
    renderExercisesList();
  }
}

async function saveWorkout() {
  const statusEl = document.getElementById('save-status');
  statusEl.textContent = '';
  statusEl.className = 'save-status';

  const duration = parseInt(document.getElementById('duration-input').value) || 0;

  if (state.selectedMuscles.length === 0 && state.currentExercises.length === 0) {
    statusEl.textContent = '請至少選擇一個訓練部位或新增動作';
    statusEl.className = 'save-status error';
    return;
  }

  const workout = {
    date: getDateStr(new Date()),
    muscles: state.selectedMuscles,
    exercises: state.currentExercises,
    duration
  };

  try {
    await apiCall('POST', '/api/workouts', workout);
    statusEl.textContent = '儲存成功！';
    statusEl.className = 'save-status success';
    await loadWorkouts();
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'save-status error';
  }
}

// --- Tabs ---
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');

  if (tab === 'dashboard') renderDashboard();
  if (tab === 'analysis') renderAnalysis();
}

// --- Record ---
function updateDateDisplay() {
  const now = new Date();
  const opts = { month: 'long', day: 'numeric', weekday: 'short' };
  document.getElementById('today-date').textContent = now.toLocaleDateString('zh-TW', opts);
}

function toggleMuscle(chip) {
  const muscle = chip.dataset.muscle;
  chip.classList.toggle('active');
  if (state.selectedMuscles.includes(muscle)) {
    state.selectedMuscles = state.selectedMuscles.filter(m => m !== muscle);
  } else {
    state.selectedMuscles.push(muscle);
  }
}

// --- Autocomplete (Feature 2) ---
function getAllExerciseNames() {
  const names = new Set();
  state.workouts.forEach(w => {
    (w.exercises || []).forEach(ex => names.add(ex.name));
  });
  return [...names];
}

function handleAutocomplete() {
  const input = document.getElementById('exercise-name');
  const list = document.getElementById('autocomplete-list');
  const query = input.value.trim().toLowerCase();

  const allNames = getAllExerciseNames();
  const filtered = query
    ? allNames.filter(n => n.toLowerCase().includes(query))
    : allNames.slice(0, 8);

  if (filtered.length === 0 || (filtered.length === 1 && filtered[0].toLowerCase() === query)) {
    list.classList.remove('active');
    return;
  }

  list.innerHTML = filtered.map((name, i) =>
    `<div class="autocomplete-item" data-index="${i}" data-name="${name}">${name}</div>`
  ).join('');
  list.classList.add('active');

  list.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      input.value = item.dataset.name;
      list.classList.remove('active');
      showLastRecord(item.dataset.name);
    });
  });
}

function handleAutocompleteKeydown(e) {
  const list = document.getElementById('autocomplete-list');
  if (!list.classList.contains('active')) return;

  const items = list.querySelectorAll('.autocomplete-item');
  const current = list.querySelector('.autocomplete-item.highlighted');
  let index = -1;
  if (current) {
    index = parseInt(current.dataset.index);
    current.classList.remove('highlighted');
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    index = Math.min(index + 1, items.length - 1);
    items[index].classList.add('highlighted');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    index = Math.max(index - 1, 0);
    items[index].classList.add('highlighted');
  } else if (e.key === 'Enter' && current) {
    e.preventDefault();
    document.getElementById('exercise-name').value = current.dataset.name;
    list.classList.remove('active');
    showLastRecord(current.dataset.name);
  }
}

// --- Last Record (Feature 3) ---
function showLastRecord(exerciseName) {
  const container = document.getElementById('last-record');
  const today = getDateStr(new Date());

  let lastRecord = null;
  const sorted = [...state.workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    if (w.date === today) continue;
    const ex = (w.exercises || []).find(e => e.name === exerciseName);
    if (ex) {
      lastRecord = { date: w.date, sets: ex.sets };
      break;
    }
  }

  if (!lastRecord) {
    container.classList.remove('visible');
    return;
  }

  container.classList.add('visible');
  container.innerHTML = `
    <div class="last-record-title">上次紀錄 (${formatDate(lastRecord.date)})</div>
    <div class="last-record-sets">
      ${lastRecord.sets.map((s, i) => `<span>第${i + 1}組: ${s.weight}kg × ${s.reps}</span>`).join('')}
    </div>`;
}

// --- Exercise Modal ---
function openExerciseModal() {
  document.getElementById('exercise-modal').classList.add('active');
  document.getElementById('exercise-name').value = '';
  document.getElementById('last-record').classList.remove('visible');
  document.getElementById('autocomplete-list').classList.remove('active');
  document.getElementById('sets-list').innerHTML = `
    <div class="set-row">
      <span class="set-num">1</span>
      <input type="number" placeholder="重量(kg)" class="set-weight" step="0.5">
      <input type="number" placeholder="次數" class="set-reps">
    </div>`;
}

function closeExerciseModal() {
  document.getElementById('exercise-modal').classList.remove('active');
}

function addSetRow() {
  const list = document.getElementById('sets-list');
  const num = list.children.length + 1;
  const row = document.createElement('div');
  row.className = 'set-row';
  row.innerHTML = `
    <span class="set-num">${num}</span>
    <input type="number" placeholder="重量(kg)" class="set-weight" step="0.5">
    <input type="number" placeholder="次數" class="set-reps">`;
  list.appendChild(row);
}

function addExercise(e) {
  e.preventDefault();
  const name = document.getElementById('exercise-name').value.trim();
  if (!name) return;

  const sets = [];
  document.querySelectorAll('#sets-list .set-row').forEach(row => {
    const weight = parseFloat(row.querySelector('.set-weight').value) || 0;
    const reps = parseInt(row.querySelector('.set-reps').value) || 0;
    if (weight > 0 || reps > 0) {
      sets.push({ weight, reps });
    }
  });

  state.currentExercises.push({ name, sets });
  renderExercisesList();
  closeExerciseModal();
}

// --- Exercise List with Drag & Drop (Feature 17) ---
function renderExercisesList() {
  const list = document.getElementById('exercises-list');
  if (state.currentExercises.length === 0) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = state.currentExercises.map((ex, i) => `
    <div class="exercise-card has-drag" draggable="true" data-index="${i}">
      <div class="exercise-card-drag">⠿</div>
      <div class="exercise-card-header">
        <span class="exercise-card-name">${ex.name}</span>
        <button class="exercise-card-delete" onclick="removeExercise(${i})">×</button>
      </div>
      <div class="exercise-card-sets">
        ${ex.sets.map((s, j) => `<span>第${j + 1}組: ${s.weight}kg × ${s.reps}</span>`).join('')}
      </div>
    </div>`).join('');

  setupDragAndDrop();
}

function setupDragAndDrop() {
  const cards = document.querySelectorAll('.exercise-card[draggable]');

  cards.forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('dragenter', handleDragEnter);
    card.addEventListener('dragleave', handleDragLeave);
    card.addEventListener('drop', handleDrop);

    // Touch events for mobile
    const handle = card.querySelector('.exercise-card-drag');
    handle.addEventListener('touchstart', handleTouchStart, { passive: false });
    handle.addEventListener('touchmove', handleTouchMove, { passive: false });
    handle.addEventListener('touchend', handleTouchEnd);
  });
}

function handleDragStart(e) {
  state.draggedIndex = parseInt(e.currentTarget.dataset.index);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
    el.classList.remove('drag-over-top', 'drag-over-bottom');
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
  e.preventDefault();
  const card = e.currentTarget;
  const targetIndex = parseInt(card.dataset.index);
  card.classList.remove('drag-over-top', 'drag-over-bottom');
  if (targetIndex < state.draggedIndex) {
    card.classList.add('drag-over-top');
  } else {
    card.classList.add('drag-over-bottom');
  }
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
}

function handleDrop(e) {
  e.preventDefault();
  const targetIndex = parseInt(e.currentTarget.dataset.index);
  e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');

  if (state.draggedIndex === targetIndex) return;

  const [moved] = state.currentExercises.splice(state.draggedIndex, 1);
  state.currentExercises.splice(targetIndex, 0, moved);
  renderExercisesList();
}

// Touch-based drag for mobile
let touchDragEl = null;
let touchStartY = 0;
let touchCurrentCard = null;

function handleTouchStart(e) {
  const card = e.currentTarget.closest('.exercise-card');
  state.draggedIndex = parseInt(card.dataset.index);
  touchDragEl = card;
  touchStartY = e.touches[0].clientY;
  card.classList.add('dragging');
  e.preventDefault();
}

function handleTouchMove(e) {
  if (!touchDragEl) return;
  e.preventDefault();

  const touch = e.touches[0];
  const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
  const targetCard = elements.find(el => el.classList.contains('exercise-card') && el !== touchDragEl);

  document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
    el.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  if (targetCard) {
    touchCurrentCard = targetCard;
    const targetIndex = parseInt(targetCard.dataset.index);
    if (targetIndex < state.draggedIndex) {
      targetCard.classList.add('drag-over-top');
    } else {
      targetCard.classList.add('drag-over-bottom');
    }
  }
}

function handleTouchEnd(e) {
  if (!touchDragEl) return;
  touchDragEl.classList.remove('dragging');

  if (touchCurrentCard) {
    const targetIndex = parseInt(touchCurrentCard.dataset.index);
    touchCurrentCard.classList.remove('drag-over-top', 'drag-over-bottom');

    if (state.draggedIndex !== targetIndex) {
      const [moved] = state.currentExercises.splice(state.draggedIndex, 1);
      state.currentExercises.splice(targetIndex, 0, moved);
      renderExercisesList();
    }
  }

  touchDragEl = null;
  touchCurrentCard = null;
}

function removeExercise(index) {
  state.currentExercises.splice(index, 1);
  renderExercisesList();
}

// --- Timer with Sound (Feature 9) ---
let audioCtx = null;

function playTimerSound() {
  const soundEnabled = document.getElementById('timer-sound').checked;
  if (!soundEnabled) return;

  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Three ascending beeps
  [0, 150, 300].forEach((delay, i) => {
    setTimeout(() => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 800 + i * 200;
      gain.gain.value = 0.3;
      osc.start(audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.stop(audioCtx.currentTime + 0.15);
    }, delay);
  });
}

function setTimerPreset(btn) {
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.timerSeconds = parseInt(btn.dataset.seconds);
  state.timerRemaining = state.timerSeconds;
  updateTimerDisplay();
  updateProgressRing();
}

function startTimer() {
  if (state.timerRunning) return;
  state.timerRunning = true;
  document.getElementById('timer-start').disabled = true;
  document.getElementById('timer-pause').disabled = false;

  // Unlock audio context on user interaction
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  state.timerInterval = setInterval(() => {
    state.timerRemaining--;
    updateTimerDisplay();
    updateProgressRing();

    // Play tick at 3, 2, 1
    if (state.timerRemaining <= 3 && state.timerRemaining > 0) {
      playTickSound();
    }

    if (state.timerRemaining <= 0) {
      clearInterval(state.timerInterval);
      state.timerRunning = false;
      document.getElementById('timer-display').classList.add('timer-done');
      document.getElementById('timer-start').disabled = false;
      document.getElementById('timer-pause').disabled = true;
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 200]);
      playTimerSound();
    }
  }, 1000);
}

function playTickSound() {
  const soundEnabled = document.getElementById('timer-sound').checked;
  if (!soundEnabled) return;

  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = 600;
  gain.gain.value = 0.15;
  osc.start(audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
  osc.stop(audioCtx.currentTime + 0.08);
}

function pauseTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  document.getElementById('timer-start').disabled = false;
  document.getElementById('timer-pause').disabled = true;
}

function resetTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  state.timerRemaining = state.timerSeconds;
  document.getElementById('timer-start').disabled = false;
  document.getElementById('timer-pause').disabled = true;
  document.getElementById('timer-display').classList.remove('timer-done');
  updateTimerDisplay();
  updateProgressRing();
}

function updateTimerDisplay() {
  const mins = Math.floor(Math.max(0, state.timerRemaining) / 60);
  const secs = Math.max(0, state.timerRemaining) % 60;
  document.getElementById('timer-display').textContent =
    `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateProgressRing() {
  const circle = document.getElementById('progress-circle');
  const circumference = 2 * Math.PI * 90;
  const progress = state.timerRemaining / state.timerSeconds;
  circle.style.strokeDashoffset = circumference * (1 - progress);
}

// --- Dashboard ---
function renderDashboard() {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const weekWorkouts = state.workouts.filter(w => new Date(w.date) >= weekStart);
  const monthWorkouts = state.workouts.filter(w => new Date(w.date) >= monthStart);

  document.getElementById('week-count').textContent = weekWorkouts.length;
  document.getElementById('month-count').textContent = monthWorkouts.length;
  document.getElementById('streak-count').textContent = calculateStreak();

  renderWeekDays(now, weekStart);
  renderMonthGrid(now);
  renderRecentWorkouts();
}

function renderWeekDays(now) {
  const container = document.getElementById('week-days');
  const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
  const weekStart = getWeekStart(now);

  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = getDateStr(d);
    const isToday = dateStr === getDateStr(now);
    const trained = state.workouts.some(w => w.date === dateStr);

    html += `<div class="week-day ${trained ? 'active' : ''} ${isToday ? 'today' : ''}">
      <span class="week-day-label">${dayLabels[i]}</span>
      <span class="week-day-num">${d.getDate()}</span>
      <span class="week-day-dot"></span>
    </div>`;
  }
  container.innerHTML = html;
}

function renderMonthGrid(now) {
  const container = document.getElementById('month-grid');
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startOffset = (firstDay.getDay() + 6) % 7;

  let html = '';
  for (let i = 0; i < startOffset; i++) {
    html += '<div class="month-cell"></div>';
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const trained = state.workouts.some(w => w.date === dateStr);
    const isToday = dateStr === getDateStr(now);
    html += `<div class="month-cell ${trained ? 'trained' : ''} ${isToday ? 'today' : ''}">${d}</div>`;
  }
  container.innerHTML = html;
}

function renderRecentWorkouts() {
  const container = document.getElementById('recent-list');
  const recent = [...state.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = '<div class="no-data">尚無訓練紀錄</div>';
    return;
  }

  container.innerHTML = recent.map(w => `
    <div class="recent-item">
      <span class="recent-item-date">${formatDate(w.date)}</span>
      <span class="recent-item-info">${(w.muscles || []).map(m => MUSCLE_LABELS[m] || m).join('・')} ${w.duration ? w.duration + '分' : ''}</span>
    </div>`).join('');
}

function calculateStreak() {
  let streak = 0;
  const today = new Date();
  const d = new Date(today);

  while (true) {
    const dateStr = getDateStr(d);
    if (state.workouts.some(w => w.date === dateStr)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// --- Analysis ---
function renderAnalysis() {
  const muscleFilter = document.getElementById('analysis-muscle').value;
  const period = document.getElementById('analysis-period').value;

  const weeks = parseInt(period);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);

  let filtered = state.workouts.filter(w => new Date(w.date) >= cutoff);
  if (muscleFilter !== 'all') {
    filtered = filtered.filter(w => (w.muscles || []).includes(muscleFilter));
  }

  renderFrequencyChart(filtered, weeks);
  renderWeightChart(filtered);
  renderDurationChart(filtered);
  renderVolumeChart(filtered, weeks);
  renderDistributionChart(weeks);
}

function renderFrequencyChart(workouts, weeks) {
  const container = document.getElementById('frequency-chart');
  const weeklyCount = {};

  for (let i = 0; i < weeks; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const ws = getWeekStart(d);
    const key = getDateStr(ws);
    weeklyCount[key] = 0;
  }

  workouts.forEach(w => {
    const ws = getWeekStart(new Date(w.date));
    const key = getDateStr(ws);
    if (key in weeklyCount) weeklyCount[key]++;
  });

  const entries = Object.entries(weeklyCount).sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(...entries.map(e => e[1]), 1);

  container.innerHTML = `<div class="bar-chart">
    ${entries.map(([key, val]) => {
      const label = key.slice(5);
      const height = (val / max) * 100;
      return `<div class="bar-wrapper">
        <span class="bar-value">${val}</span>
        <div class="bar" style="height: ${height}%"></div>
        <span class="bar-label">${label}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function renderWeightChart(workouts) {
  const container = document.getElementById('weight-chart');
  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date));

  const dataPoints = [];
  sorted.forEach(w => {
    (w.exercises || []).forEach(ex => {
      const maxWeight = Math.max(...(ex.sets || []).map(s => s.weight || 0), 0);
      if (maxWeight > 0) {
        dataPoints.push({ date: w.date, name: ex.name, weight: maxWeight });
      }
    });
  });

  if (dataPoints.length === 0) {
    container.innerHTML = '<div class="no-data">尚無重量資料</div>';
    return;
  }

  const exerciseGroups = {};
  dataPoints.forEach(p => {
    if (!exerciseGroups[p.name]) exerciseGroups[p.name] = [];
    exerciseGroups[p.name].push(p);
  });

  let html = '<div style="display:flex;flex-direction:column;gap:12px;">';
  Object.entries(exerciseGroups).slice(0, 5).forEach(([name, points]) => {
    const first = points[0].weight;
    const last = points[points.length - 1].weight;
    const diff = last - first;
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    const color = diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--danger)' : 'var(--text-muted)';

    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:0.85rem;">${name}</span>
      <span style="color:${color};font-weight:600;font-size:0.9rem;">${last}kg ${arrow} ${diff > 0 ? '+' : ''}${diff}kg</span>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderDurationChart(workouts) {
  const container = document.getElementById('duration-chart');
  const sorted = [...workouts].filter(w => w.duration > 0).sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    container.innerHTML = '<div class="no-data">尚無時長資料</div>';
    return;
  }

  const max = Math.max(...sorted.map(w => w.duration));
  container.innerHTML = `<div class="bar-chart">
    ${sorted.slice(-10).map(w => {
      const height = (w.duration / max) * 100;
      return `<div class="bar-wrapper">
        <span class="bar-value">${w.duration}m</span>
        <div class="bar" style="height: ${height}%"></div>
        <span class="bar-label">${w.date.slice(5)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// --- Volume Analysis (Feature 11) ---
function renderVolumeChart(workouts, weeks) {
  const container = document.getElementById('volume-chart');

  // Calculate weekly volume per muscle group: sets × weight × reps
  const weeklyVolume = {};
  for (let i = 0; i < weeks; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const ws = getWeekStart(d);
    const key = getDateStr(ws);
    weeklyVolume[key] = { total: 0, byMuscle: {} };
  }

  workouts.forEach(w => {
    const ws = getWeekStart(new Date(w.date));
    const key = getDateStr(ws);
    if (!(key in weeklyVolume)) return;

    let sessionVolume = 0;
    (w.exercises || []).forEach(ex => {
      (ex.sets || []).forEach(s => {
        const vol = (s.weight || 0) * (s.reps || 0);
        sessionVolume += vol;
      });
    });

    weeklyVolume[key].total += sessionVolume;

    (w.muscles || []).forEach(m => {
      if (!weeklyVolume[key].byMuscle[m]) weeklyVolume[key].byMuscle[m] = 0;
      weeklyVolume[key].byMuscle[m] += sessionVolume / (w.muscles.length || 1);
    });
  });

  const entries = Object.entries(weeklyVolume).sort((a, b) => a[0].localeCompare(b[0]));
  const totalVolumes = entries.map(e => e[1].total);
  const max = Math.max(...totalVolumes, 1);

  if (max <= 1) {
    container.innerHTML = '<div class="no-data">尚無訓練量資料</div>';
    return;
  }

  // Show bar chart of weekly total volume
  let html = `<div class="bar-chart">
    ${entries.map(([key, data]) => {
      const height = (data.total / max) * 100;
      const volStr = data.total >= 1000 ? `${(data.total / 1000).toFixed(1)}k` : data.total;
      return `<div class="bar-wrapper">
        <span class="bar-value">${volStr}</span>
        <div class="bar" style="height: ${height}%"></div>
        <span class="bar-label">${key.slice(5)}</span>
      </div>`;
    }).join('')}
  </div>`;

  // Add summary below
  const totalAll = totalVolumes.reduce((a, b) => a + b, 0);
  const avg = Math.round(totalAll / weeks);
  const lastWeek = totalVolumes[totalVolumes.length - 1] || 0;
  const prevWeek = totalVolumes[totalVolumes.length - 2] || 0;
  const change = prevWeek > 0 ? Math.round(((lastWeek - prevWeek) / prevWeek) * 100) : 0;
  const changeColor = change > 0 ? 'var(--success)' : change < 0 ? 'var(--danger)' : 'var(--text-muted)';
  const changeStr = change > 0 ? `+${change}%` : `${change}%`;

  html += `<div style="display:flex;justify-content:space-around;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">
    <div style="text-align:center;">
      <div style="font-size:0.7rem;color:var(--text-muted);">週平均</div>
      <div style="font-size:0.9rem;font-weight:600;color:var(--accent);">${avg >= 1000 ? (avg / 1000).toFixed(1) + 'k' : avg} kg</div>
    </div>
    <div style="text-align:center;">
      <div style="font-size:0.7rem;color:var(--text-muted);">本週 vs 上週</div>
      <div style="font-size:0.9rem;font-weight:600;color:${changeColor};">${changeStr}</div>
    </div>
  </div>`;

  container.innerHTML = html;
}

function renderDistributionChart(weeks) {
  const container = document.getElementById('distribution-chart');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);

  const counts = {};
  Object.keys(MUSCLE_LABELS).forEach(m => counts[m] = 0);

  state.workouts
    .filter(w => new Date(w.date) >= cutoff)
    .forEach(w => {
      (w.muscles || []).forEach(m => { counts[m] = (counts[m] || 0) + 1; });
    });

  const max = Math.max(...Object.values(counts), 1);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  container.innerHTML = `<div class="distribution-chart">
    ${sorted.map(([muscle, count]) => `
      <div class="dist-row">
        <span class="dist-label">${MUSCLE_LABELS[muscle]}</span>
        <div class="dist-bar-bg">
          <div class="dist-bar-fill" style="width: ${(count / max) * 100}%"></div>
        </div>
        <span class="dist-value">${count}</span>
      </div>`).join('')}
  </div>`;
}

// --- Helpers ---
function getDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' });
}
