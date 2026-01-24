document.addEventListener('DOMContentLoaded', () => {
    const splash = document.getElementById('splash');
    const landingPage = document.getElementById('landing-page');
    const bars = document.querySelectorAll('.bar');
    const scrollProgress = document.querySelector('.scroll-progress');
    const nav = document.querySelector('nav');
    const floatingCta = document.querySelector('.floating-cta');

    // Splash Screen
    const splashLogo = document.querySelector('.splash-logo');
    if (splashLogo) {
        splashLogo.style.animation = 'gradientShift 1.2s ease-in-out';
    }

    setTimeout(() => {
        if (splash) splash.classList.add('hidden');
        if (landingPage) landingPage.classList.add('visible');
        animateMomentum();
        initCounters();
    }, 1200);

    // Momentum Graph Animation
    function animateMomentum() {
        bars.forEach((bar, index) => {
            setTimeout(() => {
                const randomHeight = Math.floor(Math.random() * 80) + 20;
                bar.style.height = `${randomHeight}%`;
                bar.style.transform = `scaleY(1)`;
            }, index * 100);
        });
    }

    const momentumCard = document.querySelector('.bento-item.row-2');
    if (momentumCard) {
        momentumCard.addEventListener('mouseenter', animateMomentum);
    }

    // Staggered Bento Grid Reveal
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, index * 100);
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.bento-item').forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(20px)';
        item.style.transition = 'all 0.6s cubic-bezier(0.2, 0, 0.2, 1)';
        observer.observe(item);
    });

    // Magnetic Button Effect
    const magneticButtons = document.querySelectorAll('.btn-workspace');

    magneticButtons.forEach(button => {
        button.addEventListener('mousemove', (e) => {
            const rect = button.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            button.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px) translateY(-2px)`;
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translate(0, 0)';
        });
    });

    // Parallax Scroll Effect
    const bgElements = document.querySelectorAll('.bg-element');
    let ticking = false;

    function updateParallax() {
        const scrolled = window.pageYOffset;

        bgElements.forEach((element, index) => {
            const speed = index % 2 === 0 ? 0.3 : -0.2;
            element.style.transform = `translateY(${scrolled * speed}px)`;
        });

        const meshGlow = document.querySelector('.mesh-glow');
        if (meshGlow) {
            meshGlow.style.transform = `translate(-50%, -50%) translateY(${scrolled * 0.5}px)`;
        }

        ticking = false;
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(updateParallax);
            ticking = true;
        }
    });

    // Animated Number Counters
    function initCounters() {
        const counters = document.querySelectorAll('[data-counter]');

        counters.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-counter'));
            const duration = 2000;
            const increment = target / (duration / 16);
            let current = 0;

            const updateCounter = () => {
                current += increment;
                if (current < target) {
                    counter.textContent = Math.floor(current).toLocaleString();
                    requestAnimationFrame(updateCounter);
                } else {
                    counter.textContent = target.toLocaleString();
                }
            };

            updateCounter();
        });
    }

    // Tag Micro-interactions
    const tags = document.querySelectorAll('.tag');

    tags.forEach(tag => {
        tag.addEventListener('mouseenter', () => {
            tag.style.transform = 'scale(1.05) rotate(-1deg)';
            tag.style.borderColor = 'var(--lp-accent)';
        });

        tag.addEventListener('mouseleave', () => {
            tag.style.transform = 'scale(1) rotate(0deg)';
            tag.style.borderColor = 'var(--lp-border)';
        });
    });

    // Smooth Scroll for Nav Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const href = anchor.getAttribute('href');
            if (href.startsWith('#')) {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });

    // Card Tilt Effect on Hover
    const bentoItems = document.querySelectorAll('.bento-item');

    bentoItems.forEach(item => {
        item.addEventListener('mousemove', (e) => {
            const rect = item.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = (y - centerY) / 20;
            const rotateY = (centerX - x) / 20;

            item.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
        });

        item.addEventListener('mouseleave', () => {
            item.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
        });
    });

    // Scroll Logic (Progress, Nav, CTA)
    window.addEventListener('scroll', () => {
        const scrollContainer = document.documentElement;
        const windowHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        if (windowHeight > 0) {
            const scrolled = (window.pageYOffset / windowHeight) * 100;
            if (scrollProgress) scrollProgress.style.width = scrolled + '%';
        }

        // Navbar background on scroll
        if (window.pageYOffset > 100) {
            if (nav) nav.classList.add('scrolled');
        } else {
            if (nav) nav.classList.remove('scrolled');
        }

        // Floating CTA visibility
        if (window.pageYOffset > 600) {
            if (floatingCta) floatingCta.classList.add('visible');
        } else {
            if (floatingCta) floatingCta.classList.remove('visible');
        }
    });

    // Add ripple effect to buttons
    const rippleButtons = document.querySelectorAll('.btn-workspace, .social-link');
    rippleButtons.forEach(button => {
        button.addEventListener('click', function (e) {
            const ripple = document.createElement('span');
            ripple.classList.add('ripple-effect');

            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;

            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';

            this.appendChild(ripple);

            setTimeout(() => ripple.remove(), 600);
        });
    });
});
