// DOM Elements
const video = document.getElementById('video');
const canvas = document.getElementById('output');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const resetBtn = document.getElementById('reset-btn');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const overlayMessage = document.getElementById('overlay-message');

const studyTimerDisplay = document.getElementById('study-timer');
const breakTimerDisplay = document.getElementById('break-timer');
const sessionStatusDisplay = document.getElementById('session-status');
const focusScoreDisplay = document.getElementById('focus-score');
const focusProgress = document.getElementById('focus-progress');

// History Elements
const historyBtn = document.getElementById('history-btn');
const historyModal = document.getElementById('history-modal');
const closeHistoryBtn = document.getElementById('close-history');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history');

// Description Modal Elements
const descriptionModal = document.getElementById('description-modal');
const sessionDescriptionInput = document.getElementById('session-description');
const confirmEndSessionBtn = document.getElementById('confirm-end-session');
const cancelEndSessionBtn = document.getElementById('cancel-end-session');

// Timestamp Elements
// Timestamp Elements
const timestampInput = document.getElementById('timestamp-input');
const addTimestampBtn = document.getElementById('add-timestamp-btn');
const currentTimestampsList = document.getElementById('current-session-timestamps');
const openTimestampsBtn = document.getElementById('open-timestamps-btn');
const timestampModal = document.getElementById('timestamp-modal');
const closeTimestampsBtn = document.getElementById('close-timestamps');

// State
let detector;
let isRunning = false;
let isVideoReady = false;
let animationId;
let lastFaceDetectedTime = 0;
let studyTime = 0; // in seconds
let breakTime = 0; // in seconds
let timerInterval;
let isFacePresent = false;
let sessionStartTime = null;
let currentSessionTimestamps = [];

// Constants
const BREAK_THRESHOLD = 5000; // ms to wait before switching to break mode (more forgiving for movement)

// Session Persistence Logic
function saveCurrentSession() {
    if (studyTime === 0 && breakTime === 0) return;

    const currentSession = {
        studyTime,
        breakTime,
        sessionStartTime,
        lastFaceDetectedTime,
        isFacePresent,
        timestamps: currentSessionTimestamps
    };

    localStorage.setItem('focus_current_session', JSON.stringify(currentSession));
}

function restoreSession() {
    const saved = localStorage.getItem('focus_current_session');
    if (!saved) return false;

    try {
        const session = JSON.parse(saved);
        studyTime = session.studyTime || 0;
        breakTime = session.breakTime || 0;
        sessionStartTime = session.sessionStartTime;
        lastFaceDetectedTime = session.lastFaceDetectedTime || 0;
        isFacePresent = session.isFacePresent || false;
        currentSessionTimestamps = session.timestamps || [];

        // Restore timestamps UI
        currentTimestampsList.innerHTML = '';
        currentSessionTimestamps.forEach(t => {
            const item = document.createElement('div');
            item.className = 'timestamp-item';
            item.innerHTML = `
                <span class="timestamp-time">${t.relativeTime}</span>
                <span class="timestamp-note">${t.note}</span>
            `;
            currentTimestampsList.prepend(item);
        });

        updateDisplay();
        return true;
    } catch (error) {
        console.error('Error restoring session:', error);
        return false;
    }
}

function clearCurrentSession() {
    localStorage.removeItem('focus_current_session');
}

// History Logic
function saveSession(description = '') {
    if (studyTime === 0 && breakTime === 0) return;

    const session = {
        id: Date.now(),
        startTime: sessionStartTime,
        endTime: new Date().toISOString(),
        studyTime,
        breakTime,
        score: calculateScore(studyTime, breakTime),
        description: description.trim(),
        timestamps: currentSessionTimestamps
    };

    const history = getHistory();
    history.unshift(session); // Add to beginning
    localStorage.setItem('focus_history', JSON.stringify(history));

    // Clear current session after saving to history
    clearCurrentSession();
}

