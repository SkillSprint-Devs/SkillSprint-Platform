/**
 * SkillSprint Onboarding Module - Carousel Refined
 */

const Onboarding = {
    currentStep: 1,
    totalSteps: 8,
    data: {
        level: 'Intermediate',
        topSkills: [],
        skillsToLearn: [],
        weeklyHours: '5–10hrs',
        collabStyle: 'Real-time',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        mainGoal: 'All',
        projectRole: 'Contribute'
    },

    availableSkills: ["Python", "React", "Node", "SQL", "Java", "C++", "AWS", "UI Design", "DevOps", "MongoDB", "TypeScript", "GO", "Figma", "Docker", "Cybersecurity"],

    init() {
        console.log("[Onboarding] Starting carousel flow...");
        this.renderSkillClouds();
        this.updateUI();

        const timezoneInput = document.getElementById('timezoneInput');
        if (timezoneInput) {
            timezoneInput.value = this.data.timezone;
            timezoneInput.addEventListener('change', (e) => this.data.timezone = e.target.value);
        }
    },

    renderSkillClouds() {
        const topCloud = document.getElementById('topSkillsCloud');
        const learnCloud = document.getElementById('learnSkillsCloud');
        if (!topCloud || !learnCloud) return;

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
                // Auto-advance if 3 skills selected (optional UX)
                // if (this.data[type].length === 3) setTimeout(() => this.next(), 300);
            } else {
                if (window.showToast) window.showToast("Pick up to 3 skills", "info");
            }
        }
    },

    select(field, value, el) {
        this.data[field] = value;
        const parent = el.parentElement;
        parent.querySelectorAll('.option-btn, .goal-item').forEach(btn => btn.classList.remove('selected'));
        el.classList.add('selected');

        // Auto-advance on selection
        setTimeout(() => this.next(), 300);
    },

    next() {
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateUI();
        } else {
            this.submit();
        }
    },

    prev() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateUI();
        }
    },

    updateUI() {
        const track = document.getElementById('carouselTrack');
        const fill = document.getElementById('globalProgressBar');
        const stepNum = document.getElementById('currentStepNum');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');

        // Move track
        const offset = -(this.currentStep - 1) * 100;
        track.style.transform = `translateX(${offset}%)`;

        // Update cards visual state
        document.querySelectorAll('.question-card').forEach((card, idx) => {
            if (idx + 1 === this.currentStep) card.classList.add('active');
            else card.classList.remove('active');
        });

        // Update progress
        fill.style.width = `${(this.currentStep / this.totalSteps) * 100}%`;
        stepNum.textContent = this.currentStep;

        // Update buttons
        prevBtn.disabled = this.currentStep === 1;
        if (this.currentStep === this.totalSteps) {
            nextBtn.innerHTML = `Finish <i class="fa-solid fa-check"></i>`;
        } else {
            nextBtn.innerHTML = `Next <i class="fa-solid fa-arrow-right"></i>`;
        }
    },

    nudgeSkip() {
        document.getElementById('skipNudge').style.display = 'flex';
    },

    hideNudge() {
        document.getElementById('skipNudge').style.display = 'none';
    },

    confirmSkip() {
        this.hideNudge();
        this.next();
    },

    async submit() {
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
                document.getElementById('rewardOverlay').style.display = 'flex';
            } else {
                const err = await res.json();
                if (window.showToast) window.showToast(err.message || "Submission failed", "error");
            }
        } catch (error) {
            console.error("[Onboarding] API Error:", error);
        }
    },

    finish() {
        window.location.href = "dashboard.html";
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => Onboarding.init());
