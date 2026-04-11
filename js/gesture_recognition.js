/**
 * SignSense AR - Gesture Recognition System
 * Handles real-time sign language recognition using MediaPipe and ML models
 */

class GestureRecognition {
    constructor() {
        this.isInitialized = false;
        this.isProcessing = false;
        this.videoElement = null;
        this.canvasElement = null;
        this.ctx = null;
        
        // MediaPipe hands
        this.hands = null;
        this.camera = null;
        
        // Recognition state
        this.currentGesture = "";
        this.confidence = 0.0;
        this.gestureHistory = [];
        this.maxHistory = 10;
        
        // Callbacks
        this.onGestureDetected = null;
        this.onHandDetected = null;
        this.onError = null;
        
        // Settings
        this.settings = {
            detectionConfidence: 0.5,
            trackingConfidence: 0.5,
            maxNumHands: 1,
            modelComplexity: 0
        };

        this.init();
    }

    async init() {
        try {
            console.log('Initializing Gesture Recognition...');
            
            // Load MediaPipe Hands
            await this.loadMediaPipe();
            
            this.isInitialized = true;
            console.log('Gesture Recognition initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize Gesture Recognition:', error);
            this.handleError(error);
        }
    }

    async loadMediaPipe() {
        try {
            // Load MediaPipe Hands
            const hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });

            hands.setOptions({
                maxNumHands: this.settings.maxNumHands,
                modelComplexity: this.settings.modelComplexity,
                minDetectionConfidence: this.settings.detectionConfidence,
                minTrackingConfidence: this.settings.trackingConfidence
            });

            hands.onResults(this.onResults.bind(this));
            
