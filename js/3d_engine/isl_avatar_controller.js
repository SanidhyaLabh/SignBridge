/**
 * SignSense AR — ISL Avatar Controller
 * Powered by the Speech-to-Indian-Sign-Language-using-3D-Avatar-Animations engine.
 * Uses real mixamorig-rigged GLB models (xbot/ybot) with per-bone rotation animations.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { defaultPose } from '../isl_engine/Animations/defaultPose.js';

class ISLAvatarController {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error('[ISLAvatar] Container not found:', containerId);
      return;
    }

    // Engine state — mirrors the original repo's `state` object
    this.state = {
      text: '',
      bot: 'ybot',
      speed: 0.1,
      baseSpeed: 0.1,
      speedMultiplier: 1.0,
      pause: 800,
      animations: [],
      scene: null,
      camera: null,
      renderer: null,
      avatar: null,
      flag: false,
      pending: false,
      textTimer: false,
      characters: [],
      alphabetModules: {},
      wordModules: {},
      numberModules: {},
      wordList: [],
      numberList: ['0','1','2','3','4','5','6','7','8','9'],
    };

    // Bind animate so it can be called from state
    this.state.animate = this._animateLoop.bind(this);

    this._initThree();
    this._loadModules().then(() => {
      this._loadModel(`js/isl_engine/Models/${this.state.bot}/${this.state.bot}.glb`);
    });

    window.addEventListener('resize', () => this._handleResize());
  }

  // ─── Three.js Init ────────────────────────────────────────────────────────

  _initThree() {
    this.container.innerHTML = '';

    const s = this.state;
    s.scene = new THREE.Scene();
    s.scene.background = null; // transparent — container CSS handles bg

    s.camera = new THREE.PerspectiveCamera(
      30,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    s.camera.position.set(0, 1.6, 2.2);
    s.camera.lookAt(0, 1.2, 0);

    s.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    s.renderer.setPixelRatio(window.devicePixelRatio);
    s.renderer.shadowMap.enabled = true;
    s.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    s.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(s.renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    s.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(0, 5, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    s.scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0x4a90e2, 0.3);
    fillLight.position.set(-4, 3, -4);
    s.scene.add(fillLight);

    // Ground plane
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshLambertMaterial({ color: 0x1e293b })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    s.scene.add(ground);

    // Start render loop immediately (renders scene before model loads)
    this._renderLoop();
  }

  _renderLoop() {
    requestAnimationFrame(() => this._renderLoop());
    const s = this.state;
    if (s.scene && s.camera && s.renderer) {
      s.renderer.render(s.scene, s.camera);
    }
  }

  // ─── Animation Loop (bone-rotation engine from original repo) ─────────────

  _animateLoop() {
    const s = this.state;
    if (!s.scene || !s.camera || !s.renderer) return;

    if (!s.avatar || s.animations.length === 0) {
      s.pending = false;
      return;
    }

    const currentAnim = s.animations[0];

    if (currentAnim && currentAnim.length) {
      if (!s.flag) {
        if (currentAnim[0] === 'add-text') {
          this._addTextStep(currentAnim);
        } else {
          this._processBoneAnimation(currentAnim, s);
        }
      }
    } else {
      if (!s.flag) {
        s.flag = true;
        setTimeout(() => {
          s.flag = false;
          s.animations.shift();
          if (s.animations.length > 0) {
            requestAnimationFrame(() => this.state.animate());
          } else {
            s.pending = false;
          }
        }, s.pause / s.speedMultiplier);
      }
    }

    if (s.animations.length > 0) {
      requestAnimationFrame(() => this.state.animate());
    }
  }

  _addTextStep(animCommand) {
    const s = this.state;
    if (!s.textTimer) {
      // Emit text update event for UI
      const evt = new CustomEvent('islTextUpdate', { detail: animCommand[1] });
      document.dispatchEvent(evt);
      s.textTimer = true;
      setTimeout(() => {
        s.textTimer = false;
        s.animations.shift();
      }, 100 / s.speedMultiplier);
    }
  }

  _processBoneAnimation(animSteps, ctx) {
    for (let i = 0; i < animSteps.length;) {
      const [boneName, action, axis, limit, sign] = animSteps[i];
      const bone = ctx.avatar.getObjectByName(boneName);
      if (bone) {
        if (sign === '+' && bone[action][axis] < limit) {
          bone[action][axis] = Math.min(bone[action][axis] + ctx.speed, limit);
          i++;
        } else if (sign === '-' && bone[action][axis] > limit) {
          bone[action][axis] = Math.max(bone[action][axis] - ctx.speed, limit);
          i++;
        } else {
          animSteps.splice(i, 1);
        }
      } else {
        animSteps.splice(i, 1);
      }
    }
  }

  // ─── Module Loading ────────────────────────────────────────────────────────

  _getAnimFn(moduleObj, key) {
    if (moduleObj[key] && typeof moduleObj[key] === 'function') return moduleObj[key];
    if (moduleObj.default && typeof moduleObj.default === 'function') return moduleObj.default;
    for (const k in moduleObj) {
      if (typeof moduleObj[k] === 'function') return moduleObj[k];
    }
    return null;
  }

  async _loadModules() {
    // Alphabets A–Z
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const ch of alphabet) {
      try {
        const mod = await import(`../isl_engine/Animations/Alphabets/${ch}.js`);
        const fn = this._getAnimFn(mod, ch);
        if (fn) this.state.alphabetModules[ch] = fn;
      } catch (e) {
        console.warn(`[ISLAvatar] No animation for letter ${ch}`);
      }
    }

    // Words
    const words = ['HOME', 'TIME', 'YOU', 'PERSON'];
    for (const word of words) {
      try {
        // The repo stores word files as lowercase filenames
        const mod = await import(`../isl_engine/Animations/Words/${word}.js`);
        const fn = this._getAnimFn(mod, word);
        if (fn) {
          this.state.wordModules[word] = fn;
          this.state.wordList.push(word);
        }
      } catch (e) {
        console.warn(`[ISLAvatar] No animation for word ${word}`);
      }
    }

    // Numbers 0–9
    for (const num of '0123456789') {
      try {
        const mod = await import(`../isl_engine/Animations/Numbers/${num}.js`);
        const fn = this._getAnimFn(mod, num);
        if (fn) this.state.numberModules[num] = fn;
      } catch (e) {
        console.warn(`[ISLAvatar] No animation for number ${num}`);
      }
    }

    console.log('[ISLAvatar] Modules loaded — alphabets:', Object.keys(this.state.alphabetModules).length,
      'words:', this.state.wordList, 'numbers:', Object.keys(this.state.numberModules).length);
  }

  // ─── GLB Model Loading ────────────────────────────────────────────────────

  _loadModel(modelPath) {
    const s = this.state;
    this._showLoading();

    const loader = new GLTFLoader();
    loader.load(
      modelPath,
      (gltf) => {
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            child.frustumCulled = false;
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        if (s.avatar) s.scene.remove(s.avatar);
        s.avatar = gltf.scene;
        s.scene.add(s.avatar);

        // Apply default pose
        try {
          defaultPose(s);
        } catch (err) {
          console.error('[ISLAvatar] defaultPose error:', err);
        }

        this._hideLoading();
        console.log('[ISLAvatar] Model loaded:', modelPath);

        // Emit loaded event
        document.dispatchEvent(new CustomEvent('islAvatarLoaded'));
      },
      (progress) => {
        const pct = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;
        this._updateLoadingProgress(pct);
      },
      (error) => {
        console.error('[ISLAvatar] Failed to load model:', error);
        this._hideLoading();
        this._showError();
      }
    );
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Animate the given text as ISL.
   * Accepts raw English text — will process word-by-word, with word animations
   * for known ISL words and fingerspelling for others.
   */
  animateText(text) {
    if (!this.state.avatar) {
      console.warn('[ISLAvatar] Model not yet loaded');
      return false;
    }

    const s = this.state;
    const processedText = text.toUpperCase()
      .replace(/\bZERO\b/gi, '0').replace(/\bONE\b/gi, '1')
      .replace(/\bTWO\b/gi, '2').replace(/\bTHREE\b/gi, '3')
      .replace(/\bFOUR\b/gi, '4').replace(/\bFIVE\b/gi, '5')
      .replace(/\bSIX\b/gi, '6').replace(/\bSEVEN\b/gi, '7')
      .replace(/\bEIGHT\b/gi, '8').replace(/\bNINE\b/gi, '9');

    const words = processedText.split(/(\d+|\s+)/).filter(w => w.trim() !== '');

    // Clear queue
    s.animations = [];

    // Dispatch clear event
    document.dispatchEvent(new CustomEvent('islTextClear'));

    words.forEach(word => {
      if (/^\d+$/.test(word)) {
        // Number — animate each digit
        [...word].forEach(digit => {
          s.animations.push(['add-text', digit]);
          if (s.numberModules[digit]) s.numberModules[digit](s);
        });
        s.animations.push(['add-text', ' ']);
      } else if (s.wordList.includes(word)) {
        // Known ISL word with dedicated animation
        s.animations.push(['add-text', `${word} `]);
        s.wordModules[word](s);
      } else {
        // Fingerspell letter by letter
        [...word].forEach((ch, i) => {
          const charText = (i === word.length - 1) ? `${ch} ` : ch;
          s.animations.push(['add-text', charText]);
          if (s.alphabetModules[ch]) s.alphabetModules[ch](s);
        });
      }
    });

    // Kick off animation loop
    if (!s.pending && s.animations.length > 0) {
      s.pending = true;
      s.animate();
    }

    return true;
  }

  /** Pause animation playback */
  pause() {
    this.state.speedMultiplier = 0;
  }

  /** Resume animation playback */
  resume() {
    this.state.speedMultiplier = this._savedMultiplier || 1.0;
  }

  /** Set animation speed multiplier */
  setSpeed(multiplier) {
    this._savedMultiplier = multiplier;
    this.state.speedMultiplier = multiplier;
    this.state.speed = this.state.baseSpeed * multiplier;
  }

  /** Stop all animations and clear the queue */
  reset() {
    this.state.animations = [];
    this.state.pending = false;
    this.state.flag = false;
    // Reset to default pose
    if (this.state.avatar) {
      try { defaultPose(this.state); } catch (e) { /* ignore */ }
    }
  }

  // ─── Resize & UI Helpers ──────────────────────────────────────────────────

  _handleResize() {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const s = this.state;
    if (s.camera) {
      s.camera.aspect = w / h;
      s.camera.updateProjectionMatrix();
    }
    if (s.renderer) s.renderer.setSize(w, h);
  }

  _showLoading() {
    let el = document.getElementById('isl-model-loading');
    if (!el) {
      el = document.createElement('div');
      el.id = 'isl-model-loading';
      el.style.cssText = `
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; z-index: 10;
        background: rgba(15,23,42,0.8); color: #94a3b8; gap: 16px;
        border-radius: inherit;
      `;
      el.innerHTML = `
        <div style="width:48px;height:48px;border:3px solid rgba(255,255,255,0.1);border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;"></div>
        <p style="font-family:Outfit,sans-serif;font-size:0.95rem;margin:0;">Loading 3D Avatar...</p>
        <p id="isl-load-pct" style="font-size:0.8rem;margin:0;opacity:0.6;">0%</p>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      `;
      this.container.style.position = 'relative';
      this.container.appendChild(el);
    }
  }

  _updateLoadingProgress(pct) {
    const el = document.getElementById('isl-load-pct');
    if (el) el.textContent = `${pct}%`;
  }

  _hideLoading() {
    const el = document.getElementById('isl-model-loading');
    if (el) el.remove();
  }

  _showError() {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:12px;
      background:rgba(15,23,42,0.8);color:#f87171;border-radius:inherit;
    `;
    el.innerHTML = `
      <span class="material-icons-round" style="font-size:48px">error_outline</span>
      <p style="font-family:Outfit,sans-serif;margin:0">Failed to load avatar model</p>
      <p style="font-size:0.8rem;color:#94a3b8;margin:0">Run the backend to serve model files</p>
    `;
    this.container.style.position = 'relative';
    this.container.appendChild(el);
  }

  dispose() {
    this.state.animations = [];
    if (this.state.renderer) this.state.renderer.dispose();
    window.removeEventListener('resize', () => this._handleResize());
  }
}

// ─── Auto-initialize ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const candidates = ['three-canvas', 'animationContainer', 'avatar-container'];
  for (const id of candidates) {
    const el = document.getElementById(id);
    if (el) {
      window.islAvatarController = new ISLAvatarController(id);
      console.log('[ISLAvatar] Initialized on container:', id);
      break;
    }
  }
});

window.ISLAvatarController = ISLAvatarController;
export default ISLAvatarController;
