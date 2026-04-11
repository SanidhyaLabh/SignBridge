// SignSense AR - Main Application JavaScript
class SignSenseAR {
    constructor() {
        this.init();
        this.setupEventListeners();
        this.checkBrowserSupport();
    }

    init() {
        console.log('SignSense AR Application Initializing...');
        
        // Check for required APIs
        this.browserSupport = {
            webkitSpeech: 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
            speechSynthesis: 'speechSynthesis' in window,
            mediaDevices: navigator.mediaDevices && 'getUserMedia' in navigator.mediaDevices,
            webgl: this.checkWebGLSupport()
        };

        // Initialize speech recognition if available
        if (this.browserSupport.webkitSpeech) {
            this.initSpeechRecognition();
        }

        // Initialize text-to-speech if available
        if (this.browserSupport.speechSynthesis) {
            this.initTextToSpeech();
        }

        // Application state
        this.state = {
            isRecording: false,
            isTranslating: false,
            currentMode: 'home',
            cameraActive: false,
            avatarLoaded: false
        };

        console.log('Browser Support:', this.browserSupport);
    }

    checkWebGLSupport() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            return !!gl;
        } catch (e) {
            return false;
        }
    }

    setupEventListeners() {
        // Navigation
        document.addEventListener('DOMContentLoaded', () => {
            this.setupNavigation();
            this.setupThemeToggle();
            this.setupSmoothScroll();
        });

        // Page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseActiveProcesses();
            } else {
                this.resumeActiveProcesses();
            }
        });

        // Window resize
        window.addEventListener('resize', this.debounce(() => {
            this.handleResize();
        }, 250));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });
    }

    setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-links a');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                // Update active state
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });
    }

    setupThemeToggle() {
        // Theme toggle functionality (if implemented)
        const themeToggle = document.querySelector('.theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                document.body.classList.toggle('theme-light');
                localStorage.setItem('theme', document.body.classList.contains('theme-light') ? 'light' : 'dark');
            });
        }

        // Load saved theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.classList.add('theme-light');
        }
    }

    setupSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }

    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.state.isRecording = true;
            this.updateRecordingUI(true);
        };

        this.recognition.onresult = (event) => {
            const current = event.resultIndex;
            const transcript = event.results[current][0].transcript;
            
            if (event.results[current].isFinal) {
                this.handleSpeechResult(transcript);
            } else {
                this.handleInterimResult(transcript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.handleSpeechError(event.error);
        };

        this.recognition.onend = () => {
            console.log('Speech recognition ended');
            this.state.isRecording = false;
            this.updateRecordingUI(false);
        };
    }

    initTextToSpeech() {
        this.synthesis = window.speechSynthesis;
        
        // Get available voices
        this.updateVoices();
        
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => this.updateVoices();
        }
    }

    updateVoices() {
        this.voices = this.synthesis.getVoices();
        console.log('Available voices:', this.voices.length);
    }

    startSpeechRecognition() {
        if (!this.browserSupport.webkitSpeech) {
            this.showNotification('Speech recognition not supported in your browser', 'error');
            return;
        }

        if (this.state.isRecording) {
            this.stopSpeechRecognition();
            return;
        }

        try {
            this.recognition.start();
        } catch (error) {
            console.error('Failed to start speech recognition:', error);
            this.showNotification('Failed to start speech recognition', 'error');
        }
    }

    stopSpeechRecognition() {
        if (this.recognition) {
            this.recognition.stop();
        }
    }

    handleSpeechResult(transcript) {
        console.log('Final speech result:', transcript);
        
        // Update UI with final result
        const transcriptElement = document.getElementById('transcript');
        if (transcriptElement) {
            transcriptElement.textContent = transcript;
        }

        // Trigger translation
        this.translateText(transcript);
    }

    handleInterimResult(transcript) {
        console.log('Interim speech result:', transcript);
        
        // Update UI with interim result
        const interimElement = document.getElementById('interim-transcript');
        if (interimElement) {
            interimElement.textContent = transcript;
        }
    }

    handleSpeechError(error) {
        console.error('Speech recognition error:', error);
        
        let errorMessage = 'Speech recognition failed';
        switch (error) {
            case 'no-speech':
                errorMessage = 'No speech detected';
                break;
            case 'audio-capture':
                errorMessage = 'Microphone access denied';
                break;
            case 'not-allowed':
                errorMessage = 'Microphone permission denied';
                break;
            case 'network':
                errorMessage = 'Network error';
                break;
        }
        
        this.showNotification(errorMessage, 'error');
    }

    updateRecordingUI(isRecording) {
        const micButtons = document.querySelectorAll('.mic-btn, #mic-btn');
        micButtons.forEach(button => {
            if (isRecording) {
                button.classList.add('recording');
                button.innerHTML = '<span class="material-icons-round">stop</span> Stop Recording';
            } else {
                button.classList.remove('recording');
                button.innerHTML = '<span class="material-icons-round">mic</span> Tap to Speak';
            }
        });
    }

    speakText(text, options = {}) {
        if (!this.browserSupport.speechSynthesis) {
            console.warn('Text-to-speech not supported');
            return;
        }

        // Cancel any ongoing speech
        this.synthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        
        // Configure utterance
        utterance.rate = options.rate || 1.0;
        utterance.pitch = options.pitch || 1.0;
        utterance.volume = options.volume || 1.0;
        
        // Set voice
        if (options.voice && this.voices) {
            const voice = this.voices.find(v => v.name === options.voice);
            if (voice) utterance.voice = voice;
        }

        utterance.onstart = () => {
            console.log('Speaking:', text);
            if (options.onStart) options.onStart();
        };

        utterance.onend = () => {
            console.log('Speech finished');
            if (options.onEnd) options.onEnd();
        };

        utterance.onerror = (event) => {
            console.error('Speech error:', event);
            if (options.onError) options.onError(event);
        };

        this.synthesis.speak(utterance);
    }

    async translateText(text) {
        console.log('Translating text:', text);
        
        this.state.isTranslating = true;
        this.updateTranslationUI(true);

        try {
            // Here you would integrate with your backend translation service
            // For now, we'll simulate the translation
            
            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Mock translation result
            const translation = await this.mockTranslation(text);
            
            this.displayTranslation(translation);
            
        } catch (error) {
            console.error('Translation failed:', error);
            this.showNotification('Translation failed', 'error');
        } finally {
            this.state.isTranslating = false;
            this.updateTranslationUI(false);
        }
    }

    async mockTranslation(text) {
        // This would be replaced with actual translation logic
        return {
            original: text,
            translated: `[SIGN: ${text.toUpperCase()}]`,
            confidence: 0.95,
            emotion: 'neutral'
        };
    }

    displayTranslation(translation) {
        const outputElement = document.getElementById('translation-output');
        if (outputElement) {
            outputElement.textContent = translation.translated;
        }

        const confidenceElement = document.getElementById('confidence');
        if (confidenceElement) {
            confidenceElement.textContent = `${Math.round(translation.confidence * 100)}%`;
        }

        // Trigger avatar animation if available
        if (window.avatarController) {
            window.avatarController.animateText(translation.translated);
        }
    }

    updateTranslationUI(isTranslating) {
        const translateButtons = document.querySelectorAll('.translate-btn');
        translateButtons.forEach(button => {
            if (isTranslating) {
                button.disabled = true;
                button.innerHTML = '<span class="loading"></span> Translating...';
            } else {
                button.disabled = false;
                button.innerHTML = '<span class="material-icons-round">translate</span> Translate';
            }
        });
    }

    async startCamera() {
        if (!this.browserSupport.mediaDevices) {
            this.showNotification('Camera not supported in your browser', 'error');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                } 
            });

            this.state.cameraActive = true;
            this.handleCameraStream(stream);
            
        } catch (error) {
            console.error('Camera access failed:', error);
            this.showNotification('Failed to access camera', 'error');
        }
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        this.state.cameraActive = false;
    }

    handleCameraStream(stream) {
        this.cameraStream = stream;
        
        const videoElement = document.getElementById('camera-feed');
        if (videoElement) {
            videoElement.srcObject = stream;
            videoElement.play();
        }

        // Start gesture recognition if available
        if (window.gestureRecognition) {
            window.gestureRecognition.start(stream);
        }
    }

    checkBrowserSupport() {
        const missingFeatures = [];
        
        if (!this.browserSupport.webkitSpeech) {
            missingFeatures.push('Speech Recognition');
        }
        
        if (!this.browserSupport.speechSynthesis) {
            missingFeatures.push('Text-to-Speech');
        }
        
        if (!this.browserSupport.mediaDevices) {
            missingFeatures.push('Camera Access');
        }
        
        if (!this.browserSupport.webgl) {
            missingFeatures.push('WebGL (3D Graphics)');
        }

        if (missingFeatures.length > 0) {
            console.warn('Missing browser features:', missingFeatures);
            this.showNotification(
                `Your browser may not support: ${missingFeatures.join(', ')}`,
                'warning'
            );
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        // Type-specific colors
        const colors = {
            error:   { bg: 'rgba(239, 68, 68, 0.15)',  border: 'rgba(239, 68, 68, 0.4)',  text: '#f87171' },
            warning: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#fbbf24' },
            success: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', text: '#34d399' },
            info:    { bg: 'rgba(59, 130, 246, 0.15)',  border: 'rgba(59, 130, 246, 0.4)', text: '#60a5fa' }
        };
        const c = colors[type] || colors.info;

        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%) translateY(-10px)',
            background: c.bg,
            border: `1px solid ${c.border}`,
            color: c.text,
            padding: '12px 24px',
            borderRadius: '14px',
            fontSize: '0.9rem',
            fontWeight: '500',
            fontFamily: 'Inter, sans-serif',
            zIndex: '10000',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            opacity: '0',
            transition: 'all 0.4s ease',
            maxWidth: '90%',
            textAlign: 'center'
        });

        document.body.appendChild(notification);

        // Animate in
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(-50%) translateY(0)';
        });

        // Auto remove after 4 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(-50%) translateY(-10px)';
            setTimeout(() => {
                if (notification.parentNode) notification.parentNode.removeChild(notification);
            }, 400);
        }, 4000);
    }

    pauseActiveProcesses() {
        // Pause camera, speech recognition, etc. when page is hidden
        if (this.state.cameraActive) {
            this.stopCamera();
        }
        
        if (this.state.isRecording) {
            this.stopSpeechRecognition();
        }
    }

    resumeActiveProcesses() {
        // Resume processes when page becomes visible again
        // This would be implemented based on application needs
    }

    handleResize() {
        // Handle responsive layout changes
        console.log('Window resized');
    }

    handleKeyboardShortcuts(e) {
        // Global keyboard shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'm':
                    e.preventDefault();
                    this.startSpeechRecognition();
                    break;
                case 'c':
                    e.preventDefault();
                    if (this.state.cameraActive) {
                        this.stopCamera();
                    } else {
                        this.startCamera();
                    }
                    break;
            }
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Utility methods
    formatTimestamp() {
        return new Date().toLocaleTimeString();
    }

    sanitizeInput(input) {
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Copied to clipboard', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }
}

// Initialize the application
const signSenseAR = new SignSenseAR();

// Make it globally available
window.signSenseAR = signSenseAR;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SignSenseAR;
}