function getHistory() {
    const stored = localStorage.getItem('focus_history');
    return stored ? JSON.parse(stored) : [];
}

function calculateScore(study, breakT) {
    const total = study + breakT;
    return total > 0 ? Math.round((study / total) * 100) : 0;
}

function renderHistory() {
    const history = getHistory();

    if (history.length === 0) {
        historyList.innerHTML = '<div class="empty-state">No sessions recorded yet</div>';
        return;
    }

    historyList.innerHTML = history.map(session => {
        const startDate = new Date(session.startTime || session.date);
        const endDate = new Date(session.endTime || session.date);

        const dateStr = startDate.toLocaleDateString(undefined, {
            month: 'short', day: 'numeric'
        });

        const startTime = startDate.toLocaleTimeString(undefined, {
            hour: '2-digit', minute: '2-digit'
        });

        const endTime = endDate.toLocaleTimeString(undefined, {
            hour: '2-digit', minute: '2-digit'
        });

        const descriptionHTML = session.description
            ? `<div class="session-description">"${session.description}"</div>`
            : '';

        return `
            <div class="history-item">
                <div class="history-info">
                    <div class="history-date">${dateStr} • ${startTime} - ${endTime}</div>
                    <div class="history-stats">
                        <div class="stat-pill focus">
                            <span>Focus:</span>
                            <strong>${formatTime(session.studyTime)}</strong>
                        </div>
                        <div class="stat-pill break">
                            <span>Break:</span>
                            <strong>${formatTime(session.breakTime)}</strong>
                        </div>
                    </div>
                    ${descriptionHTML}
                </div>
                <div class="history-score">${session.score}%</div>
            </div>
            </div>
            ${renderSessionTimestamps(session)}
        `;
    }).join('');
}

function renderSessionTimestamps(session) {
    const timestamps = session.timestamps;
    if (!timestamps || timestamps.length === 0) return '';

    return `
        <div class="timestamps-wrapper">
            <button class="btn-toggle-timestamps">
                <span>Show Timestamps (${timestamps.length})</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chevron-icon">
                    <path d="M6 9l6 6 6-6"></path>
                </svg>
            </button>
            <div class="history-timestamps hidden">
                ${timestamps.map(t => `
                    <div class="timestamp-item">
                        <span class="timestamp-time">${t.relativeTime}</span>
                        <span class="timestamp-note">${t.note}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Timestamp Logic
function addTimestamp(note) {
    if (!note.trim()) return;

    const now = new Date();
    const relativeSeconds = studyTime + breakTime;
    const relativeTime = formatTime(relativeSeconds);

    const timestamp = {
        id: Date.now(),
        relativeTime,
        actualTime: now.toISOString(),
        note: note.trim()
    };

    currentSessionTimestamps.push(timestamp);

    // Update UI
    const item = document.createElement('div');
    item.className = 'timestamp-item';
    item.innerHTML = `
        <span class="timestamp-time">${relativeTime}</span>
        <span class="timestamp-note">${timestamp.note}</span>
    `;
    currentTimestampsList.prepend(item); // Add new ones to top

    // Clear input
    timestampInput.value = '';
}

function toggleTimestampControls(enabled) {
    openTimestampsBtn.disabled = !enabled;
    if (!enabled) {
        timestampModal.classList.add('hidden');
    }
}

// Initialize TensorFlow.js Face Detection
async function setupDetector() {
    const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
    const detectorConfig = {
        runtime: 'tfjs',
        modelType: 'short'
    };
    detector = await faceDetection.createDetector(model, detectorConfig);
    console.log('Face Detector Loaded');
    statusText.innerText = 'Ready to start';
}

// Camera Setup
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                facingMode: 'user'
            },
            audio: false
        });
        video.srcObject = stream;

        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve(video);
            };
        });
    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Could not access camera. Please ensure you have granted permission.');
        statusText.innerText = 'Camera Error';
    }
}

