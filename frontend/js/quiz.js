/**
 * Quiz & Certificates Module
 * SkillSprint Platform
 */

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'
    ? 'http://localhost:5000/api'
    : '/api';

// State
let currentQuiz = null;
let currentQuestionIndex = 0;
let timerInterval = null;
let secondsRemaining = 0;

// DOM Elements - initialized after DOM loads
let loadingOverlay, coursesView, quizView, resultsView, coursesGrid, certificateModal;

// Course icons
const courseIcons = {
    'html-css': 'fa-code',
    'javascript': 'fa-js',
    'git-github': 'fa-code-branch',
    'nodejs-express': 'fa-node-js',
    'mongodb': 'fa-database',
    'problem-solving': 'fa-brain'
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Suppress audio autoplay errors
    window.addEventListener('unhandledrejection', function (event) {
        if (event.reason && event.reason.name === 'AbortError') {
            event.preventDefault();
        }
    });

    // Initialize DOM elements
    loadingOverlay = document.getElementById('loadingOverlay');
    coursesView = document.getElementById('coursesView');
    quizView = document.getElementById('quizView');
    resultsView = document.getElementById('resultsView');
    coursesGrid = document.getElementById('coursesGrid');
    certificateModal = document.getElementById('certificateModal');

    checkAuth();
    loadCourses();
    setupEventListeners();
});

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
    }
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    };
}

function showLoading() {
    loadingOverlay.classList.add('active');
}

function hideLoading() {
    loadingOverlay.classList.remove('active');
}



// ============================================================
// COURSES VIEW
// ============================================================
async function loadCourses() {
    showLoading();
    try {
        // Check for active quiz first
        const activeRes = await fetch(`${API_BASE}/quiz/active`, {
            headers: getAuthHeaders()
        });
        const activeData = await activeRes.json();

        if (activeData.hasActiveQuiz) {
            // Resume active quiz
            currentQuiz = activeData;
            showQuizView();
            hideLoading();
            return;
        }

        // Load courses
        const res = await fetch(`${API_BASE}/quiz/courses`, {
            headers: getAuthHeaders()
        });
        const data = await res.json();

        renderCourses(data.courses);
    } catch (err) {
        console.error('Load courses error:', err);
        showToast('Failed to load courses', 'error');
    }
    hideLoading();
}

function renderCourses(courses) {
    coursesGrid.innerHTML = courses.map(course => `
    <div class="course-card" data-course="${course.id}">
      <div class="course-card-header">
        <div class="course-icon ${course.id}">
          <i class="fa-brands ${courseIcons[course.id]} fa-solid"></i>
        </div>
        <span class="course-name">${course.name}</span>
        ${course.hasCertificate ? '<span class="course-cert-badge"><i class="fa-solid fa-certificate"></i> Certified</span>' : ''}
      </div>
      <div class="level-indicators">
        ${renderLevelBadge('basic', course.levels.basic)}
        ${renderLevelBadge('intermediate', course.levels.intermediate)}
        ${renderLevelBadge('advanced', course.levels.advanced)}
      </div>
    </div>
  `).join('');

    // Add click handlers
    document.querySelectorAll('.course-card').forEach(card => {
        card.addEventListener('click', () => openCourseModal(card.dataset.course));
    });
}

function renderLevelBadge(level, status) {
    const icons = {
        basic: 'fa-seedling',
        intermediate: 'fa-fire',
        advanced: 'fa-rocket'
    };
    const labels = {
        basic: 'Basic',
        intermediate: 'Intermediate',
        advanced: 'Advanced'
    };

    let classes = `level-badge ${level}`;
    if (status.passed) classes += ' passed';
    if (!status.unlocked) classes += ' locked';

    let icon = icons[level];
    if (status.passed) icon = 'fa-check-circle';
    if (!status.unlocked) icon = 'fa-lock';

    return `
    <div class="${classes}" data-level="${level}">
      <i class="fa-solid ${icon}"></i> ${labels[level]}
      ${status.bestScore > 0 ? `<br><small>${Math.round(status.bestScore)}%</small>` : ''}
    </div>
  `;
}

