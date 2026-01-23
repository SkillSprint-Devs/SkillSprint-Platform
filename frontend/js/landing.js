document.addEventListener('DOMContentLoaded', () => {
    const splash = document.getElementById('splash');
    const landingPage = document.getElementById('landing-page');
    const bars = document.querySelectorAll('.bar');

    // Splash Screen logic
    // Duration set to 1.2s as per risk mitigation
    setTimeout(() => {
        splash.classList.add('hidden');
        landingPage.classList.add('visible');
        animateMomentum();
    }, 1200);

    // Realistic stats/Action tags logic could go here
    // For now, let's just make the momentum graph feel "alive"
    function animateMomentum() {
        bars.forEach(bar => {
            const randomHeight = Math.floor(Math.random() * 80) + 20;
            bar.style.height = `${randomHeight}%`;
        });
    }

    // Refresh momentum on hover
    document.querySelector('.bento-item.row-2')?.addEventListener('mouseenter', animateMomentum);

    // Optional: Intersection Observer for Bento animations
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
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
});