// Timer Logic
function updateTimers() {
    if (!isRunning) return;

    const now = Date.now();

    // Check if face was detected recently (within threshold)
    if (now - lastFaceDetectedTime < BREAK_THRESHOLD) {
        // User is studying
        if (!isFacePresent) {
            isFacePresent = true;
            updateStatus('focus');
        }
        studyTime++;
    } else {
        // User is taking a break
        if (isFacePresent) {
            isFacePresent = false;
            updateStatus('break');
        }
        breakTime++;
    }

    updateDisplay();

    // Auto-save current session every second
    saveCurrentSession();
}

function updateStatus(mode) {
    statusBadge.className = 'status-badge'; // reset
    if (mode === 'focus') {
        statusBadge.classList.add('active');
        statusText.innerText = 'Focusing';
        sessionStatusDisplay.innerText = 'Studying';
        sessionStatusDisplay.style.color = 'var(--success)';
    } else if (mode === 'break') {
        statusBadge.classList.add('break');
        statusText.innerText = 'Away';
        sessionStatusDisplay.innerText = 'On Break';
        sessionStatusDisplay.style.color = 'var(--warning)';
    } else {
        statusText.innerText = 'Paused';
        sessionStatusDisplay.innerText = 'Paused';
        sessionStatusDisplay.style.color = 'var(--text-muted)';
    }

    // Disable timestamp input if paused or on break
    const canAddTimestamp = mode === 'focus';
    toggleTimestampControls(canAddTimestamp);
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateDisplay() {
    studyTimerDisplay.innerText = formatTime(studyTime);
    breakTimerDisplay.innerText = formatTime(breakTime);

    // Calculate Focus Score
    const totalTime = studyTime + breakTime;
    if (totalTime > 0) {
        const score = Math.round((studyTime / totalTime) * 100);
        focusScoreDisplay.innerText = `${score}%`;
        focusProgress.style.width = `${score}%`;
    } else {
        focusScoreDisplay.innerText = '--';
        focusProgress.style.width = '0%';
    }
}

// Detection Loop
async function detectFaces() {
    if (!isRunning || !detector) return;

    try {
        const faces = await detector.estimateFaces(video);
        const ctx = canvas.getContext('2d');

        // Match canvas size to video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (faces.length > 0) {
            lastFaceDetectedTime = Date.now();

            // Draw bounding box (optional visual feedback)
            faces.forEach(face => {
                const { box } = face;
                ctx.strokeStyle = '#6366f1';
                ctx.lineWidth = 2;
                ctx.strokeRect(box.xMin, box.yMin, box.width, box.height);
            });
        }

    } catch (error) {
        console.error('Detection error:', error);
    }

    animationId = requestAnimationFrame(detectFaces);
}

// Event Listeners
startBtn.addEventListener('click', async () => {
    if (isRunning) return;

    if (!isVideoReady) {
        overlayMessage.innerText = 'Starting camera...';
        await setupCamera();
        isVideoReady = true;
    }

    // Always hide overlay when starting/resuming
    overlayMessage.classList.add('hidden');

    // Track session start time
    if (!sessionStartTime) {
        sessionStartTime = new Date().toISOString();
    }

    isRunning = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;

    // Start timers
    timerInterval = setInterval(updateTimers, 1000);

    // Start detection
    detectFaces();
    updateStatus('focus'); // Assume focus initially until detection proves otherwise

    // Clear previous timestamps UI if starting fresh (not resuming)
    if (studyTime === 0 && breakTime === 0) {
        currentSessionTimestamps = [];
        currentTimestampsList.innerHTML = '';
    }
});

stopBtn.addEventListener('click', () => {
    isRunning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    clearInterval(timerInterval);
    cancelAnimationFrame(animationId);
    updateStatus('paused');
    overlayMessage.classList.remove('hidden');
    overlayMessage.innerText = 'Session Paused';

    // Save session when paused
    saveCurrentSession();
});

