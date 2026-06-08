const API_BASE = 'https://workout-tracker.welly180.workers.dev';

const MUSCLE_LABELS = {
  chest: '胸', back: '背', shoulders: '肩', biceps: '二頭',
  triceps: '三頭', legs: '腿', core: '核心', cardio: '有氧'
};

let state = {
  token: localStorage.getItem('token') || null,
  workouts: [],
  
  // Record Tab State
  currentRecordDate: getDateStr(new Date()),
  selectedMuscles: [],
  currentExercises: [],
  editingExerciseIndex: null,

  // Dashboard Tab State
  dashboardDate: new Date(),

  // Timer Tab State
  timerInterval: null,
  timerSeconds: 90,
  timerRemaining: 90,
  timerRunning: false,

  // Check-in State
  checkinStartTime: localStorage.getItem('checkinStartTime') ? parseInt(localStorage.getItem('checkinStartTime')) : null,
  checkinInterval: null
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  if (state.token) {
    showApp();
    loadWorkouts();
  }
  setupEventListeners();
  initDatePicker();
  
  if (state.checkinStartTime) {
    resumeCheckin();
  }
});

function setupEventListeners() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => selectMuscle(chip));
  });

  document.getElementById('record-date-picker').addEventListener('change', (e) => {
    state.currentRecordDate = e.target.value;
    loadWorkoutForDate(state.currentRecordDate);
  });

  document.getElementById('add-exercise-btn').addEventListener('click', () => openExerciseModal());
  document.getElementById('modal-close').addEventListener('click', closeExerciseModal);
  document.getElementById('exercise-form').addEventListener('submit', handleExerciseSubmit);
  document.getElementById('add-set-btn').addEventListener('click', addSetRow);

  document.getElementById('save-workout-btn').addEventListener('click', saveWorkout);
  document.getElementById('delete-workout-btn').addEventListener('click', deleteDayWorkout);

  // Timer
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => setTimerPreset(btn));
  });
  document.getElementById('timer-start').addEventListener('click', startTimer);
  document.getElementById('timer-pause').addEventListener('click', pauseTimer);
  document.getElementById('timer-reset').addEventListener('click', resetTimer);

  // Dashboard Nav
  document.getElementById('prev-month').addEventListener('click', () => changeDashboardMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => changeDashboardMonth(1));

  // Analysis
  document.getElementById('analysis-muscle').addEventListener('change', renderAnalysis);
  document.getElementById('analysis-period').addEventListener('change', renderAnalysis);

  // Check-in
  document.getElementById('checkin-start').addEventListener('click', startCheckin);
  document.getElementById('checkin-end').addEventListener('click', endCheckin);

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

function initDatePicker() {
  const picker = document.getElementById('record-date-picker');
  picker.value = state.currentRecordDate;
  updateDateDisplay();
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
    loadWorkoutForDate(state.currentRecordDate);
  } catch (err) {
    console.error('載入失敗:', err);
  }
}

// --- Record Tab Logic ---

function loadWorkoutForDate(dateStr) {
  const workout = state.workouts.find(w => w.date === dateStr);
  
  if (workout) {
    state.selectedMuscles = workout.muscles || [];
    state.currentExercises = workout.exercises || [];
    document.getElementById('duration-input').value = workout.duration || '';
  } else {
    state.selectedMuscles = [];
    state.currentExercises = [];
    document.getElementById('duration-input').value = '';
  }

  updateDateDisplay();
  renderMuscleChips();
  renderExercisesList();
}

function updateDateDisplay() {
  const d = new Date(state.currentRecordDate);
  const opts = { month: 'long', day: 'numeric', weekday: 'short' };
  document.getElementById('today-date-display').textContent = d.toLocaleDateString('zh-TW', opts);
}

function selectMuscle(chip) {
  const muscle = chip.dataset.muscle;
  if (state.selectedMuscles.includes(muscle)) {
    state.selectedMuscles = [];
  } else {
    state.selectedMuscles = [muscle];
  }
  renderMuscleChips();
}