            this.hands = hands;
            
        } catch (error) {
            console.error('Failed to load MediaPipe:', error);
            throw error;
        }
    }

    async start(videoElement, canvasElement) {
        if (!this.isInitialized) {
            throw new Error('Gesture Recognition not initialized');
        }

        try {
            this.videoElement = videoElement;
            this.canvasElement = canvasElement;
            this.ctx = canvasElement.getContext('2d');

            // Setup camera
            await this.setupCamera();

            // Start processing
            this.isProcessing = true;
            this.process();

            console.log('Gesture Recognition started');

        } catch (error) {
            console.error('Failed to start Gesture Recognition:', error);
            this.handleError(error);
        }
    }

    async setupCamera() {
        if (!this.videoElement) {
            throw new Error('Video element not provided');
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                }
            });

            this.videoElement.srcObject = stream;

            return new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    resolve();
                };
            });

        } catch (error) {
            console.error('Camera setup failed:', error);
            throw error;
        }
    }

    async process() {
        if (!this.isProcessing || !this.videoElement || !this.hands) {
            return;
        }

        try {
            await this.hands.send({ image: this.videoElement });
            
            // Continue processing
            requestAnimationFrame(() => this.process());

        } catch (error) {
            console.error('Processing error:', error);
            this.handleError(error);
        }
    }

    onResults(results) {
        try {
            // Clear canvas
            if (this.ctx && this.canvasElement) {
                this.ctx.save();
                this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
                
                // Draw video frame
                this.ctx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);
            }

            // Check if hands are detected
            const handsDetected = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
            
            if (this.onHandDetected) {
                this.onHandDetected(handsDetected);
            }

            if (handsDetected) {
                // Process hand landmarks
                for (const landmarks of results.multiHandLandmarks) {
                    // Draw hand landmarks
                    this.drawHandLandmarks(landmarks);
                    
                    // Extract features for gesture recognition
                    const features = this.extractHandFeatures(landmarks);
                    
                    // Recognize gesture
                    const gesture = this.recognizeGesture(features);
                    
                    if (gesture && this.onGestureDetected) {
                        this.onGestureDetected(gesture);
                    }
                }
            } else {
                // No hands detected
                this.currentGesture = "";
                this.confidence = 0.0;
            }

            // Restore canvas context
            if (this.ctx) {
                this.ctx.restore();
            }

        } catch (error) {
            console.error('Results processing error:', error);
            this.handleError(error);
        }
    }

    drawHandLandmarks(landmarks) {
        if (!this.ctx) return;

        // Draw connections
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],     // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8],     // Index
            [5, 9], [9, 10], [10, 11], [11, 12], // Middle
            [9, 13], [13, 14], [14, 15], [15, 16], // Ring
            [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
            [0, 17]                              // Palm
        ];

        this.ctx.strokeStyle = '#00FF00';
        this.ctx.lineWidth = 2;

        connections.forEach(([start, end]) => {
            const startPoint = landmarks[start];
            const endPoint = landmarks[end];

            this.ctx.beginPath();
            this.ctx.moveTo(
                startPoint.x * this.canvasElement.width,
                startPoint.y * this.canvasElement.height
            );
            this.ctx.lineTo(
                endPoint.x * this.canvasElement.width,
                endPoint.y * this.canvasElement.height
            );
            this.ctx.stroke();
        });

        // Draw landmarks
        this.ctx.fillStyle = '#FF0000';
        landmarks.forEach((landmark) => {
            this.ctx.beginPath();
            this.ctx.arc(
                landmark.x * this.canvasElement.width,
                landmark.y * this.canvasElement.height,
                5,
                0,
                2 * Math.PI
            );
            this.ctx.fill();
        });
    }

    extractHandFeatures(landmarks) {
        try {
            // Extract relevant features from hand landmarks
            const features = {
                // Finger states (extended or not)
                thumb: this.isFingerExtended(landmarks, [1, 2, 3, 4]),
                index: this.isFingerExtended(landmarks, [5, 6, 7, 8]),
                middle: this.isFingerExtended(landmarks, [9, 10, 11, 12]),
                ring: this.isFingerExtended(landmarks, [13, 14, 15, 16]),
                pinky: this.isFingerExtended(landmarks, [17, 18, 19, 20]),
                
                // Hand orientation
                palmNormal: this.calculatePalmNormal(landmarks),
                
                // Hand position
                palmCenter: this.calculatePalmCenter(landmarks),
                
                // Finger distances
                fingerDistances: this.calculateFingerDistances(landmarks),
                
                // Angles between fingers
                fingerAngles: this.calculateFingerAngles(landmarks)
            };

            return features;

        } catch (error) {
            console.error('Feature extraction error:', error);
            return null;
        }
    }

    isFingerExtended(landmarks, fingerIndices) {
        try {
            // Simple heuristic: finger is extended if tip is further from wrist than base
            const wrist = landmarks[0];
            const base = landmarks[fingerIndices[0]];
            const tip = landmarks[fingerIndices[3]];

            const baseDistance = this.distance(wrist, base);
            const tipDistance = this.distance(wrist, tip);

            return tipDistance > baseDistance * 1.2;

        } catch (error) {
            return false;
        }
    }

    calculatePalmNormal(landmarks) {
        try {
            // Calculate palm normal using three points on the palm
            const p1 = landmarks[0];  // Wrist
            const p2 = landmarks[5];  // Index base
            const p3 = landmarks[17]; // Pinky base

            const v1 = this.subtract(p2, p1);
            const v2 = this.subtract(p3, p1);

            return this.cross(v1, v2);

        } catch (error) {
            return { x: 0, y: 0, z: 1 };
        }
    }

    calculatePalmCenter(landmarks) {
        try {
            // Calculate center of palm using key landmarks
            const palmLandmarks = [0, 5, 9, 13, 17];
            let sum = { x: 0, y: 0, z: 0 };

            palmLandmarks.forEach(index => {
                const landmark = landmarks[index];
                sum.x += landmark.x;
                sum.y += landmark.y;
                sum.z += landmark.z;
            });

            return {
                x: sum.x / palmLandmarks.length,
                y: sum.y / palmLandmarks.length,
                z: sum.z / palmLandmarks.length
            };

        } catch (error) {
            return { x: 0, y: 0, z: 0 };
        }
    }

    calculateFingerDistances(landmarks) {
        try {
            const distances = {};
            const fingers = {
                thumb: [1, 2, 3, 4],
                index: [5, 6, 7, 8],
                middle: [9, 10, 11, 12],
                ring: [13, 14, 15, 16],
                pinky: [17, 18, 19, 20]
            };

            Object.keys(fingers).forEach(finger => {
                const indices = fingers[finger];
                const tip = landmarks[indices[3]];
                const base = landmarks[indices[0]];
                
                distances[finger] = this.distance(tip, base);
            });

            return distances;

        } catch (error) {
            return {};
        }
    }

    calculateFingerAngles(landmarks) {
        try {
            const angles = {};
            
            // Calculate angles between adjacent fingers
            const fingerTips = [
                landmarks[4],   // Thumb tip
                landmarks[8],   // Index tip
                landmarks[12],  // Middle tip
                landmarks[16],  // Ring tip
                landmarks[20]   // Pinky tip
            ];

            for (let i = 0; i < fingerTips.length - 1; i++) {
                const angle = this.calculateAngle(
                    landmarks[0], // Wrist
                    fingerTips[i],
                    fingerTips[i + 1]
                );
                
                angles[`finger_${i}_to_${i + 1}`] = angle;
            }

            return angles;

        } catch (error) {
            return {};
        }
    }

    recognizeGesture(features) {
        try {
            if (!features) return null;

            // Simple gesture recognition based on finger patterns
            // In a real implementation, this would use a trained ML model
            
            const gesture = this.classifyGesture(features);
            
            // Update gesture history
            this.gestureHistory.push(gesture);
            if (this.gestureHistory.length > this.maxHistory) {
                this.gestureHistory.shift();
            }

            // Get most common gesture from history (smoothing)
            const smoothedGesture = this.getMostCommonGesture();
            
            if (smoothedGesture !== this.currentGesture) {
                this.currentGesture = smoothedGesture;
                this.confidence = this.calculateConfidence();
                
                return {
                    gesture: this.currentGesture,
                    confidence: this.confidence,
                    features: features
                };
            }

            return null;

        } catch (error) {
            console.error('Gesture recognition error:', error);
            return null;
        }
    }

    classifyGesture(features) {
        // Simple rule-based gesture classification
        // This would be replaced with a trained ML model in production
        
        const { thumb, index, middle, ring, pinky } = features;
        
        // Common gestures
        if (!thumb && !index && !middle && !ring && !pinky) {
            return "fist";
        }
        
        if (thumb && index && !middle && !ring && !pinky) {
            return "point";
        }
        
        if (thumb && index && middle && ring && pinky) {
            return "open_hand";
        }
        
        if (!thumb && index && middle && ring && !pinky) {
            return "three_fingers";
        }
        
        if (!thumb && index && middle && !ring && !pinky) {
            return "peace";
        }
        
        if (thumb && !index && !middle && !ring && !pinky) {
            return "thumbs_up";
        }
        
        if (!thumb && index && !middle && !ring && !pinky) {
            return "point_index";
        }
        
        return "unknown";
    }

    getMostCommonGesture() {
        if (this.gestureHistory.length === 0) return "";
        
        const counts = {};
        this.gestureHistory.forEach(gesture => {
            counts[gesture] = (counts[gesture] || 0) + 1;
        });
        
        let maxCount = 0;
        let mostCommon = "";
        
        Object.keys(counts).forEach(gesture => {
            if (counts[gesture] > maxCount) {
                maxCount = counts[gesture];
                mostCommon = gesture;
            }
        });
        
        return mostCommon;
    }

    calculateConfidence() {
        if (this.gestureHistory.length === 0) return 0.0;
        
        const currentGesture = this.currentGesture;
        const count = this.gestureHistory.filter(g => g === currentGesture).length;
        
        return count / this.gestureHistory.length;
    }

    // Utility functions
    distance(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = p1.z - p2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    subtract(p1, p2) {
        return {
            x: p1.x - p2.x,
            y: p1.y - p2.y,
            z: p1.z - p2.z
        };
    }

    cross(v1, v2) {
        return {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
        };
    }

    calculateAngle(p1, p2, p3) {
        const v1 = this.subtract(p1, p2);
        const v2 = this.subtract(p3, p2);
        
        const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
        
        const cosAngle = dot / (mag1 * mag2);
        return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
    }

    stop() {
        this.isProcessing = false;
        
        // Stop camera
        if (this.videoElement && this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
        
        console.log('Gesture Recognition stopped');
    }

    handleError(error) {
        console.error('Gesture Recognition Error:', error);
        if (this.onError) {
            this.onError(error);
        }
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        
        if (this.hands) {
            this.hands.setOptions({
                maxNumHands: this.settings.maxNumHands,
                modelComplexity: this.settings.modelComplexity,
                minDetectionConfidence: this.settings.detectionConfidence,
                minTrackingConfidence: this.settings.trackingConfidence
            });
        }
    }

    getCurrentGesture() {
        return {
            gesture: this.currentGesture,
            confidence: this.confidence,
            history: [...this.gestureHistory]
        };
    }
}

// Load MediaPipe Hands script
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
script.onload = () => {
    console.log('MediaPipe Hands loaded');
};
document.head.appendChild(script);

// Initialize gesture recognition when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Create global instance
    window.gestureRecognition = new GestureRecognition();
    console.log('Gesture Recognition system ready');
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GestureRecognition;
}
