/* ==================== THEME SWITCHER ==================== */
/*
 * Interactive theme switching system
 * Allows users to preview and select from 6 different UI themes
 */

const ThemeSwitcher = {
    themes: [
        {
            id: 'original',
            name: 'Classic Professional',
            description: 'Traditional navy & green with serif headers',
            colors: ['#1a365d', '#2f5233', '#c9a227'],
            file: 'styles.css'
        },
        {
            id: 'glassmorphism',
            name: 'Glassmorphism',
            description: 'Frosted glass with vibrant gradients',
            colors: ['#667eea', '#f093fb', '#4facfe'],
            file: 'themes/theme-glassmorphism.css'
        },
        {
            id: 'dark-minimal',
            name: 'Dark Minimal',
            description: 'Ultra-clean dark mode with neon accents',
            colors: ['#000000', '#00ff88', '#ff0080'],
            file: 'themes/theme-dark-minimal.css'
        },
        {
            id: 'neubrutalism',
            name: 'Neubrutalism',
            description: 'Bold, playful design with thick borders',
            colors: ['#FFE500', '#FF6B9D', '#00D4FF'],
            file: 'themes/theme-neubrutalism.css'
        },
        {
            id: 'gradient-wave',
            name: 'Gradient Wave',
            description: 'Modern SaaS style with flowing gradients',
            colors: ['#6366f1', '#8b5cf6', '#d946ef'],
            file: 'themes/theme-gradient-wave.css'
        },
        {
            id: 'neumorphic',
            name: 'Neumorphic',
            description: 'Soft UI with subtle 3D shadows',
            colors: ['#e8ecf4', '#6c5ce7', '#00b894'],
            file: 'themes/theme-neumorphic.css'
        }
    ],

    currentTheme: 'original',
    isOpen: false,

    init() {
        this.createSwitcherUI();
        this.loadSavedTheme();
        this.bindEvents();
    },

    createSwitcherUI() {
        // Create floating theme button
        const button = document.createElement('button');
        button.id = 'theme-switcher-btn';
        button.innerHTML = '🎨';
        button.setAttribute('aria-label', 'Open theme selector');
        button.setAttribute('title', 'Change UI Theme');
        document.body.appendChild(button);

        // Create theme panel
        const panel = document.createElement('div');
        panel.id = 'theme-panel';
        panel.innerHTML = `
            <div class="theme-panel-header">
                <h3>🎨 Choose Your Theme</h3>
                <p>Select a UI style that suits your preference</p>
                <button class="theme-panel-close" aria-label="Close theme panel">&times;</button>
            </div>
            <div class="theme-grid">
                ${this.themes.map(theme => `
                    <button class="theme-card ${theme.id === this.currentTheme ? 'active' : ''}"
                            data-theme="${theme.id}"
                            aria-pressed="${theme.id === this.currentTheme}">
                        <div class="theme-preview">
                            ${theme.colors.map(color => `
                                <span class="theme-color" style="background: ${color}"></span>
                            `).join('')}
                        </div>
                        <div class="theme-info">
                            <span class="theme-name">${theme.name}</span>
                            <span class="theme-desc">${theme.description}</span>
                        </div>
                        ${theme.id === this.currentTheme ? '<span class="theme-active-badge">Active</span>' : ''}
                    </button>
                `).join('')}
            </div>
            <div class="theme-panel-footer">
                <p>Theme preference is saved automatically</p>
            </div>
        `;
        document.body.appendChild(panel);

        // Add switcher styles
        this.addStyles();
    },

    addStyles() {
        const style = document.createElement('style');
        style.id = 'theme-switcher-styles';
        style.textContent = `
            #theme-switcher-btn {
                position: fixed;
                bottom: 100px;
                right: 24px;
                width: 56px;
                height: 56px;
                border-radius: 50%;
                border: none;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                font-size: 24px;
                cursor: pointer;
                box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
                z-index: 9999;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            #theme-switcher-btn:hover {
                transform: scale(1.1) rotate(15deg);
                box-shadow: 0 6px 30px rgba(102, 126, 234, 0.6);
            }

            #theme-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.9);
                width: 90%;
                max-width: 600px;
                max-height: 90vh;
                background: #ffffff;
                border-radius: 24px;
                box-shadow: 0 25px 80px rgba(0, 0, 0, 0.2);
                z-index: 10000;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                overflow: hidden;
            }

            #theme-panel.open {
                opacity: 1;
                visibility: visible;
                transform: translate(-50%, -50%) scale(1);
            }

            .theme-panel-header {
                padding: 24px;
                border-bottom: 1px solid #e5e7eb;
                position: relative;
            }

            .theme-panel-header h3 {
                margin: 0 0 8px 0;
                font-size: 20px;
                font-weight: 700;
                color: #1f2937;
            }

            .theme-panel-header p {
                margin: 0;
                color: #6b7280;
                font-size: 14px;
            }

            .theme-panel-close {
                position: absolute;
                top: 16px;
                right: 16px;
                width: 36px;
                height: 36px;
                border: none;
                background: #f3f4f6;
                border-radius: 50%;
                font-size: 24px;
                cursor: pointer;
                color: #6b7280;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }

            .theme-panel-close:hover {
                background: #e5e7eb;
                color: #1f2937;
            }

            .theme-grid {
                padding: 16px;
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
                max-height: 60vh;
                overflow-y: auto;
            }

            @media (max-width: 500px) {
                .theme-grid {
                    grid-template-columns: 1fr;
                }
            }

            .theme-card {
                padding: 16px;
                border: 2px solid #e5e7eb;
                border-radius: 16px;
                background: #ffffff;
                cursor: pointer;
                text-align: left;
                transition: all 0.2s;
                position: relative;
            }

            .theme-card:hover {
                border-color: #667eea;
                background: #f8fafc;
                transform: translateY(-2px);
            }

            .theme-card.active {
                border-color: #667eea;
                background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
            }

            .theme-preview {
                display: flex;
                gap: 6px;
                margin-bottom: 12px;
            }

            .theme-color {
                width: 32px;
                height: 32px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            }

            .theme-info {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .theme-name {
                font-weight: 600;
                font-size: 14px;
                color: #1f2937;
            }

            .theme-desc {
                font-size: 12px;
                color: #6b7280;
            }

            .theme-active-badge {
                position: absolute;
                top: 8px;
                right: 8px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                font-size: 10px;
                font-weight: 600;
                padding: 4px 8px;
                border-radius: 20px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .theme-panel-footer {
                padding: 16px 24px;
                border-top: 1px solid #e5e7eb;
                text-align: center;
            }

            .theme-panel-footer p {
                margin: 0;
                font-size: 12px;
                color: #9ca3af;
            }

            #theme-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 9998;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s;
            }

            #theme-overlay.open {
                opacity: 1;
                visibility: visible;
            }

            @media (max-width: 768px) {
                #theme-switcher-btn {
                    bottom: 140px;
                    right: 16px;
                    width: 48px;
                    height: 48px;
                    font-size: 20px;
                }
            }
        `;
        document.head.appendChild(style);

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'theme-overlay';
        document.body.appendChild(overlay);
    },

    bindEvents() {
        const btn = document.getElementById('theme-switcher-btn');
        const panel = document.getElementById('theme-panel');
        const overlay = document.getElementById('theme-overlay');
        const closeBtn = panel.querySelector('.theme-panel-close');

        btn.addEventListener('click', () => this.togglePanel());
        overlay.addEventListener('click', () => this.closePanel());
        closeBtn.addEventListener('click', () => this.closePanel());

        panel.querySelectorAll('.theme-card').forEach(card => {
            card.addEventListener('click', () => {
                const themeId = card.dataset.theme;
                this.applyTheme(themeId);
            });
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closePanel();
            }
        });
    },

    togglePanel() {
        this.isOpen = !this.isOpen;
        document.getElementById('theme-panel').classList.toggle('open', this.isOpen);
        document.getElementById('theme-overlay').classList.toggle('open', this.isOpen);
    },

    closePanel() {
        this.isOpen = false;
        document.getElementById('theme-panel').classList.remove('open');
        document.getElementById('theme-overlay').classList.remove('open');
    },

    applyTheme(themeId) {
        const theme = this.themes.find(t => t.id === themeId);
        if (!theme) return;

        // Update stylesheet link
        let styleLink = document.getElementById('theme-stylesheet');
        if (!styleLink) {
            styleLink = document.createElement('link');
            styleLink.id = 'theme-stylesheet';
            styleLink.rel = 'stylesheet';
            document.head.appendChild(styleLink);
        }

        // Remove old original stylesheet if switching away from it
        const originalStyle = document.querySelector('link[href="styles.css"]');

        if (themeId === 'original') {
            if (originalStyle) {
                originalStyle.disabled = false;
            }
            styleLink.href = '';
        } else {
            if (originalStyle) {
                originalStyle.disabled = true;
            }
            styleLink.href = theme.file;
        }

        // Update UI
        this.currentTheme = themeId;
        this.updateActiveState();
        this.saveTheme(themeId);

        // Show notification
        if (typeof Notify !== 'undefined') {
            Notify.success(`Theme changed to ${theme.name}`);
        }
    },

    updateActiveState() {
        const cards = document.querySelectorAll('.theme-card');
        cards.forEach(card => {
            const isActive = card.dataset.theme === this.currentTheme;
            card.classList.toggle('active', isActive);
            card.setAttribute('aria-pressed', isActive);

            // Update badge
            const existingBadge = card.querySelector('.theme-active-badge');
            if (isActive && !existingBadge) {
                const badge = document.createElement('span');
                badge.className = 'theme-active-badge';
                badge.textContent = 'Active';
                card.appendChild(badge);
            } else if (!isActive && existingBadge) {
                existingBadge.remove();
            }
        });
    },

    saveTheme(themeId) {
        try {
            localStorage.setItem('financeTracker_theme', themeId);
        } catch (e) {
            console.warn('Could not save theme preference:', e);
        }
    },

    loadSavedTheme() {
        try {
            const savedTheme = localStorage.getItem('financeTracker_theme');
            if (savedTheme && this.themes.find(t => t.id === savedTheme)) {
                this.applyTheme(savedTheme);
            }
        } catch (e) {
            console.warn('Could not load theme preference:', e);
        }
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ThemeSwitcher.init());
} else {
    ThemeSwitcher.init();
}