function renderMuscleChips() {
  document.querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', state.selectedMuscles.includes(chip.dataset.muscle));
  });
}

function renderExercisesList() {
  const list = document.getElementById('exercises-list');
  if (state.currentExercises.length === 0) {
    list.innerHTML = '<div class="no-data">尚無動作紀錄</div>';
    return;
  }

  list.innerHTML = state.currentExercises.map((ex, i) => `
    <div class="exercise-card has-drag" data-index="${i}" onclick="editExercise(${i})">
      <div class="exercise-card-drag">⠿</div>
      <div class="exercise-card-header">
        <span class="exercise-card-name">${ex.name}</span>
        <button class="exercise-card-delete" onclick="event.stopPropagation(); removeExercise(${i})">×</button>
      </div>
      <div class="exercise-card-sets">
        ${ex.sets.map((s, j) => `<span>第${j + 1}組: ${s.weight}lbs × ${s.reps}</span>`).join('')}
      </div>
    </div>`).join('');
}

function removeExercise(index) {
  if (confirm('確定要刪除此動作嗎？')) {
    state.currentExercises.splice(index, 1);
    renderExercisesList();
  }
}

function editExercise(index) {
  state.editingExerciseIndex = index;
  const ex = state.currentExercises[index];
  openExerciseModal(ex);
}

