/**
 * SignSense AR - 3D Avatar Controller
 * Controls the 3D avatar for sign language animation
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class AvatarController {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('Avatar container not found:', containerId);
            return;
        }

        this.init();
        this.setupEventListeners();
        this.loadAvatar();
    }

    init() {
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);
        this.scene.fog = new THREE.Fog(0x0a0a0a, 10, 50);

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.6, 3);

        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true 
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        
        this.container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 1;
        this.controls.maxDistance = 10;
        this.controls.maxPolarAngle = Math.PI / 2;

        // Lighting
        this.setupLighting();

        // Animation state
        this.animations = {};
        this.currentAnimation = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
        
        // Avatar model
        this.avatar = null;
        this.bones = {};
        
        // Animation queue
        this.animationQueue = [];
        this.isAnimating = false;

        // Start render loop
        this.animate();
    }

    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);

        // Main directional light
        const mainLight = new THREE.DirectionalLight(0xffffff, 1);
        mainLight.position.set(5, 10, 5);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 50;
        mainLight.shadow.camera.left = -10;
        mainLight.shadow.camera.right = 10;
        mainLight.shadow.camera.top = 10;
        mainLight.shadow.camera.bottom = -10;
        this.scene.add(mainLight);

        // Fill light
        const fillLight = new THREE.DirectionalLight(0x4a90e2, 0.3);
        fillLight.position.set(-5, 5, -5);
        this.scene.add(fillLight);

        // Rim light
        const rimLight = new THREE.DirectionalLight(0x8b5cf6, 0.2);
        rimLight.position.set(0, 5, -10);
        this.scene.add(rimLight);

        // Point lights for ambiance
        const pointLight1 = new THREE.PointLight(0x3b82f6, 0.5, 20);
        pointLight1.position.set(3, 2, 3);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0x8b5cf6, 0.3, 20);
        pointLight2.position.set(-3, 2, -3);
        this.scene.add(pointLight2);
    }

    async loadAvatar() {
        try {
            // Show loading state
            this.showLoadingState();

            // Create a simple avatar using Three.js primitives
            // In a real implementation, you would load a 3D model
            this.createSimpleAvatar();

            // Hide loading state
            this.hideLoadingState();

            console.log('Avatar loaded successfully');
            
        } catch (error) {
            console.error('Failed to load avatar:', error);
            this.showErrorState(error.message);
        }
    }

    createSimpleAvatar() {
        // Create a simple humanoid avatar using Three.js primitives
        const avatarGroup = new THREE.Group();

        // Materials
        const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xfdbcb4 });
        const clothesMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

        // Head
        const headGeometry = new THREE.SphereGeometry(0.15, 32, 32);
        const head = new THREE.Mesh(headGeometry, skinMaterial);
        head.position.set(0, 1.6, 0);
        head.castShadow = true;
        avatarGroup.add(head);

        // Body
        const bodyGeometry = new THREE.CylinderGeometry(0.2, 0.3, 0.6, 32);
        const body = new THREE.Mesh(bodyGeometry, clothesMaterial);
        body.position.set(0, 1.2, 0);
        body.castShadow = true;
        avatarGroup.add(body);

        // Arms
        const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 16);
        
        // Left arm
        const leftArm = new THREE.Mesh(armGeometry, skinMaterial);
        leftArm.position.set(-0.35, 1.2, 0);
        leftArm.castShadow = true;
        avatarGroup.add(leftArm);

        // Right arm
        const rightArm = new THREE.Mesh(armGeometry, skinMaterial);
        rightArm.position.set(0.35, 1.2, 0);
        rightArm.castShadow = true;
        avatarGroup.add(rightArm);

        // Legs
        const legGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.8, 16);
        
        // Left leg
        const leftLeg = new THREE.Mesh(legGeometry, clothesMaterial);
        leftLeg.position.set(-0.15, 0.4, 0);
        leftLeg.castShadow = true;
        avatarGroup.add(leftLeg);

        // Right leg
        const rightLeg = new THREE.Mesh(legGeometry, clothesMaterial);
        rightLeg.position.set(0.15, 0.4, 0);
        rightLeg.castShadow = true;
        avatarGroup.add(rightLeg);

        // Store reference to avatar parts for animation
        this.avatar = avatarGroup;
        this.avatarParts = {
            head: head,
            body: body,
            leftArm: leftArm,
            rightArm: rightArm,
            leftLeg: leftLeg,
            rightLeg: rightLeg
        };

        // Add to scene
        this.scene.add(avatarGroup);

        // Create animation mixer
        this.mixer = new THREE.AnimationMixer(avatarGroup);

        // Create basic animations
        this.createBasicAnimations();
    }

    createBasicAnimations() {
        // Create basic sign animations
        this.animations = {
            idle: this.createIdleAnimation(),
            hello: this.createHelloAnimation(),
            thank_you: this.createThankYouAnimation(),
            please: this.createPleaseAnimation(),
            yes: this.createYesAnimation(),
            no: this.createNoAnimation(),
            help: this.createHelpAnimation(),
            sorry: this.createSorryAnimation()
        };
    }

    createIdleAnimation() {
        // Simple idle animation
        const times = [0, 1, 2];
        const values = [
            0, 0, 0,  // Initial position
            0.05, 0, 0,  // Slight movement
            0, 0, 0   // Back to initial
        ];

        const track = new THREE.VectorKeyframeTrack(
            '.position',
            times,
            values
        );

        const clip = new THREE.AnimationClip('idle', 2, [track]);
        return clip;
    }

    createHelloAnimation() {
        // Waving animation for "hello"
        const times = [0, 0.5, 1, 1.5, 2];
        const values = [
            0.35, 1.2, 0,  // Start position
            0.35, 1.8, 0.2,  // Arm up
            0.35, 1.8, -0.2, // Wave
            0.35, 1.8, 0.2,  // Wave back
            0.35, 1.2, 0    // Rest position
        ];

        const track = new THREE.VectorKeyframeTrack(
            '.rightArm.position',
            times,
            values
        );

        const clip = new THREE.AnimationClip('hello', 2, [track]);
        return clip;
    }

    createThankYouAnimation() {
        // Both hands forward for "thank you"
        const times = [0, 0.5, 1, 1.5, 2];
        
        const rightArmValues = [
            0.35, 1.2, 0,   // Start
            0.5, 1.2, 0.3,  // Forward
            0.5, 1.2, 0.3,  // Hold
            0.35, 1.2, 0,   // Back
            0.35, 1.2, 0    // Rest
        ];

        const leftArmValues = [
            -0.35, 1.2, 0,  // Start
            -0.5, 1.2, 0.3, // Forward
            -0.5, 1.2, 0.3, // Hold
            -0.35, 1.2, 0,  // Back
            -0.35, 1.2, 0   // Rest
        ];

        const rightTrack = new THREE.VectorKeyframeTrack(
            '.rightArm.position',
            times,
            rightArmValues
        );

        const leftTrack = new THREE.VectorKeyframeTrack(
            '.leftArm.position',
            times,
            leftArmValues
        );

        const clip = new THREE.AnimationClip('thank_you', 2, [rightTrack, leftTrack]);
        return clip;
    }

    createPleaseAnimation() {
        // Open palm gesture for "please"
        const times = [0, 0.5, 1, 1.5, 2];
        const values = [
            0.35, 1.2, 0,   // Start
            0.35, 1.0, 0.2, // Down and forward
            0.35, 1.0, 0.2, // Hold
            0.35, 1.2, 0,   // Back
            0.35, 1.2, 0    // Rest
        ];

        const track = new THREE.VectorKeyframeTrack(
            '.rightArm.position',
            times,
            values
        );

        const clip = new THREE.AnimationClip('please', 2, [track]);
        return clip;
    }

    createYesAnimation() {
        // Nodding head for "yes"
        const times = [0, 0.25, 0.5, 0.75, 1];
        const values = [
            0, 1.6, 0,    // Center
            0, 1.65, 0,   // Up
            0, 1.6, 0,    // Center
            0, 1.65, 0,   // Up again
            0, 1.6, 0     // Center
        ];

        const track = new THREE.VectorKeyframeTrack(
            '.head.position',
            times,
            values
        );

        const clip = new THREE.AnimationClip('yes', 1, [track]);
        return clip;
    }

    createNoAnimation() {
        // Head shake for "no"
        const times = [0, 0.25, 0.5, 0.75, 1];
        const values = [
            0, 1.6, 0,    // Center
            -0.1, 1.6, 0,  // Left
            0.1, 1.6, 0,   // Right
            -0.1, 1.6, 0,  // Left
            0, 1.6, 0     // Center
        ];

        const track = new THREE.VectorKeyframeTrack(
            '.head.position',
            times,
            values
        );

        const clip = new THREE.AnimationClip('no', 1, [track]);
        return clip;
    }

    createHelpAnimation() {
        // Raised both hands for "help"
        const times = [0, 0.5, 1, 1.5, 2];
        
        const rightArmValues = [
            0.35, 1.2, 0,   // Start
            0.35, 1.8, 0,   // Up
            0.35, 1.8, 0,   // Hold
            0.35, 1.2, 0,   // Down
            0.35, 1.2, 0    // Rest
        ];

        const leftArmValues = [
            -0.35, 1.2, 0,  // Start
            -0.35, 1.8, 0,  // Up
            -0.35, 1.8, 0,  // Hold
            -0.35, 1.2, 0,  // Down
            -0.35, 1.2, 0   // Rest
        ];

        const rightTrack = new THREE.VectorKeyframeTrack(
            '.rightArm.position',
            times,
            rightArmValues
        );

        const leftTrack = new THREE.VectorKeyframeTrack(
            '.leftArm.position',
            times,
            leftArmValues
        );

        const clip = new THREE.AnimationClip('help', 2, [rightTrack, leftTrack]);
        return clip;
    }

    createSorryAnimation() {
        // Hand to chest for "sorry"
        const times = [0, 0.5, 1, 1.5, 2];
        const values = [
            0.35, 1.2, 0,   // Start
            0.15, 1.2, 0,   // To chest
            0.15, 1.2, 0,   // Hold
            0.35, 1.2, 0,   // Back
            0.35, 1.2, 0    // Rest
        ];

        const track = new THREE.VectorKeyframeTrack(
            '.rightArm.position',
            times,
            values
        );

        const clip = new THREE.AnimationClip('sorry', 2, [track]);
        return clip;
    }

    animateText(text) {
        if (!this.avatar) {
            console.warn('Avatar not loaded yet');
            return;
        }

        // Process text and queue animations
        const words = text.toUpperCase().split(/\s+/);
        
        // Clear current queue
        this.animationQueue = [];

        // Map words to animations
        words.forEach(word => {
            const animation = this.mapWordToAnimation(word);
            if (animation) {
                this.animationQueue.push(animation);
            }
        });

        // Start animation queue if not already running
        if (!this.isAnimating) {
            this.processAnimationQueue();
        }
    }

    mapWordToAnimation(word) {
        // Map common words to animations
        const wordMap = {
            'HELLO': 'hello',
            'HI': 'hello',
            'HEY': 'hello',
            'THANK': 'thank_you',
            'THANKS': 'thank_you',
            'PLEASE': 'please',
            'YES': 'yes',
            'YEAH': 'yes',
            'NO': 'no',
            'NOPE': 'no',
            'HELP': 'help',
            'SORRY': 'sorry',
            'APOLOGIZE': 'sorry'
        };

        return wordMap[word] || null;
    }

    async processAnimationQueue() {
        if (this.animationQueue.length === 0) {
            this.isAnimating = false;
            this.playAnimation('idle');
            return;
        }

        this.isAnimating = true;
        const animationName = this.animationQueue.shift();

        // Play the animation
        this.playAnimation(animationName);

        // Wait for animation to complete
        await this.waitForAnimation(animationName);

        // Process next animation
        this.processAnimationQueue();
    }

    playAnimation(name) {
        if (!this.animations[name]) {
            console.warn(`Animation '${name}' not found`);
            return;
        }

        // Stop current animation
        if (this.currentAnimation) {
            this.currentAnimation.stop();
        }

        // Play new animation
        const action = this.mixer.clipAction(this.animations[name]);
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
        action.play();

        this.currentAnimation = action;
        console.log(`Playing animation: ${name}`);
    }

    waitForAnimation(name) {
        return new Promise(resolve => {
            const duration = this.animations[name].duration * 1000; // Convert to milliseconds
            setTimeout(resolve, duration);
        });
    }

    showLoadingState() {
        // Show loading indicator
        const loadingElement = document.createElement('div');
        loadingElement.id = 'avatar-loading';
        loadingElement.innerHTML = `
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: white;">
                <div class="loading"></div>
                <p style="margin-top: 20px;">Loading 3D Avatar...</p>
            </div>
        `;
        this.container.appendChild(loadingElement);
    }

    hideLoadingState() {
        // Hide loading indicator
        const loadingElement = document.getElementById('avatar-loading');
        if (loadingElement) {
            loadingElement.remove();
        }
    }

    showErrorState(message) {
        // Show error message
        this.hideLoadingState();
        const errorElement = document.createElement('div');
        errorElement.id = 'avatar-error';
        errorElement.innerHTML = `
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #ef4444;">
                <span class="material-icons-round" style="font-size: 48px;">error</span>
                <p style="margin-top: 20px;">Failed to load avatar</p>
                <p style="font-size: 14px; opacity: 0.7;">${message}</p>
            </div>
        `;
        this.container.appendChild(errorElement);
    }

    setupEventListeners() {
        // Handle window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        });
    }

    handleResize() {
        if (!this.container) return;

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    pause() {
        // Pause animations when page is hidden
        if (this.mixer) {
            this.mixer.timeScale = 0;
        }
    }

    resume() {
        // Resume animations when page is visible
        if (this.mixer) {
            this.mixer.timeScale = 1;
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(delta);
        }

        // Update controls
        if (this.controls) {
            this.controls.update();
        }

        // Render scene
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    dispose() {
        // Clean up resources
        if (this.renderer) {
            this.renderer.dispose();
        }

        if (this.mixer) {
            this.mixer.stopAllAction();
        }

        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        document.removeEventListener('visibilitychange', this.pause);
    }
}

// Initialize avatar controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Look for avatar containers
    const avatarContainers = ['three-canvas', 'avatar-container'];
    
    avatarContainers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container) {
            window.avatarController = new AvatarController(containerId);
            console.log(`Avatar controller initialized for container: ${containerId}`);
        }
    });
});

// Make it globally available
window.AvatarController = AvatarController;

// Export for module usage
export default AvatarController;
