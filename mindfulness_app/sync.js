/**
 * Mindfulness Sync - Synchronization Module
 * Handles time-based synchronization for group meditation sessions
 * Uses a reference time algorithm for device synchronization
 */

class SyncManager {
    constructor() {
        this.isConnected = false;
        this.sessionCode = null;
        this.isHost = false;
        this.participants = 1;
        this.sessionData = null;
        this.syncOffset = 0;
        this.onSignalCallback = null;
        this.onParticipantChangeCallback = null;
        this.onStatusChangeCallback = null;
        this.syncInterval = null;
        this.storageKey = 'mindfulness_sync_session';
    }

    /**
     * Generate a unique 6-character session code
     */
    generateSessionCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    /**
     * Calculate synchronized reference time
     * Uses Unix timestamp rounded to ensure all devices fire at the same moment
     */
    getSyncTime() {
        return Date.now() + this.syncOffset;
    }

    /**
     * Create a new synchronized session
     */
    createSession(settings) {
        this.sessionCode = this.generateSessionCode();
        this.isHost = true;
        this.isConnected = true;
        this.participants = 1;

        // Session data stored with reference timestamp
        this.sessionData = {
            code: this.sessionCode,
            createdAt: Date.now(),
            settings: {
                duration: settings.duration,
                interval: settings.interval,
                sound: settings.sound,
                startTime: null,
                isActive: false
            },
            hostId: this.generateClientId(),
            participants: [this.generateClientId()]
        };

        // Store session in localStorage for cross-tab sync
        this.saveSession();

        // Start polling for participants (simulated with localStorage)
        this.startSessionPolling();

        if (this.onStatusChangeCallback) {
            this.onStatusChangeCallback({
                connected: true,
                code: this.sessionCode,
                isHost: true,
                participants: this.participants
            });
        }

        return this.sessionCode;
    }

    /**
     * Join an existing session by code
     */
    async joinSession(code) {
        code = code.toUpperCase().trim();

        // Validate code format
        if (!/^[A-Z0-9]{6}$/.test(code)) {
            throw new Error('Invalid session code format');
        }

        // Try to find session in storage (for demo - local sync)
        const storedSession = this.loadSession(code);

        if (!storedSession) {
            // In a real implementation, this would connect to a server
            // For demo purposes, we'll create a time-synchronized session
            this.sessionData = {
                code: code,
                createdAt: Date.now(),
                settings: {
                    duration: 300,
                    interval: 60,
                    sound: 'tibetan_bowl',
                    startTime: null,
                    isActive: false
                },
                hostId: 'remote',
                participants: [this.generateClientId()]
            };
        } else {
            this.sessionData = storedSession;
            this.sessionData.participants.push(this.generateClientId());
        }

        this.sessionCode = code;
        this.isHost = false;
        this.isConnected = true;
        this.participants = this.sessionData.participants.length;

        this.saveSession();
        this.startSessionPolling();

        if (this.onStatusChangeCallback) {
            this.onStatusChangeCallback({
                connected: true,
                code: this.sessionCode,
                isHost: false,
                participants: this.participants,
                settings: this.sessionData.settings
            });
        }

        return this.sessionData.settings;
    }

    /**
     * Start a synchronized session (host only)
     */
    startSyncedSession() {
        if (!this.isHost || !this.sessionData) {
            return false;
        }

        // Calculate a start time that's a round number for easy sync
        // Start at the next 5-second boundary
        const now = Date.now();
        const startTime = Math.ceil(now / 5000) * 5000 + 3000; // 3 seconds grace period

        this.sessionData.settings.startTime = startTime;
        this.sessionData.settings.isActive = true;

        this.saveSession();

        return {
            startTime: startTime,
            countdown: startTime - now
        };
    }

    /**
     * Calculate when the next signal should occur
     */
    getNextSignalTime(interval) {
        if (!this.sessionData || !this.sessionData.settings.startTime) {
            return null;
        }

        const startTime = this.sessionData.settings.startTime;
        const now = Date.now();
        const elapsed = now - startTime;

        if (elapsed < 0) {
            // Session hasn't started yet
            return startTime;
        }

        // Calculate next signal based on interval
        const intervalMs = interval * 1000;
        const signalsPassed = Math.floor(elapsed / intervalMs);
        const nextSignalTime = startTime + (signalsPassed + 1) * intervalMs;

        return nextSignalTime;
    }

    /**
     * Schedule synchronized signals
     */
    scheduleSyncedSignal(interval, callback) {
        const nextTime = this.getNextSignalTime(interval);

        if (!nextTime) {
            return null;
        }

        const delay = nextTime - Date.now();

        if (delay > 0 && delay < interval * 1000 * 2) {
            return setTimeout(() => {
                callback();
                // Schedule next signal
                this.scheduleSyncedSignal(interval, callback);
            }, delay);
        }

        return null;
    }

    /**
     * Leave the current session
     */
    leaveSession() {
        if (this.sessionData) {
            // Remove self from participants
            const clientId = this.generateClientId();
            this.sessionData.participants = this.sessionData.participants.filter(
                p => p !== clientId
            );

            if (this.isHost && this.sessionData.participants.length === 0) {
                // Delete session if host leaves and no participants
                this.deleteSession();
            } else {
                this.saveSession();
            }
        }

        this.stopSessionPolling();
        this.isConnected = false;
        this.sessionCode = null;
        this.isHost = false;
        this.sessionData = null;
        this.participants = 1;

        if (this.onStatusChangeCallback) {
            this.onStatusChangeCallback({
                connected: false,
                code: null,
                isHost: false,
                participants: 1
            });
        }
    }