async function saveWorkout() {
  const statusEl = document.getElementById('save-status');
  statusEl.textContent = '儲存中...';
  statusEl.className = 'save-status';

  const duration = parseInt(document.getElementById('duration-input').value) || 0;

  if (state.selectedMuscles.length === 0 && state.currentExercises.length === 0) {
    statusEl.textContent = '請至少選擇一個訓練部位或新增動作';
    statusEl.className = 'save-status error';
    return;
  }

  const workout = {
    date: state.currentRecordDate,
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

async function deleteDayWorkout() {
  if (!confirm(`確定要刪除 ${state.currentRecordDate} 的所有紀錄嗎？此動作無法復原。`)) return;
  try {
    await apiCall('POST', '/api/workouts', {
      date: state.currentRecordDate,
      muscles: [],
      exercises: [],
      duration: 0
    });
    await loadWorkouts();
    alert('已刪除紀錄');
  } catch (err) {
    alert('刪除失敗: ' + err.message);
  }
}

// --- Exercise Modal ---

function openExerciseModal(exercise = null) {
  const modal = document.getElementById('exercise-modal');
  const title = document.getElementById('modal-title');
  const nameInput = document.getElementById('exercise-name');
  const setsList = document.getElementById('sets-list');

  modal.classList.add('active');
  
  if (exercise) {
    title.textContent = '編輯動作';
    nameInput.value = exercise.name;
    setsList.innerHTML = exercise.sets.map((s, i) => `
      <div class="set-row">
        <span class="set-num">${i + 1}</span>
        <input type="number" value="${s.weight}" placeholder="重量(lbs)" class="set-weight" step="0.5">
        <input type="number" value="${s.reps}" placeholder="次數" class="set-reps">
      </div>`).join('');
    showLastRecord(exercise.name);
  } else {
    state.editingExerciseIndex = null;
    title.textContent = '新增動作';
    nameInput.value = '';
    setsList.innerHTML = `
      <div class="set-row">
        <span class="set-num">1</span>
        <input type="number" placeholder="重量(lbs)" class="set-weight" step="0.5">
        <input type="number" placeholder="次數" class="set-reps">
      </div>`;
    document.getElementById('last-record').classList.remove('visible');
  }
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
    <input type="number" placeholder="重量(lbs)" class="set-weight" step="0.5">
    <input type="number" placeholder="次數" class="set-reps">`;
  list.appendChild(row);
}

function handleExerciseSubmit(e) {
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

  const exerciseData = { name, sets };

  if (state.editingExerciseIndex !== null) {
    state.currentExercises[state.editingExerciseIndex] = exerciseData;
  } else {
    state.currentExercises.push(exerciseData);
  }

  renderExercisesList();
  closeExerciseModal();
}

// --- Check-in Logic ---

function startCheckin() {
  state.checkinStartTime = Date.now();
  localStorage.setItem('checkinStartTime', state.checkinStartTime);
  resumeCheckin();
}

function resumeCheckin() {
  document.getElementById('checkin-start').disabled = true;
  document.getElementById('checkin-end').disabled = false;
  document.getElementById('checkin-status').textContent = '訓練進行中...';

  state.checkinInterval = setInterval(updateCheckinTimer, 1000);
  updateCheckinTimer();
}

function updateCheckinTimer() {
  const elapsed = Date.now() - state.checkinStartTime;
  const h = Math.floor(elapsed / 3600000);
  const m = Math.floor((elapsed % 3600000) / 60000);
  const s = Math.floor((elapsed % 60000) / 1000);
  
  document.getElementById('checkin-timer-display').textContent = 
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function endCheckin() {
  if (!confirm('確定要結束訓練並記錄時間嗎？')) return;

  clearInterval(state.checkinInterval);
  const elapsedMinutes = Math.round((Date.now() - state.checkinStartTime) / 60000);
  
  const durationInput = document.getElementById('duration-input');
  durationInput.value = elapsedMinutes;
  
  durationInput.style.borderColor = 'var(--success)';
  durationInput.style.boxShadow = '0 0 15px var(--success)';
  durationInput.style.transition = 'all 0.3s ease';
  
  state.checkinStartTime = null;
  localStorage.removeItem('checkinStartTime');
  document.getElementById('checkin-start').disabled = false;
  document.getElementById('checkin-end').disabled = true;
  document.getElementById('checkin-status').textContent = `訓練已結束，時長 (${elapsedMinutes} 分) 已填入紀錄頁。`;
  document.getElementById('checkin-timer-display').textContent = '00:00:00';
  
  switchTab('record');

  setTimeout(() => {
    durationInput.style.borderColor = '';
    durationInput.style.boxShadow = '';
  }, 2000);
}

// --- Dashboard Logic ---

function changeDashboardMonth(delta) {
  state.dashboardDate.setMonth(state.dashboardDate.getMonth() + delta);
  renderDashboard();
}

function renderDashboard() {
  const now = state.dashboardDate;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  document.getElementById('current-month-display').textContent = 
    `${now.getFullYear()}年${now.getMonth() + 1}月`;

  const actualNow = new Date();
  const weekStart = getWeekStart(actualNow);
  
  const weekWorkouts = state.workouts.filter(w => new Date(w.date) >= weekStart);
  const monthWorkouts = state.workouts.filter(w => {
    const d = new Date(w.date);
    return d >= monthStart && d <= monthEnd;
  });

  document.getElementById('week-count').textContent = weekWorkouts.length;
  document.getElementById('month-count').textContent = monthWorkouts.length;
  document.getElementById('streak-count').textContent = calculateStreak();

  renderWeekDays(actualNow);
  renderMonthGrid(now);
  renderRecentWorkouts();
}

function renderWeekDays(now) {
  const container = document.getElementById('week-days');
  const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const weekStart = getWeekStart(now);

  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = getDateStr(d);
    const isToday = dateStr === getDateStr(new Date());
    const trained = state.workouts.some(w => w.date === dateStr);

    html += `<div class="week-day ${trained ? 'active' : ''} ${isToday ? 'today' : ''}">
      <span class="week-day-label">${dayLabels[i]}</span>
      <span class="week-day-num">${d.getDate()}</span>
      <span class="week-day-dot"></span>
    </div>`;
  }
  container.innerHTML = html;
}

function renderMonthGrid(date) {
  const container = document.getElementById('month-grid');
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startOffset = firstDay.getDay();

  let html = '';
  for (let i = 0; i < startOffset; i++) {
    html += '<div class="month-cell"></div>';
  }

  const todayStr = getDateStr(new Date());
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const trained = state.workouts.some(w => w.date === dateStr);
    const isToday = dateStr === todayStr;
    html += `<div class="month-cell ${trained ? 'trained' : ''} ${isToday ? 'today' : ''}">${d}</div>`;
  }
  container.innerHTML = html;
}

// --- Autocomplete & Last Record ---

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

function showLastRecord(exerciseName) {
  const container = document.getElementById('last-record');
  let lastRecord = null;
  const sorted = [...state.workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    if (w.date === state.currentRecordDate) continue;
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
      ${lastRecord.sets.map((s, i) => `<span>第${i + 1}組: ${s.weight}lbs × ${s.reps}</span>`).join('')}
    </div>`;
}

// --- General UI ---

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');

  if (tab === 'dashboard') renderDashboard();
  if (tab === 'analysis') renderAnalysis();
}

// --- Helpers ---

function getDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); 
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' });
}

