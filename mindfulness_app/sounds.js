/**
 * Mindfulness Sync - Sound Generation Module
 * Uses Web Audio API to create various calming sounds
 */

class MindfulnessSounds {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.volume = 0.7;
        this.currentSound = 'tibetan_bowl';
        this.isInitialized = false;
    }

    /**
     * Initialize the audio context (must be called on user interaction)
     */
    init() {
        if (this.isInitialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = this.volume;
            this.isInitialized = true;
        } catch (error) {
            console.error('Web Audio API not supported:', error);
        }
    }

    /**
     * Resume audio context if suspended (browser autoplay policy)
     */
    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    /**
     * Set master volume (0-1)
     */
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
        }
    }

    /**
     * Set current sound type
     */
    setSound(soundType) {
        this.currentSound = soundType;
    }

    /**
     * Play the currently selected sound
     */
    async play() {
        if (!this.isInitialized) {
            this.init();
        }
        await this.resume();

        switch (this.currentSound) {
            case 'tibetan_bowl':
                this.playTibetanBowl();
                break;
            case 'zen_bell':
                this.playZenBell();
                break;
            case 'crystal_chime':
                this.playCrystalChime();
                break;
            case 'ocean_wave':
                this.playOceanWave();
                break;
            case 'gentle_gong':
                this.playGentleGong();
                break;
            case 'wind_chime':
                this.playWindChime();
                break;
            case 'rain_drop':
                this.playRainDrop();
                break;
            case 'forest_bird':
                this.playForestBird();
                break;
            default:
                this.playTibetanBowl();
        }
    }

    /**
     * Tibetan Singing Bowl - Rich, resonant harmonic sound
     */
    playTibetanBowl() {
        const now = this.audioContext.currentTime;
        const duration = 4;

        // Fundamental frequency (F4 - typical singing bowl)
        const fundamental = 349.23;

        // Create multiple harmonics for rich sound
        const harmonics = [1, 2.76, 4.72, 6.95, 9.44];
        const amplitudes = [1, 0.5, 0.35, 0.25, 0.15];

        harmonics.forEach((ratio, index) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            osc.type = 'sine';
            osc.frequency.value = fundamental * ratio;

            // Add slight detuning for natural sound
            osc.detune.value = Math.random() * 10 - 5;

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(amplitudes[index] * 0.3, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + duration);
        });

        // Add subtle beating/shimmer effect
        this.addShimmer(fundamental, duration, 0.1);
    }

    /**
     * Zen Bell - Clear, pure bell tone
     */
    playZenBell() {
        const now = this.audioContext.currentTime;
        const duration = 3;
        const frequency = 880; // A5

        // Main tone
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.value = frequency;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        // Add harmonics for bell-like quality
        [2, 3, 4.2, 5.4].forEach((ratio, index) => {
            const harmOsc = this.audioContext.createOscillator();
            const harmGain = this.audioContext.createGain();

            harmOsc.type = 'sine';
            harmOsc.frequency.value = frequency * ratio;

            const amp = 0.15 / (index + 1);
            harmGain.gain.setValueAtTime(0, now);
            harmGain.gain.linearRampToValueAtTime(amp, now + 0.01);
            harmGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.7);

            harmOsc.connect(harmGain);
            harmGain.connect(this.masterGain);

            harmOsc.start(now);
            harmOsc.stop(now + duration);
        });

        osc.start(now);
        osc.stop(now + duration);
    }

    /**
     * Crystal Chime - High, sparkling tones
     */
    playCrystalChime() {
        const now = this.audioContext.currentTime;
        const notes = [1318.51, 1567.98, 2093.00, 2637.02]; // E6, G6, C7, E7

        notes.forEach((freq, index) => {
            const startTime = now + index * 0.08;
            const duration = 2.5 - index * 0.3;

            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.2, startTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(startTime);
            osc.stop(startTime + duration);
        });
    }

    /**
     * Ocean Wave - Gentle wave-like sound using filtered noise
     */
    playOceanWave() {
        const now = this.audioContext.currentTime;
        const duration = 4;

        // Create noise
        const bufferSize = this.audioContext.sampleRate * duration;
        const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = noiseBuffer;

        // Low-pass filter for ocean sound
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.linearRampToValueAtTime(800, now + duration / 2);
        filter.frequency.linearRampToValueAtTime(300, now + duration);
        filter.Q.value = 1;

        // Volume envelope for wave shape
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + duration * 0.3);
        gain.gain.linearRampToValueAtTime(0.2, now + duration * 0.5);
        gain.gain.linearRampToValueAtTime(0.05, now + duration * 0.8);
        gain.gain.linearRampToValueAtTime(0, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(now);
        noise.stop(now + duration);
    }

    /**
     * Gentle Gong - Deep, resonant gong sound
     */
    playGentleGong() {
        const now = this.audioContext.currentTime;
        const duration = 5;
        const fundamental = 110; // A2 - deep tone

        // Multiple layers for gong richness
        const partials = [1, 1.5, 2, 2.4, 3, 3.5, 4, 5, 6];
        const amplitudes = [1, 0.7, 0.5, 0.6, 0.4, 0.3, 0.25, 0.2, 0.15];

        partials.forEach((ratio, index) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            osc.type = 'sine';
            osc.frequency.value = fundamental * ratio;
            osc.detune.value = Math.random() * 20 - 10;

            const amp = amplitudes[index] * 0.15;
            const attackTime = 0.02 + index * 0.01;

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(amp, now + attackTime);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + duration);
        });

        // Add rumble
        this.addRumble(duration * 0.7);
    }

    /**
     * Wind Chime - Multiple random tinkling notes
     */
    playWindChime() {
        const now = this.audioContext.currentTime;
        const notes = [523.25, 587.33, 659.25, 783.99, 880, 987.77, 1046.50]; // C5 to C6 major scale

        // Play 4-6 random notes with slight delays
        const numNotes = 4 + Math.floor(Math.random() * 3);

        for (let i = 0; i < numNotes; i++) {
            const startTime = now + Math.random() * 0.5;
            const freq = notes[Math.floor(Math.random() * notes.length)];
            const duration = 1.5 + Math.random();

            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.15, startTime + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            // Add slight harmonic
            const harmOsc = this.audioContext.createOscillator();
            const harmGain = this.audioContext.createGain();
            harmOsc.type = 'sine';
            harmOsc.frequency.value = freq * 3;
            harmGain.gain.setValueAtTime(0, startTime);
            harmGain.gain.linearRampToValueAtTime(0.03, startTime + 0.005);
            harmGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.5);

            osc.connect(gain);
            gain.connect(this.masterGain);
            harmOsc.connect(harmGain);
            harmGain.connect(this.masterGain);

            osc.start(startTime);
            osc.stop(startTime + duration);
            harmOsc.start(startTime);
            harmOsc.stop(startTime + duration);
        }
    }

    /**
     * Rain Drop - Single water droplet sound
     */
    playRainDrop() {
        const now = this.audioContext.currentTime;

        // Multiple drops
        for (let i = 0; i < 5; i++) {
            const startTime = now + i * 0.15 + Math.random() * 0.1;
            this.createDrop(startTime);
        }
    }

    createDrop(startTime) {
        const duration = 0.3;
        const baseFreq = 800 + Math.random() * 400;

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * 2, startTime);
        osc.frequency.exponentialRampToValueAtTime(baseFreq, startTime + 0.05);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, startTime + duration);

        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    /**
     * Forest Bird - Nature-inspired chirping sound
     */
    playForestBird() {
        const now = this.audioContext.currentTime;

        // Create a simple bird-like chirp
        const chirpFreqs = [2000, 2400, 2200, 2600, 2100];

        chirpFreqs.forEach((freq, index) => {
            const startTime = now + index * 0.12;
            const duration = 0.1;

            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * 0.8, startTime);
            osc.frequency.linearRampToValueAtTime(freq, startTime + duration * 0.3);
            osc.frequency.linearRampToValueAtTime(freq * 0.9, startTime + duration);

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
            gain.gain.linearRampToValueAtTime(0.1, startTime + duration * 0.5);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(startTime);
            osc.stop(startTime + duration);
        });
    }

    /**
     * Add shimmer effect (for singing bowl)
     */
    addShimmer(baseFreq, duration, amplitude) {
        const now = this.audioContext.currentTime;

        const osc1 = this.audioContext.createOscillator();
        const osc2 = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.value = baseFreq * 2;
        osc2.frequency.value = baseFreq * 2 + 3; // Slight detune for beating

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(amplitude, now + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + duration);
        osc2.stop(now + duration);
    }

    /**
     * Add low rumble (for gong)
     */
    addRumble(duration) {
        const now = this.audioContext.currentTime;
        const bufferSize = this.audioContext.sampleRate * duration;
        const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 100;
        filter.Q.value = 5;

        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(now);
        noise.stop(now + duration);
    }

    /**
     * Play start session sound (gentle ascending tones)
     */
    playStartSound() {
        const now = this.audioContext.currentTime;
        const notes = [261.63, 329.63, 392.00]; // C4, E4, G4 - major chord

        notes.forEach((freq, index) => {
            const startTime = now + index * 0.15;
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(startTime);
            osc.stop(startTime + 1);
        });
    }

    /**
     * Play end session sound (gentle descending tones)
     */
    playEndSound() {
        const now = this.audioContext.currentTime;
        const notes = [392.00, 329.63, 261.63]; // G4, E4, C4 - descending

        notes.forEach((freq, index) => {
            const startTime = now + index * 0.2;
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.5);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(startTime);
            osc.stop(startTime + 1.5);
        });
    }
}

// Export for use in main app
window.MindfulnessSounds = MindfulnessSounds;