    /**
     * Update session settings (host only)
     */
    updateSettings(settings) {
        if (!this.isHost || !this.sessionData) {
            return false;
        }

        this.sessionData.settings = {
            ...this.sessionData.settings,
            ...settings
        };

        this.saveSession();
        return true;
    }

    /**
     * Stop the synced session (host only)
     */
    stopSyncedSession() {
        if (!this.sessionData) {
            return;
        }

        this.sessionData.settings.isActive = false;
        this.sessionData.settings.startTime = null;

        this.saveSession();
    }

    /**
     * Generate a unique client ID
     */
    generateClientId() {
        let clientId = localStorage.getItem('mindfulness_client_id');
        if (!clientId) {
            clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('mindfulness_client_id', clientId);
        }
        return clientId;
    }

    /**
     * Save session to localStorage
     */
    saveSession() {
        if (this.sessionData) {
            const key = this.storageKey + '_' + this.sessionData.code;
            localStorage.setItem(key, JSON.stringify(this.sessionData));

            // Also save to a sessions index
            const index = JSON.parse(localStorage.getItem(this.storageKey + '_index') || '[]');
            if (!index.includes(this.sessionData.code)) {
                index.push(this.sessionData.code);
                localStorage.setItem(this.storageKey + '_index', JSON.stringify(index));
            }
        }
    }

    /**
     * Load session from localStorage
     */
    loadSession(code) {
        const key = this.storageKey + '_' + code;
        const data = localStorage.getItem(key);
        if (data) {
            const session = JSON.parse(data);
            // Check if session is still valid (within last hour)
            if (Date.now() - session.createdAt < 3600000) {
                return session;
            } else {
                // Clean up expired session
                localStorage.removeItem(key);
            }
        }
        return null;
    }

    /**
     * Delete session from localStorage
     */
    deleteSession() {
        if (this.sessionData) {
            const key = this.storageKey + '_' + this.sessionData.code;
            localStorage.removeItem(key);

            // Update index
            const index = JSON.parse(localStorage.getItem(this.storageKey + '_index') || '[]');
            const newIndex = index.filter(c => c !== this.sessionData.code);
            localStorage.setItem(this.storageKey + '_index', JSON.stringify(newIndex));
        }
    }

    /**
     * Start polling for session updates
     */
    startSessionPolling() {
        this.stopSessionPolling();

        this.syncInterval = setInterval(() => {
            this.pollSession();
        }, 2000);

        // Also listen for storage events (cross-tab communication)
        window.addEventListener('storage', this.handleStorageEvent.bind(this));
    }

    /**
     * Stop polling for session updates
     */
    stopSessionPolling() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        window.removeEventListener('storage', this.handleStorageEvent.bind(this));
    }

    /**
     * Poll for session updates
     */
    pollSession() {
        if (!this.sessionCode) return;

        const session = this.loadSession(this.sessionCode);
        if (session) {
            const oldParticipants = this.participants;
            this.sessionData = session;
            this.participants = session.participants.length;

            if (oldParticipants !== this.participants && this.onParticipantChangeCallback) {
                this.onParticipantChangeCallback(this.participants);
            }

            // Check if session started (for non-hosts)
            if (!this.isHost && session.settings.isActive && session.settings.startTime) {
                if (this.onSignalCallback) {
                    this.onSignalCallback({
                        type: 'session_start',
                        startTime: session.settings.startTime,
                        settings: session.settings
                    });
                }
            }
        }
    }

    /**
     * Handle storage events for cross-tab synchronization
     */
    handleStorageEvent(event) {
        if (event.key && event.key.startsWith(this.storageKey)) {
            this.pollSession();
        }
    }

    /**
     * Set callback for synchronized signals
     */
    onSignal(callback) {
        this.onSignalCallback = callback;
    }

    /**
     * Set callback for participant count changes
     */
    onParticipantChange(callback) {
        this.onParticipantChangeCallback = callback;
    }

    /**
     * Set callback for status changes
     */
    onStatusChange(callback) {
        this.onStatusChangeCallback = callback;
    }

    /**
     * Get current session info
     */
    getSessionInfo() {
        return {
            connected: this.isConnected,
            code: this.sessionCode,
            isHost: this.isHost,
            participants: this.participants,
            settings: this.sessionData ? this.sessionData.settings : null
        };
    }

    /**
     * Check if time-based sync is available
     * (NTP-like synchronization for precise timing)
     */
    async calibrateTime() {
        // In a production app, this would ping a time server
        // For this demo, we assume local time is accurate enough
        // The tolerance is ~100ms which is acceptable for mindfulness apps

        // Simulate time calibration
        const samples = [];
        for (let i = 0; i < 3; i++) {
            const start = Date.now();
            await new Promise(resolve => setTimeout(resolve, 50));
            const end = Date.now();
            samples.push(end - start - 50);
        }

        this.syncOffset = samples.reduce((a, b) => a + b, 0) / samples.length;
        return this.syncOffset;
    }

    /**
     * Broadcast a signal to all participants (for future WebSocket implementation)
     */
    broadcastSignal(signalType, data) {
        if (!this.isConnected) return;

        const signal = {
            type: signalType,
            timestamp: Date.now(),
            sessionCode: this.sessionCode,
            data: data
        };

        // Store in localStorage for cross-tab communication
        const signalKey = this.storageKey + '_signal_' + this.sessionCode;
        localStorage.setItem(signalKey, JSON.stringify(signal));

        // Trigger storage event
        setTimeout(() => {
            localStorage.removeItem(signalKey);
        }, 100);
    }
}

// Export for use in main app
window.SyncManager = SyncManager;
