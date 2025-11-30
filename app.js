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

// Constants
const BREAK_THRESHOLD = 2000; // ms to wait before switching to break mode (prevents flickering)

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
        description: description.trim()
    };

    const history = getHistory();
    history.unshift(session); // Add to beginning
    localStorage.setItem('focus_history', JSON.stringify(history));
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
        `;
    }).join('');
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

// Initial Setup
(async function init() {
    overlayMessage.innerText = 'Loading AI models...';
    await setupDetector();
    overlayMessage.innerText = 'Ready to Start';
})();