function getAllExerciseNames() {
  const names = new Set();
  state.workouts.forEach(w => {
    (w.exercises || []).forEach(ex => names.add(ex.name));
  });
  return [...names];
}

function calculateStreak() {
  let streak = 0;
  const d = new Date();
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

// --- Timer & Analysis Logic ---

function playTimerSound() {
  const soundEnabled = document.getElementById('timer-sound').checked;
  if (!soundEnabled) return;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
  document.getElementById('timer-start').classList.remove('paused-blink');
  document.getElementById('timer-display').classList.add('active');
  document.getElementById('timer-pause').disabled = false;
  state.timerInterval = setInterval(() => {
    state.timerRemaining--;
    updateTimerDisplay();
    updateProgressRing();
    if (state.timerRemaining <= 0) {
      clearInterval(state.timerInterval);
      state.timerRunning = false;
      document.getElementById('timer-start').disabled = false;
      document.getElementById('timer-display').classList.remove('active');
      document.getElementById('timer-pause').disabled = true;
      playTimerSound();
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  document.getElementById('timer-start').disabled = false;
  document.getElementById('timer-start').classList.add('paused-blink');
  document.getElementById('timer-display').classList.remove('active');
  document.getElementById('timer-pause').disabled = true;
}

function resetTimer() {
  pauseTimer();
  document.getElementById('timer-start').classList.remove('paused-blink');
  state.timerRemaining = state.timerSeconds;
  updateTimerDisplay();
  updateProgressRing();
}

function updateTimerDisplay() {
  const mins = Math.floor(state.timerRemaining / 60);
  const secs = state.timerRemaining % 60;
  document.getElementById('timer-display').textContent = 
    `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateProgressRing() {
  const circle = document.getElementById('progress-circle');
  const circumference = 2 * Math.PI * 90;
  const progress = state.timerRemaining / state.timerSeconds;
  circle.style.strokeDashoffset = circumference * (1 - progress);
}

function renderAnalysis() {
  const muscleFilter = document.getElementById('analysis-muscle').value;
  const weeks = parseInt(document.getElementById('analysis-period').value);
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
    weeklyCount[getDateStr(ws)] = 0;
  }
  workouts.forEach(w => {
    const ws = getDateStr(getWeekStart(new Date(w.date)));
    if (ws in weeklyCount) weeklyCount[ws]++;
  });
  const entries = Object.entries(weeklyCount).sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(...entries.map(e => e[1]), 1);
  container.innerHTML = `<div class="bar-chart">${entries.map(([k, v]) => `
    <div class="bar-wrapper">
      <span class="bar-value">${v}</span>
      <div class="bar" style="height: ${(v/max)*100}%"></div>
      <span class="bar-label">${k.slice(5)}</span>
    </div>`).join('')}</div>`;
}

function renderWeightChart(workouts) {
  const container = document.getElementById('weight-chart');
  const data = {};
  workouts.forEach(w => {
    (w.exercises || []).forEach(ex => {
      const maxW = Math.max(...ex.sets.map(s => s.weight), 0);
      if (!data[ex.name]) data[ex.name] = [];
      data[ex.name].push({ d: w.date, w: maxW });
    });
  });
  const entries = Object.entries(data).slice(0, 5);
  if (entries.length === 0) {
    container.innerHTML = '<div class="no-data">尚無重量數據</div>';
    return;
  }
  container.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">
    ${entries.map(([name, points]) => {
      const last = points[points.length - 1].w;
      const first = points[0].w;
      const diff = last - first;
      return `<div style="display:flex;justify-content:space-between;font-size:0.85rem;">
        <span>${name}</span>
        <span style="color:${diff >= 0 ? 'var(--success)' : 'var(--danger)'}">${last} lbs (${diff >= 0 ? '+' : ''}${diff})</span>
      </div>`;
    }).join('')}
  </div>`;
}

function renderDurationChart(workouts) {
  const container = document.getElementById('duration-chart');
  const sorted = workouts.filter(w => w.duration > 0).sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
  if (sorted.length === 0) {
    container.innerHTML = '<div class="no-data">尚無時長數據</div>';
    return;
  }
  const max = Math.max(...sorted.map(w => w.duration), 1);
  container.innerHTML = `<div class="bar-chart">${sorted.map(w => `
    <div class="bar-wrapper">
      <span class="bar-value">${w.duration}m</span>
      <div class="bar" style="height: ${(w.duration/max)*100}%"></div>
      <span class="bar-label">${w.date.slice(5)}</span>
    </div>`).join('')}</div>`;
}

function renderVolumeChart(workouts, weeks) {
  const container = document.getElementById('volume-chart');
  const weeklyVol = {};
  for (let i = 0; i < weeks; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    weeklyVol[getDateStr(getWeekStart(d))] = 0;
  }
  workouts.forEach(w => {
    const ws = getDateStr(getWeekStart(new Date(w.date)));
    if (ws in weeklyVol) {
      w.exercises.forEach(ex => ex.sets.forEach(s => weeklyVol[ws] += (s.weight * s.reps)));
    }
  });
  const entries = Object.entries(weeklyVol).sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(...entries.map(e => e[1]), 1);
  container.innerHTML = `<div class="bar-chart">${entries.map(([k, v]) => `
    <div class="bar-wrapper">
      <span class="bar-value">${v > 1000 ? (v/1000).toFixed(1)+'k' : v}</span>
      <div class="bar" style="height: ${(v/max)*100}%"></div>
      <span class="bar-label">${k.slice(5)}</span>
    </div>`).join('')}</div>`;
}

function renderDistributionChart(weeks) {
  const container = document.getElementById('distribution-chart');
  const counts = {};
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  state.workouts.filter(w => new Date(w.date) >= cutoff).forEach(w => {
    w.muscles.forEach(m => counts[m] = (counts[m] || 0) + 1);
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...Object.values(counts), 1);
  container.innerHTML = `<div class="distribution-chart">${sorted.map(([m, c]) => `
    <div class="dist-row">
      <span class="dist-label">${MUSCLE_LABELS[m]}</span>
      <div class="dist-bar-bg"><div class="dist-bar-fill" style="width: ${(c/max)*100}%"></div></div>
      <span class="dist-value">${c}</span>
    </div>`).join('')}</div>`;
}

function handleAutocompleteKeydown(e) {
  const list = document.getElementById('autocomplete-list');
  if (!list.classList.contains('active')) return;
  const items = list.querySelectorAll('.autocomplete-item');
  const current = list.querySelector('.autocomplete-item.highlighted');
  let index = current ? parseInt(current.dataset.index) : -1;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    index = Math.min(index + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    index = Math.max(index - 1, 0);
  } else if (e.key === 'Enter' && current) {
    e.preventDefault();
    document.getElementById('exercise-name').value = current.dataset.name;
    list.classList.remove('active');
    showLastRecord(current.dataset.name);
    return;
  }
  items.forEach((item, i) => item.classList.toggle('highlighted', i === index));
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