async function openCourseModal(courseId) {
    // Find available level
    const res = await fetch(`${API_BASE}/quiz/courses`, {
        headers: getAuthHeaders()
    });
    const data = await res.json();
    const course = data.courses.find(c => c.id === courseId);

    if (!course) return;

    // Find first unlocked, not-passed level
    let targetLevel = null;
    for (const level of ['basic', 'intermediate', 'advanced']) {
        if (course.levels[level].unlocked && !course.levels[level].passed) {
            targetLevel = level;
            break;
        }
    }

    // If all passed, allow retaking advanced
    if (!targetLevel && course.levels.advanced.unlocked) {
        targetLevel = 'advanced';
    }

    if (!targetLevel) {
        targetLevel = 'basic';
    }

    // Check attempts
    const attemptsRes = await fetch(`${API_BASE}/quiz/attempts/today?course=${courseId}&level=${targetLevel}`, {
        headers: getAuthHeaders()
    });
    const attemptsData = await attemptsRes.json();

    if (attemptsData.attemptsRemaining <= 0) {
        showToast(`No attempts remaining today. Try again tomorrow!`, 'warning');
        return;
    }

    // Start quiz with confirmation
    const levelLabel = targetLevel.charAt(0).toUpperCase() + targetLevel.slice(1);
    const msg = `Start ${course.name} - ${levelLabel} Quiz?\n\nAttempts remaining today: ${attemptsData.attemptsRemaining}`;

    // Check if confirm is overridden (takes callbacks) or native
    if (window.confirm.length >= 2 || window.confirm.toString().includes('onConfirm')) {
        // Overridden confirm with callbacks
        confirm(msg, async () => {
            try {
                await startQuiz(courseId, targetLevel);
            } catch (err) {
                console.error('[QUIZ] Error in startQuiz:', err);
                hideLoading();
            }
        });
    } else {
        // Native confirm or synchronous override
        if (confirm(msg)) {
            try {
                await startQuiz(courseId, targetLevel);
            } catch (err) {
                console.error('[QUIZ] Error in startQuiz:', err);
                hideLoading();
            }
        }
    }
}

// ============================================================
// QUIZ VIEW
// ============================================================
async function startQuiz(course, level) {
    showLoading();
    try {
        const res = await fetch(`${API_BASE}/quiz/start`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ course, level })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message);
        }

        currentQuiz = await res.json();
        currentQuestionIndex = 0;
        showQuizView();
    } catch (err) {
        console.error('Start quiz error:', err);
        showToast(err.message || 'Failed to start quiz', 'error');
    }
    hideLoading();
}

function showQuizView() {
    coursesView.style.display = 'none';
    resultsView.classList.remove('active');
    quizView.classList.add('active');

    // Update header
    document.getElementById('quizCourseBadge').textContent = formatCourseName(currentQuiz.course);
    const levelBadge = document.getElementById('quizLevelBadge');
    levelBadge.textContent = currentQuiz.level.charAt(0).toUpperCase() + currentQuiz.level.slice(1);
    levelBadge.className = `quiz-level-badge ${currentQuiz.level}`;

    // Start timer
    const expiresAt = new Date(currentQuiz.expiresAt);
    secondsRemaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    startTimer();

    // Render questions dots
    renderQuestionDots();
    renderQuestion();
}

function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        secondsRemaining--;
        updateTimerDisplay();

        if (secondsRemaining <= 0) {
            clearInterval(timerInterval);
            showToast('Time is up! Submitting quiz...', 'warning');
            submitQuiz();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const timerEl = document.getElementById('quizTimer');
    document.getElementById('timerDisplay').textContent = display;

    timerEl.classList.remove('warning', 'danger');
    if (secondsRemaining < 60) {
        timerEl.classList.add('danger');
    } else if (secondsRemaining < 180) {
        timerEl.classList.add('warning');
    }
}

function renderQuestionDots() {
    const dots = document.getElementById('questionDots');
    dots.innerHTML = currentQuiz.questions.map((_, i) => {
        const answered = currentQuiz.userAnswers[i] !== -1;
        const current = i === currentQuestionIndex;
        let classes = 'q-dot';
        if (current) classes += ' current';
        if (answered) classes += ' answered';
        return `<div class="${classes}" data-index="${i}">${i + 1}</div>`;
    }).join('');

    // Click to jump
    dots.querySelectorAll('.q-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            currentQuestionIndex = parseInt(dot.dataset.index);
            renderQuestion();
            renderQuestionDots();
        });
    });
}

