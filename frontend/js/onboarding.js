/**
 * SkillSprint Onboarding Module
 * Handles the post-signup 3-step matchmaking flow.
 */

const Onboarding = {
    currentStep: 1,
    data: {
        level: 'Beginner',
        topSkills: [],
        skillsToLearn: [],
        weeklyHours: '5–10hrs',
        collabStyle: 'Real-time',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        mainGoal: 'All of the above',
        projectRole: 'Contribute'
    },

    availableSkills: ["Python", "React", "Node", "SQL", "Java", "C++", "AWS", "Design", "DevOps", "Mongo", "TypeScript", "GO"],

    init() {
        console.log("[Onboarding] Initializing...");
        if (document.getElementById('onboardingOverlay')) return;
        this.renderModal();
    },

    renderModal() {
        const overlay = document.createElement('div');
        overlay.id = 'onboardingOverlay';
        overlay.className = 'onboarding-overlay';

        overlay.innerHTML = `
            <div class="onboarding-modal">
                <div class="onboarding-header">
                    <h2>Help us personalize your journey</h2>
                    <p>This helps us find your best matches, courses & projects.</p>
                </div>

                <div class="onboarding-progress-container">
                    <div class="onboarding-progress-bar">
                        <div id="onboardingFill" class="onboarding-progress-fill"></div>
                    </div>
                    <div class="onboarding-step-indicator">
                        <span>Step 1: Background</span>
                        <span>Step 2: Workflow</span>
                        <span>Step 3: Goals</span>
                    </div>
                </div>

                <div id="step1" class="onboarding-step active">
                    <div class="question-group">
                        <label>What's your current level?</label>
                        <div class="option-grid">
                            <button class="option-btn" onclick="Onboarding.select('level', 'Beginner', this)">Beginner</button>
                            <button class="option-btn selected" onclick="Onboarding.select('level', 'Intermediate', this)">Intermediate</button>
                            <button class="option-btn" onclick="Onboarding.select('level', 'Advanced', this)">Advanced</button>
                        </div>
                    </div>
                    <div class="question-group">
                        <label>Pick your top 3 skills</label>
                        <div class="tag-cloud" id="topSkillsCloud"></div>
                    </div>
                    <div class="question-group">
                        <label>Skills you want to learn</label>
                        <div class="tag-cloud" id="learnSkillsCloud"></div>
                    </div>
                </div>

                <div id="step2" class="onboarding-step">
                    <div class="question-group">
                        <label>Weekly time commitment?</label>
                        <div class="option-grid">
                            <button class="option-btn" onclick="Onboarding.select('weeklyHours', '< 5hrs', this)">&lt; 5hrs</button>
                            <button class="option-btn selected" onclick="Onboarding.select('weeklyHours', '5–10hrs', this)">5–10hrs</button>
                            <button class="option-btn" onclick="Onboarding.select('weeklyHours', '10+ hrs', this)">10+ hrs</button>
                        </div>
                    </div>
                    <div class="question-group">
                        <label>Collaboration Style?</label>
                        <div class="option-grid">
                            <button class="option-btn selected" onclick="Onboarding.select('collabStyle', 'Real-time', this)">Real-time</button>
                            <button class="option-btn" onclick="Onboarding.select('collabStyle', 'Async', this)">Async</button>
                        </div>
                    </div>
                    <div class="question-group">
                        <label>Your timezone</label>
                        <input type="text" class="form-input" value="${this.data.timezone}" onchange="Onboarding.data.timezone = this.value">
                    </div>
                </div>

                <div id="step3" class="onboarding-step">
                    <div class="question-group">
                        <label>What's your main goal?</label>
                        <select class="form-select" onchange="Onboarding.data.mainGoal = this.value">
                            <option>Find a study partner</option>
                            <option>Join a project</option>
                            <option>Take courses</option>
                            <option selected>All of the above</option>
                        </select>
                    </div>
                    <div class="question-group">
                        <label>Project Contribution?</label>
                        <div class="option-grid">
                            <button class="option-btn" onclick="Onboarding.select('projectRole', 'Lead', this)">Lead projects</button>
                            <button class="option-btn selected" onclick="Onboarding.select('projectRole', 'Contribute', this)">Contribute</button>
                        </div>
                    </div>
                </div>

                <div class="onboarding-footer">
                    <button class="btn-skip" onclick="Onboarding.nudgeSkip()">Skip this step</button>
                    <button class="btn-next" onclick="Onboarding.next()">Next <i class="fa-solid fa-arrow-right"></i></button>
                </div>

                <div id="skipNudge" class="skip-nudge">
                    <span>Skipping this may affect your match quality.</span>
                    <button class="btn-skip" style="color:var(--text-dark); text-decoration:underline" onclick="Onboarding.confirmSkip()">Skip anyway</button>
                    <button class="btn-next" style="padding: 6px 12px; font-size: 0.75rem;" onclick="Onboarding.hideNudge()">Go back</button>
                </div>

                <div id="rewardPopup" class="reward-popup">
                    <i class="fa-solid fa-trophy reward-icon"></i>
                    <h3>Welcome Aboard!</h3>
                    <p>+50 XP Earned</p>
                    <p><strong>Account Setup</strong> badge awarded!</p>
                    <button class="btn-next" style="margin: 1rem auto 0;" onclick="Onboarding.finish()">Enter Dashboard</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.renderSkillClouds();

        setTimeout(() => overlay.classList.add('active'), 10);
    },

    renderSkillClouds() {
        const topCloud = document.getElementById('topSkillsCloud');
        const learnCloud = document.getElementById('learnSkillsCloud');

        this.availableSkills.forEach(skill => {
            const tag1 = document.createElement('span');
            tag1.className = 'tag-item';
            tag1.textContent = skill;
            tag1.onclick = () => this.toggleSkill('topSkills', skill, tag1);
            topCloud.appendChild(tag1);

            const tag2 = document.createElement('span');
            tag2.className = 'tag-item';
            tag2.textContent = skill;
            tag2.onclick = () => this.toggleSkill('skillsToLearn', skill, tag2);
            learnCloud.appendChild(tag2);
        });
    },

    toggleSkill(type, skill, el) {
        if (this.data[type].includes(skill)) {
            this.data[type] = this.data[type].filter(s => s !== skill);
            el.classList.remove('selected');
        } else {
            if (this.data[type].length < 3) {
                this.data[type].push(skill);
                el.classList.add('selected');
            } else {
                if (window.showToast) window.showToast("Pick up to 3 skills", "info");
            }
        }
    },

    select(field, value, el) {
        this.data[field] = value;
        const parent = el.parentElement;
        parent.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
        el.classList.add('selected');
    },

    next() {
        if (this.currentStep < 3) {
            document.getElementById(`step${this.currentStep}`).classList.remove('active');
            this.currentStep++;
            document.getElementById(`step${this.currentStep}`).classList.add('active');

            const fill = document.getElementById('onboardingFill');
            fill.style.width = `${(this.currentStep / 3) * 100}%`;

            if (this.currentStep === 3) {
                document.querySelector('.btn-next').innerHTML = `Complete <i class="fa-solid fa-check"></i>`;
            }
        } else {
            this.submit();
        }
    },

    nudgeSkip() {
        document.getElementById('skipNudge').classList.add('active');
    },

    hideNudge() {
        document.getElementById('skipNudge').classList.remove('active');
    },

    confirmSkip() {
        this.hideNudge();
        if (this.currentStep < 3) {
            this.next();
        } else {
            this.submit();
        }
    },

    async submit() {
        console.log("[Onboarding] Submitting data...", this.data);
        const token = localStorage.getItem("token");
        const API_BASE = window.API_BASE_URL || "/api";

        try {
            const res = await fetch(`${API_BASE}/users/onboarding`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ matchmakingData: this.data })
            });

            if (res.ok) {
                const result = await res.json();
                console.log("[Onboarding] Success:", result);

                // Show Reward popup
                document.getElementById('rewardPopup').style.display = 'block';
                // Hide main steps
                document.querySelectorAll('.onboarding-step').forEach(s => s.style.display = 'none');
                document.querySelector('.onboarding-footer').style.display = 'none';
            } else {
                const err = await res.json();
                if (window.showToast) window.showToast(err.message || "Submission failed", "error");
            }
        } catch (error) {
            console.error("[Onboarding] API Error:", error);
        }
    },

    finish() {
        const overlay = document.getElementById('onboardingOverlay');
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 400);

        // Refresh dashboard data if needed
        if (window.loadDashboard) window.loadDashboard();
    }
};

window.Onboarding = Onboarding;