resetBtn.addEventListener('click', () => {
    // Show description modal instead of confirm dialog
    descriptionModal.classList.remove('hidden');
    sessionDescriptionInput.value = '';
    sessionDescriptionInput.focus();
});

// Description Modal Event Listeners
confirmEndSessionBtn.addEventListener('click', () => {
    const description = sessionDescriptionInput.value;

    // Save session with description
    saveSession(description);

    // Hide modal
    descriptionModal.classList.add('hidden');

    // Stop camera and release resources
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }

    // Reset session
    isRunning = false;
    isVideoReady = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    clearInterval(timerInterval);
    cancelAnimationFrame(animationId);

    studyTime = 0;
    breakTime = 0;
    isFacePresent = false;
    sessionStartTime = null;
    currentSessionTimestamps = [];
    currentTimestampsList.innerHTML = '';

    updateDisplay();
    updateStatus('idle');
    overlayMessage.classList.remove('hidden');
    overlayMessage.innerText = 'Ready to Start';
});

cancelEndSessionBtn.addEventListener('click', () => {
    descriptionModal.classList.add('hidden');
});

// History Event Listeners
historyBtn.addEventListener('click', () => {
    renderHistory();
    historyModal.classList.remove('hidden');
});

closeHistoryBtn.addEventListener('click', () => {
    historyModal.classList.add('hidden');
});

clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all history?')) {
        localStorage.removeItem('focus_history');
        renderHistory();
    }
});

// Close modal on outside click
historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) {
        historyModal.classList.add('hidden');
    }
});

descriptionModal.addEventListener('click', (e) => {
    if (e.target === descriptionModal) {
        descriptionModal.classList.add('hidden');
    }
});

timestampModal.addEventListener('click', (e) => {
    if (e.target === timestampModal) {
        timestampModal.classList.add('hidden');
    }
});

// History List Event Delegation for Toggles
historyList.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-toggle-timestamps');
    if (btn) {
        const wrapper = btn.closest('.timestamps-wrapper');
        const container = wrapper.querySelector('.history-timestamps');
        const icon = btn.querySelector('.chevron-icon');
        const textSpan = btn.querySelector('span');

        container.classList.toggle('hidden');
        btn.classList.toggle('active');

        if (container.classList.contains('hidden')) {
            textSpan.textContent = textSpan.textContent.replace('Hide', 'Show');
        } else {
            textSpan.textContent = textSpan.textContent.replace('Show', 'Hide');
        }
    }
});

// Timestamp Event Listeners
addTimestampBtn.addEventListener('click', () => {
    addTimestamp(timestampInput.value);
});

timestampInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        addTimestamp(timestampInput.value);
    }
});

openTimestampsBtn.addEventListener('click', () => {
    timestampModal.classList.remove('hidden');
    timestampInput.focus();
});

closeTimestampsBtn.addEventListener('click', () => {
    timestampModal.classList.add('hidden');
});

// Handle page visibility changes (tab switching)
document.addEventListener('visibilitychange', () => {
    if (!isRunning) return; // Only handle if session is running

    if (document.hidden) {
        // Tab is hidden - pause timers but keep detection state
        clearInterval(timerInterval);
        timerInterval = null;
    } else {
        // Tab is visible again - resume timers
        if (!timerInterval) {
            timerInterval = setInterval(updateTimers, 1000);
        }
    }
});

// Auto-save on page unload
window.addEventListener('beforeunload', () => {
    if (isRunning || studyTime > 0 || breakTime > 0) {
        saveCurrentSession();
    }
});

// Initial Setup
(async function init() {
    overlayMessage.innerText = 'Loading AI models...';
    await setupDetector();

    // Try to restore previous session
    const restored = restoreSession();
    if (restored) {
        overlayMessage.innerText = 'Session Restored - Click Start to Resume';
        overlayMessage.style.color = 'var(--success)';
    } else {
        overlayMessage.innerText = 'Ready to Start';
    }
})();
