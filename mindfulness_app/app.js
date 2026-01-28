/**
 * Mindfulness Sync - Main Application
 * Coordinates timer, sounds, vibration, and synchronization
 */

class MindfulnessApp {
    constructor() {
        // Core modules
        this.sounds = new MindfulnessSounds();
        this.sync = new SyncManager();

        // Session state
        this.isRunning = false;
        this.isPaused = false;
        this.sessionDuration = 300; // 5 minutes default
        this.signalInterval = 60; // 1 minute default
        this.remainingTime = 0;
        this.elapsedTime = 0;

        // Timers
        this.timerInterval = null;
        this.signalTimeout = null;
        this.breathingInterval = null;

        // Settings
        this.settings = {
            duration: 5, // minutes
            interval: 60, // seconds
            sound: 'tibetan_bowl',
            volume: 70,
            vibration: true,
            breathing: true
        };

        // Statistics
        this.stats = {
            sessions: 0,
            minutes: 0,
            signals: 0
        };

        // DOM elements
        this.elements = {};

        // Initialize
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.cacheElements();
        this.loadSettings();
        this.loadStats();
        this.bindEvents();
        this.updateUI();
        this.setupSync();

        // Initialize audio on first user interaction
        document.addEventListener('click', () => {
            this.sounds.init();
        }, { once: true });
    }