function renderQuestion() {
    const q = currentQuiz.questions[currentQuestionIndex];

    document.getElementById('questionNumber').textContent =
        `Question ${currentQuestionIndex + 1} of ${currentQuiz.questions.length}`;
    document.getElementById('questionTopic').textContent = q.topic || 'General';
    document.getElementById('questionText').textContent = q.question;

    const codeSnippet = document.getElementById('codeSnippet');
    if (q.codeSnippet) {
        codeSnippet.textContent = q.codeSnippet;
        codeSnippet.style.display = 'block';
    } else {
        codeSnippet.style.display = 'none';
    }

    // Render options
    const optionsList = document.getElementById('optionsList');
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

    // Handle missing or empty options
    if (!q.options || q.options.length === 0) {
        console.warn('[QUIZ] Question has no options:', q);
        optionsList.innerHTML = '<div class="option-item" style="color: var(--warning);">No options available for this question</div>';
    } else {
        optionsList.innerHTML = q.options.map((opt, i) => {
            const selected = currentQuiz.userAnswers[currentQuestionIndex] === i;
            const optText = typeof opt === 'string' ? opt : (opt?.text || 'Option ' + letters[i]);
            return `
          <div class="option-item ${selected ? 'selected' : ''}" data-index="${i}">
            <div class="option-letter">${letters[i]}</div>
            <div class="option-text">${optText}</div>
          </div>
        `;
        }).join('');
    }

    // Option click handlers
    optionsList.querySelectorAll('.option-item').forEach(item => {
        item.addEventListener('click', () => selectOption(parseInt(item.dataset.index)));
    });

    // Update nav buttons
    document.getElementById('prevBtn').disabled = currentQuestionIndex === 0;

    const isLast = currentQuestionIndex === currentQuiz.questions.length - 1;
    document.getElementById('nextBtn').style.display = isLast ? 'none' : 'flex';
    document.getElementById('submitBtn').style.display = isLast ? 'flex' : 'none';
}

function selectOption(index) {
    currentQuiz.userAnswers[currentQuestionIndex] = index;
    renderQuestion();
    renderQuestionDots();
    saveAnswers();
}

async function saveAnswers() {
    try {
        await fetch(`${API_BASE}/quiz/save`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                quizId: currentQuiz.quizId,
                answers: currentQuiz.userAnswers
            })
        });
    } catch (err) {
        console.error('Save answers error:', err);
    }
}

async function submitQuiz() {
    if (timerInterval) clearInterval(timerInterval);
    showLoading();

    try {
        const res = await fetch(`${API_BASE}/quiz/submit`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                quizId: currentQuiz.quizId,
                answers: currentQuiz.userAnswers
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message);
        }

        const results = await res.json();
        showResults(results);
    } catch (err) {
        console.error('Submit error:', err);
        showToast(err.message || 'Failed to submit quiz', 'error');
    }
    hideLoading();
}

// ============================================================
// RESULTS VIEW
// ============================================================
function showResults(results) {
    quizView.classList.remove('active');
    resultsView.classList.add('active');

    const resultsIcon = document.getElementById('resultsIcon');
    const resultsTitle = document.getElementById('resultsTitle');
    const resultsMessage = document.getElementById('resultsMessage');

    if (results.passed) {
        resultsIcon.innerHTML = '<i class="fa-solid fa-trophy"></i>';
        resultsIcon.className = 'results-icon passed';
        resultsTitle.textContent = 'Congratulations!';
        resultsMessage.textContent = `You've passed the ${currentQuiz.level} level!`;
    } else {
        resultsIcon.innerHTML = '<i class="fa-solid fa-times-circle"></i>';
        resultsIcon.className = 'results-icon failed';
        resultsTitle.textContent = 'Keep Practicing!';
        resultsMessage.textContent = `You need 70% to pass. Don't give up!`;
    }

    document.getElementById('resultsScore').textContent = `${Math.round(results.score)}%`;
    document.getElementById('correctCount').textContent = results.correctCount;
    document.getElementById('wrongCount').textContent = results.wrongCount;
    document.getElementById('unansweredCount').textContent = results.unanswered || 0;

    // Topic performance
    renderTopicPerformance(results.topicPerformance);

    // Buttons
    const nextLevelBtn = document.getElementById('nextLevelBtn');
    if (results.passed && currentQuiz.level !== 'advanced') {
        nextLevelBtn.style.display = 'flex';
        nextLevelBtn.dataset.course = currentQuiz.course;
        nextLevelBtn.dataset.level = getNextLevel(currentQuiz.level);
    } else {
        nextLevelBtn.style.display = 'none';
    }

    // Certificate awarded?
    if (results.certificateAwarded && results.certificateAwarded.awarded) {
        showCertificateModal(results.certificateAwarded);
    }
}

