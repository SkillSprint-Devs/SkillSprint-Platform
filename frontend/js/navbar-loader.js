/**
 * SkillSprint Standardized Navbar Loader
 * Injects the dark-themed navbar across multiple screens.
 */

function initNavbar(config = {}) {
    const defaultOptions = {
        activePage: 'Library',
        showSearch: true,
        searchPlaceholder: 'Search resources, recordings, courses...',
        primaryAction: {
            show: true,
            label: 'Upload',
            icon: 'fa-cloud-arrow-up',
            id: 'navbarPrimaryAction',
            onClick: null
        }
    };

    const options = {
        ...defaultOptions,
        ...config,
        primaryAction: { ...defaultOptions.primaryAction, ...(config.primaryAction || {}) }
    };

    const navbarHtml = `
<nav class="navbar" id="standardNavbar">
    <div class="navbar-container">
        <div class="navbar-top">
            <div class="nav-left">
                <a href="dashboard.html" class="brand">
                    <div class="brand-logo"><i class="fa-solid fa-arrow-left-long"></i></div>
                    <span class="brand-name">SkillSprint</span>
                </a>
                <div class="page-indicator">
                    <span class="status-dot"></span>
                    <span id="pageIndicatorLabel">${options.activePage}</span>
                </div>
            </div>
            <div class="nav-center" style="${options.showSearch ? '' : 'display: none;'}">
                <div class="ss-search-bar">
                    <i class="fa-solid fa-magnifying-glass search-icon"></i>
                    <input type="text" class="ss-search-input" placeholder="${options.searchPlaceholder}" id="navbarSearchInput">
                </div>
            </div>
            <div class="nav-right">
                <button class="icon-btn" title="Notifications">
                    <i class="fa-solid fa-bell"></i>
                    <span class="notification-badge" id="navbarNotifBadge" style="display:none;">0</span>
                </button>
                <button class="icon-btn" title="Settings" onclick="location.href='settings.html'">
                    <i class="fa-solid fa-gear"></i>
                </button>
                ${options.primaryAction.show ? `
                    <button class="primary-btn" id="${options.primaryAction.id}">
                        <i class="fa-solid ${options.primaryAction.icon}"></i>
                        <span>${options.primaryAction.label}</span>
                    </button>
                ` : ''}
                <button class="mobile-menu-btn">
                    <i class="fa-solid fa-bars"></i>
                </button>
            </div>
        </div>
    </div>
</nav>`;

    // Inject into the body or a specific placeholder
    const placeholder = document.getElementById('navbar-placeholder');
    if (placeholder) {
        placeholder.innerHTML = navbarHtml;
    } else {
        document.body.insertAdjacentHTML('afterbegin', navbarHtml);
    }

    // Attach Interactions
    const navbar = document.getElementById('standardNavbar');

    // Scroll Effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 40) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Primary Action Click
    if (options.primaryAction.show && options.primaryAction.onClick) {
        const actionBtn = document.getElementById(options.primaryAction.id);
        if (actionBtn) {
            actionBtn.addEventListener('click', options.primaryAction.onClick);
        }
    }

    // Search Logic (If id match or manual attach)
    const searchInput = document.getElementById('navbarSearchInput');
    if (searchInput && options.search && options.search.onInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                options.search.onInput(e.target.value);
            }, 300);
        });
    }

    // Keyboard shortcut (Alt + S for Search focus)
    document.addEventListener('keydown', (e) => {
        if ((e.altKey) && e.key === 's' && searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
    });

    console.log(`[Navbar] Injected with context: ${options.activePage}`);
}

// Global expose
window.initNavbar = initNavbar;