    /**
     * Cache DOM elements for performance
     */
    cacheElements() {
        this.elements = {
            // Timer
            timerText: document.getElementById('timerText'),
            timerLabel: document.getElementById('timerLabel'),
            timerCircle: document.getElementById('timerCircle'),
            progressCircle: document.getElementById('progressCircle'),

            // Breathing
            breathingIndicator: document.getElementById('breathingIndicator'),
            breathText: document.getElementById('breathText'),

            // Controls
            startBtn: document.getElementById('startBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            stopBtn: document.getElementById('stopBtn'),

            // Settings
            durationInput: document.getElementById('durationInput'),
            intervalInput: document.getElementById('intervalInput'),
            soundSelect: document.getElementById('soundSelect'),
            volumeSlider: document.getElementById('volumeSlider'),
            volumeValue: document.getElementById('volumeValue'),
            vibrationToggle: document.getElementById('vibrationToggle'),
            breathingToggle: document.getElementById('breathingToggle'),
            previewSound: document.getElementById('previewSound'),
            toggleSettings: document.getElementById('toggleSettings'),
            settingsContent: document.getElementById('settingsContent'),

            // Presets
            presetBtns: document.querySelectorAll('.preset-btn'),

            // Sync
            toggleSync: document.getElementById('toggleSync'),
            syncContent: document.getElementById('syncContent'),
            createSession: document.getElementById('createSession'),
            sessionCodeInput: document.getElementById('sessionCode'),
            joinSession: document.getElementById('joinSession'),
            syncStatus: document.getElementById('syncStatus'),
            syncStatusText: document.getElementById('syncStatusText'),
            activeSessionCode: document.getElementById('activeSessionCode'),
            copyCode: document.getElementById('copyCode'),
            participantCount: document.getElementById('participantCount'),
            leaveSession: document.getElementById('leaveSession'),

            // Stats
            totalSessions: document.getElementById('totalSessions'),
            totalMinutes: document.getElementById('totalMinutes'),
            totalSignals: document.getElementById('totalSignals'),

            // Toast
            toast: document.getElementById('toast'),
            toastMessage: document.getElementById('toastMessage')
        };
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Control buttons
        this.elements.startBtn.addEventListener('click', () => this.startSession());
        this.elements.pauseBtn.addEventListener('click', () => this.togglePause());
        this.elements.stopBtn.addEventListener('click', () => this.stopSession());

        // Settings inputs
        this.elements.durationInput.addEventListener('change', (e) => {
            this.settings.duration = parseInt(e.target.value) || 5;
            this.saveSettings();
        });

        this.elements.intervalInput.addEventListener('change', (e) => {
            this.settings.interval = parseInt(e.target.value) || 60;
            this.saveSettings();
        });

        this.elements.soundSelect.addEventListener('change', (e) => {
            this.settings.sound = e.target.value;
            this.sounds.setSound(e.target.value);
            this.saveSettings();
        });

        this.elements.volumeSlider.addEventListener('input', (e) => {
            this.settings.volume = parseInt(e.target.value);
            this.elements.volumeValue.textContent = `${this.settings.volume}%`;
            this.sounds.setVolume(this.settings.volume / 100);
            this.saveSettings();
        });

        this.elements.vibrationToggle.addEventListener('change', (e) => {
            this.settings.vibration = e.target.checked;
            this.saveSettings();
        });

        this.elements.breathingToggle.addEventListener('change', (e) => {
            this.settings.breathing = e.target.checked;
            this.saveSettings();
            this.updateBreathingGuide();
        });

        // Preview sound
        this.elements.previewSound.addEventListener('click', () => {
            this.sounds.init();
            this.sounds.play();
        });

        // Toggle sections
        this.elements.toggleSettings.addEventListener('click', () => {
            this.toggleSection('settings');
        });

        this.elements.toggleSync.addEventListener('click', () => {
            this.toggleSection('sync');
        });

        // Presets
        this.elements.presetBtns.forEach(btn => {
            btn.addEventListener('click', () => this.selectPreset(btn));
        });

        // Sync controls
        this.elements.createSession.addEventListener('click', () => this.createSyncSession());
        this.elements.joinSession.addEventListener('click', () => this.joinSyncSession());
        this.elements.copyCode.addEventListener('click', () => this.copySessionCode());
        this.elements.leaveSession.addEventListener('click', () => this.leaveSyncSession());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Visibility change (pause when tab hidden)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRunning && !this.isPaused) {
                // Keep running but note the time for accuracy
                this.lastVisibleTime = Date.now();
            }
        });
    }

    /**
     * Setup sync callbacks
     */
    setupSync() {
        this.sync.onStatusChange((status) => {
            this.updateSyncUI(status);
        });

        this.sync.onParticipantChange((count) => {
            this.elements.participantCount.textContent = count;
        });

        this.sync.onSignal((signal) => {
            if (signal.type === 'session_start' && !this.isRunning) {
                // Auto-start synced session
                this.settings.duration = signal.settings.duration / 60;
                this.settings.interval = signal.settings.interval;
                this.startSession(signal.startTime);
            }
        });
    }

    /**
     * Start a meditation session
     */
    startSession(syncStartTime = null) {
        if (this.isRunning) return;

        this.sounds.init();
        this.isRunning = true;
        this.isPaused = false;
        this.sessionDuration = this.settings.duration * 60;
        this.signalInterval = this.settings.interval;
        this.remainingTime = this.sessionDuration;
        this.elapsedTime = 0;

        // Update UI
        this.elements.startBtn.disabled = true;
        this.elements.pauseBtn.disabled = false;
        this.elements.stopBtn.disabled = false;
        this.elements.timerLabel.textContent = 'Session Active';
        document.querySelector('.app-container').classList.add('session-active');

        // Play start sound
        this.sounds.playStartSound();

        // Vibrate on start
        this.vibrate([100, 50, 100]);

        // Start timer
        if (syncStartTime) {
            // Synchronized start
            const delay = syncStartTime - Date.now();
            if (delay > 0) {
                setTimeout(() => this.runTimer(), delay);
                this.showToast(`Session starting in ${Math.ceil(delay / 1000)} seconds...`);
            } else {
                this.runTimer();
            }
        } else {
            this.runTimer();
        }

        // Start breathing guide
        if (this.settings.breathing) {
            this.startBreathingGuide();
        }

        // Schedule first signal
        this.scheduleNextSignal();

        // If synced, notify others
        if (this.sync.isConnected && this.sync.isHost) {
            this.sync.startSyncedSession();
        }
    }

    /**
     * Run the main timer
     */
    runTimer() {
        const startTime = Date.now();
        const totalDuration = this.sessionDuration * 1000;

        this.timerInterval = setInterval(() => {
            if (!this.isPaused) {
                const elapsed = Date.now() - startTime;
                this.elapsedTime = Math.floor(elapsed / 1000);
                this.remainingTime = Math.max(0, this.sessionDuration - this.elapsedTime);

                this.updateTimerDisplay();
                this.updateProgress(elapsed / totalDuration);

                if (this.remainingTime <= 0) {
                    this.completeSession();
                }
            }
        }, 100); // Update frequently for smooth display
    }

    /**
     * Toggle pause/resume
     */
    togglePause() {
        if (!this.isRunning) return;

        this.isPaused = !this.isPaused;

        if (this.isPaused) {
            this.elements.pauseBtn.querySelector('.btn-text').textContent = 'Resume';
            this.elements.pauseBtn.querySelector('.btn-icon').innerHTML = '&#9658;';
            this.elements.timerLabel.textContent = 'Paused';
            this.elements.breathingIndicator.classList.remove('active');
        } else {
            this.elements.pauseBtn.querySelector('.btn-text').textContent = 'Pause';
            this.elements.pauseBtn.querySelector('.btn-icon').innerHTML = '&#10074;&#10074;';
            this.elements.timerLabel.textContent = 'Session Active';
            if (this.settings.breathing) {
                this.elements.breathingIndicator.classList.add('active');
            }
        }
    }

    /**
     * Stop the current session
     */
    stopSession() {
        if (!this.isRunning) return;

        // Clear timers
        clearInterval(this.timerInterval);
        clearTimeout(this.signalTimeout);
        clearInterval(this.breathingInterval);

        this.isRunning = false;
        this.isPaused = false;

        // Update UI
        this.elements.startBtn.disabled = false;
        this.elements.pauseBtn.disabled = true;
        this.elements.stopBtn.disabled = true;
        this.elements.pauseBtn.querySelector('.btn-text').textContent = 'Pause';
        this.elements.pauseBtn.querySelector('.btn-icon').innerHTML = '&#10074;&#10074;';
        this.elements.timerLabel.textContent = 'Session Ended';
        this.elements.breathingIndicator.classList.remove('active');
        document.querySelector('.app-container').classList.remove('session-active');

        // Play end sound
        this.sounds.playEndSound();

        // Vibrate on end
        this.vibrate([200, 100, 200, 100, 200]);

        // Stop synced session if host
        if (this.sync.isConnected && this.sync.isHost) {
            this.sync.stopSyncedSession();
        }

        // Reset display after a delay
        setTimeout(() => {
            this.elements.timerText.textContent = '00:00';
            this.elements.timerLabel.textContent = 'Ready';
            this.updateProgress(0);
        }, 2000);
    }

    /**
     * Complete session (timer reached zero)
     */
    completeSession() {
        // Update stats
        this.stats.sessions++;
        this.stats.minutes += Math.round(this.sessionDuration / 60);
        this.saveStats();
        this.updateStatsDisplay();

        this.stopSession();
        this.showToast('Session complete. Well done!');
    }

    /**
     * Schedule the next mindfulness signal
     */
    scheduleNextSignal() {
        if (!this.isRunning || this.remainingTime <= 0) return;

        const intervalMs = this.signalInterval * 1000;

        // Calculate time until next signal
        const timeUntilNext = intervalMs - (this.elapsedTime * 1000 % intervalMs);

        this.signalTimeout = setTimeout(() => {
            if (this.isRunning && !this.isPaused) {
                this.triggerSignal();
            }
            this.scheduleNextSignal();
        }, timeUntilNext);
    }

    /**
     * Trigger a mindfulness signal (sound + vibration)
     */
    triggerSignal() {
        // Play sound
        this.sounds.play();

        // Vibrate
        if (this.settings.vibration) {
            this.vibrate([200, 100, 200]);
        }

        // Visual feedback
        this.elements.timerCircle.classList.add('signal');
        setTimeout(() => {
            this.elements.timerCircle.classList.remove('signal');
        }, 1000);

        // Update stats
        this.stats.signals++;
        this.saveStats();
        this.updateStatsDisplay();
    }

    /**
     * Trigger device vibration
     */
    vibrate(pattern) {
        if (this.settings.vibration && 'vibrate' in navigator) {
            try {
                navigator.vibrate(pattern);
            } catch (e) {
                // Vibration not supported or blocked
            }
        }
    }

    /**
     * Update timer display
     */
    updateTimerDisplay() {
        const minutes = Math.floor(this.remainingTime / 60);
        const seconds = this.remainingTime % 60;
        this.elements.timerText.textContent =
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Update progress circle
     */
    updateProgress(progress) {
        const circumference = 2 * Math.PI * 130; // r=130
        const offset = circumference * (1 - Math.min(1, progress));
        this.elements.progressCircle.style.strokeDashoffset = offset;

        // Change color based on progress
        if (progress > 0.75) {
            this.elements.progressCircle.style.stroke = '#c4a35a'; // Gold
        } else if (progress > 0.5) {
            this.elements.progressCircle.style.stroke = '#6b5b95'; // Purple
        } else {
            this.elements.progressCircle.style.stroke = '#4a9c8c'; // Teal
        }
    }

    /**
     * Start breathing guide animation
     */
    startBreathingGuide() {
        this.elements.breathingIndicator.classList.add('active');

        const breathCycle = 8000; // 8 seconds per cycle
        const phases = [
            { duration: 4000, text: 'Breathe In' },
            { duration: 2000, text: 'Hold' },
            { duration: 4000, text: 'Breathe Out' }
        ];

        let phaseIndex = 0;

        const updateBreath = () => {
            if (!this.isRunning || this.isPaused) return;

            const phase = phases[phaseIndex];
            this.elements.breathText.textContent = phase.text;

            phaseIndex = (phaseIndex + 1) % phases.length;
        };

        updateBreath();
        this.breathingInterval = setInterval(updateBreath, breathCycle / 3);
    }

    /**
     * Update breathing guide visibility
     */
    updateBreathingGuide() {
        if (this.settings.breathing && this.isRunning && !this.isPaused) {
            this.elements.breathingIndicator.classList.add('active');
        } else {
            this.elements.breathingIndicator.classList.remove('active');
        }
    }

    /**
     * Select a preset configuration
     */
    selectPreset(btn) {
        const duration = parseInt(btn.dataset.duration);
        const interval = parseInt(btn.dataset.interval);

        this.settings.duration = duration / 60;
        this.settings.interval = interval;

        this.elements.durationInput.value = this.settings.duration;
        this.elements.intervalInput.value = this.settings.interval;

        // Update active state
        this.elements.presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.saveSettings();
        this.showToast(`Preset selected: ${btn.querySelector('.preset-name').textContent}`);
    }

    /**
     * Toggle collapsible sections
     */
    toggleSection(section) {
        const content = section === 'settings' ? this.elements.settingsContent : this.elements.syncContent;
        const btn = section === 'settings' ? this.elements.toggleSettings : this.elements.toggleSync;

        content.classList.toggle('collapsed');
        btn.classList.toggle('collapsed');
    }

    /**
     * Create a synchronized session
     */
    createSyncSession() {
        const code = this.sync.createSession({
            duration: this.settings.duration * 60,
            interval: this.settings.interval,
            sound: this.settings.sound
        });

        this.showToast(`Session created: ${code}`);
    }

    /**
     * Join a synchronized session
     */
    async joinSyncSession() {
        const code = this.elements.sessionCodeInput.value;
        if (!code || code.length !== 6) {
            this.showToast('Please enter a valid 6-character code');
            return;
        }

        try {
            const settings = await this.sync.joinSession(code);
            if (settings) {
                this.settings.duration = settings.duration / 60;
                this.settings.interval = settings.interval;
                this.elements.durationInput.value = this.settings.duration;
                this.elements.intervalInput.value = this.settings.interval;
            }
            this.showToast(`Joined session: ${code}`);
        } catch (error) {
            this.showToast(error.message);
        }
    }

    /**
     * Copy session code to clipboard
     */
    copySessionCode() {
        const code = this.elements.activeSessionCode.textContent;
        navigator.clipboard.writeText(code).then(() => {
            this.showToast('Code copied to clipboard');
        }).catch(() => {
            this.showToast('Failed to copy code');
        });
    }

    /**
     * Leave the current sync session
     */
    leaveSyncSession() {
        this.sync.leaveSession();
        this.showToast('Left session');
    }

    /**
     * Update sync UI
     */
    updateSyncUI(status) {
        if (status.connected) {
            this.elements.syncStatus.style.display = 'flex';
            this.elements.activeSessionCode.textContent = status.code;
            this.elements.participantCount.textContent = status.participants;
            this.elements.syncStatusText.textContent = status.isHost ? 'Hosting' : 'Connected';

            // Hide create/join buttons
            document.querySelector('.sync-options').style.display = 'none';
        } else {
            this.elements.syncStatus.style.display = 'none';
            document.querySelector('.sync-options').style.display = 'flex';
        }
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboard(e) {
        // Only handle if not typing in an input
        if (e.target.tagName === 'INPUT') return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                if (this.isRunning) {
                    this.togglePause();
                } else {
                    this.startSession();
                }
                break;
            case 'Escape':
                if (this.isRunning) {
                    this.stopSession();
                }
                break;
            case 'KeyM':
                // Mute/unmute
                this.settings.volume = this.settings.volume > 0 ? 0 : 70;
                this.elements.volumeSlider.value = this.settings.volume;
                this.elements.volumeValue.textContent = `${this.settings.volume}%`;
                this.sounds.setVolume(this.settings.volume / 100);
                break;
        }
    }

    /**
     * Show toast notification
     */
    showToast(message) {
        this.elements.toastMessage.textContent = message;
        this.elements.toast.classList.add('show');

        setTimeout(() => {
            this.elements.toast.classList.remove('show');
        }, 3000);
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        const saved = localStorage.getItem('mindfulness_settings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
    }

    /**
     * Save settings to localStorage
     */
    saveSettings() {
        localStorage.setItem('mindfulness_settings', JSON.stringify(this.settings));
    }

    /**
     * Load stats from localStorage
     */
    loadStats() {
        const saved = localStorage.getItem('mindfulness_stats');
        const today = new Date().toDateString();
        const savedDate = localStorage.getItem('mindfulness_stats_date');

        if (saved && savedDate === today) {
            this.stats = JSON.parse(saved);
        } else {
            // Reset stats for new day
            this.stats = { sessions: 0, minutes: 0, signals: 0 };
            localStorage.setItem('mindfulness_stats_date', today);
        }
    }

    /**
     * Save stats to localStorage
     */
    saveStats() {
        localStorage.setItem('mindfulness_stats', JSON.stringify(this.stats));
        localStorage.setItem('mindfulness_stats_date', new Date().toDateString());
    }

    /**
     * Update UI with current settings
     */
    updateUI() {
        this.elements.durationInput.value = this.settings.duration;
        this.elements.intervalInput.value = this.settings.interval;
        this.elements.soundSelect.value = this.settings.sound;
        this.elements.volumeSlider.value = this.settings.volume;
        this.elements.volumeValue.textContent = `${this.settings.volume}%`;
        this.elements.vibrationToggle.checked = this.settings.vibration;
        this.elements.breathingToggle.checked = this.settings.breathing;

        this.sounds.setSound(this.settings.sound);
        this.sounds.setVolume(this.settings.volume / 100);

        this.updateStatsDisplay();
    }

    /**
     * Update statistics display
     */
    updateStatsDisplay() {
        this.elements.totalSessions.textContent = this.stats.sessions;
        this.elements.totalMinutes.textContent = this.stats.minutes;
        this.elements.totalSignals.textContent = this.stats.signals;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.mindfulnessApp = new MindfulnessApp();
});

// Service Worker registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {
            // Service worker registration failed, app still works
        });
    });
}