function renderTopicPerformance(topicPerformance) {
    const container = document.getElementById('topicList');

    if (!topicPerformance || Object.keys(topicPerformance).length === 0) {
        container.innerHTML = '<p style="color: var(--muted);">No topic data available</p>';
        return;
    }

    container.innerHTML = Object.entries(topicPerformance).map(([topic, stats]) => {
        const percentage = Math.round((stats.correct / stats.total) * 100);
        let barClass = 'strong';
        if (percentage < 80) barClass = 'medium';
        if (percentage < 50) barClass = 'weak';

        return `
      <div class="topic-item">
        <span class="topic-name">${topic}</span>
        <div class="topic-bar">
          <div class="topic-bar-fill ${barClass}" style="width: ${percentage}%"></div>
        </div>
        <span class="topic-score">${stats.correct}/${stats.total}</span>
      </div>
    `;
    }).join('');
}

function getNextLevel(current) {
    const levels = ['basic', 'intermediate', 'advanced'];
    const idx = levels.indexOf(current);
    return levels[idx + 1] || 'advanced';
}

function showCertificateModal(cert) {
    document.getElementById('certCourseName').textContent = formatCourseName(currentQuiz.course);
    document.getElementById('certVerificationCode').textContent = cert.verificationId;
    certificateModal.classList.add('active');
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
    document.getElementById('prevBtn').addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderQuestion();
            renderQuestionDots();
        }
    });

    document.getElementById('nextBtn').addEventListener('click', () => {
        if (currentQuestionIndex < currentQuiz.questions.length - 1) {
            currentQuestionIndex++;
            renderQuestion();
            renderQuestionDots();
        }
    });

    document.getElementById('submitBtn').addEventListener('click', () => {
        const unanswered = currentQuiz.userAnswers.filter(a => a === -1).length;
        if (unanswered > 0) {
            const confirmed = confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`);
            if (!confirmed) return;
        }
        submitQuiz();
    });

    document.getElementById('retryBtn').addEventListener('click', () => {
        resultsView.classList.remove('active');
        coursesView.style.display = 'block';
        loadCourses();
    });

    document.getElementById('nextLevelBtn').addEventListener('click', () => {
        const course = document.getElementById('nextLevelBtn').dataset.course;
        const level = document.getElementById('nextLevelBtn').dataset.level;
        resultsView.classList.remove('active');
        startQuiz(course, level);
    });

    document.getElementById('backToCoursesBtn').addEventListener('click', () => {
        resultsView.classList.remove('active');
        coursesView.style.display = 'block';
        loadCourses();
    });

    document.getElementById('copyCertBtn').addEventListener('click', () => {
        const code = document.getElementById('certVerificationCode').textContent;
        const url = `${window.location.origin}/api/certificates/verify/${code}`;
        navigator.clipboard.writeText(url).then(() => {
            showToast('Verification link copied!', 'success');
        });
    });

    document.getElementById('closeCertBtn').addEventListener('click', () => {
        certificateModal.classList.remove('active');
    });
}

// ============================================================
// HELPERS
// ============================================================
function formatCourseName(course) {
    const names = {
        'html-css': 'HTML & CSS',
        'javascript': 'JavaScript',
        'git-github': 'Git & GitHub',
        'nodejs-express': 'Node.js & Express',
        'mongodb': 'MongoDB',
        'problem-solving': 'Problem Solving'
    };
    return names[course] || course;
}
// ============================================================
// SEARCH FILTERING
// ============================================================
window.handleCourseSearch = function (term) {
    const query = (term || "").toLowerCase().trim();
    const cards = document.querySelectorAll('.course-card');

    cards.forEach(card => {
        const name = card.querySelector('.course-name').textContent.toLowerCase();
        if (name.includes(query)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });

    // Handle empty results if needed
    const visibleCards = Array.from(cards).filter(c => c.style.display !== 'none');
    const emptyMsg = document.getElementById('searchEmptyMsg');

    if (visibleCards.length === 0 && query !== "") {
        if (!emptyMsg) {
            const msg = document.createElement('div');
            msg.id = 'searchEmptyMsg';
            msg.style.cssText = 'grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);';
            msg.innerHTML = '<i class="fa-solid fa-graduation-cap" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem; display: block;"></i> No courses found matching your search.';
            coursesGrid.appendChild(msg);
        }
    } else if (emptyMsg) {
        emptyMsg.remove();
    }
};
