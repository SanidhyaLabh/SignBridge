# SignBridge AR - Complete Project

**SignSense AR: A Real-Time AI-Powered Sign Language Communication System with AR Simulation**

##  Overview

SignBridge AR is a comprehensive web-based application designed to bridge the communication gap between deaf and hearing individuals. The system enables seamless, real-time interaction by converting speech into sign language and sign language into text and speech.

### Key Features

- **Real-Time Sign Language Recognition** using MediaPipe and CNN models
- **3D Avatar Animation** for text-to-sign conversion
- **Speech Recognition & Text-to-Speech** capabilities
- **AR Glass Mode** for immersive experience
- **Conversation Mode** for two-way communication
- **Modern Glass-morphism UI** with responsive design

##  Project Structure

```
signbridge/
├── index.html                 # Main landing page
├── translate.html             # Sign-to-text translation mode
├── conversation.html          # Two-way conversation mode
├── avatar.html               # 3D avatar viewer
├── ar.html                   # AR glass simulation mode
├── settings.html             # Application settings
├── css/
│   └── styles.css            # Global styles and glass-morphism design
├── js/
│   ├── app.js                # Main application logic
│   ├── gesture_recognition.js # MediaPipe-based gesture recognition
│   └── 3d_engine/
│       └── avatar_controller.js # Three.js 3D avatar system
├── backend/
│   ├── app.py                # Flask server with Socket.IO
│   └── requirements.txt      # Python dependencies
├── 3davatar_repo_use/        # External 3D avatar repository
└── sign_to_text _and_speech/ # External sign recognition repository
```

##  Quick Start

### Prerequisites

- Python 3.8+
- Node.js 16+ (optional, for development)
- Modern web browser with:
  - WebGL support
  - Camera and microphone permissions
  - JavaScript ES6+ support

### Automated Setup (Recommended)

1. **Run the setup script:**
   ```bash
   python setup.py
   ```

2. **Start the application:**
   ```bash
   npm run full-setup
   ```

### Manual Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Download spaCy model:**
   ```bash
   python -m spacy download en_core_web_sm
   ```

4. **Start the Flask server:**
   ```bash
   python app.py
   ```

5. **Open the main application:**
   ```bash
   # Simply open index.html in your browser
   open index.html
   ```

   Or use a local server for better development:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npm start
   ```

6. **Access the application at:**
   ```
   http://localhost:8000
   ```

## 📱Application Modes

### 1. **Home (index.html)**
- Landing page with feature overview
- Navigation to different modes
- Modern glass-morphism design

### 2. **Translate Mode (translate.html)**
- Real-time sign language to text conversion
- Camera feed with hand tracking
- Confidence metrics and emotion detection
- Text-to-speech output

### 3. **Conversation Mode (conversation.html)**
- Split-screen two-way communication
- Left: Sign input with camera
- Right: Voice input with 3D avatar output
- Real-time gesture recognition and avatar animation

### 4. **3D Avatar Mode (avatar.html)**
- Standalone 3D avatar viewer
- Text-to-sign animation
- Speech input support
- Animation controls (play, pause, speed)

### 5. **AR Glass Mode (ar.html)**
- AR smart glasses simulation
- Camera-based text/sign detection
- Floating translation overlays
- Voice input support

### 6. **Settings (settings.html)**
- Camera and device preferences
- Speech and avatar settings
- Recognition parameters
- System status monitoring

## 🛠️ Technology Stack

### Frontend
- **HTML5, CSS3, JavaScript ES6+**
- **Three.js** for 3D avatar rendering
- **MediaPipe** for hand tracking
- **Web Speech API** for speech recognition
- **Socket.IO** for real-time communication
- **Google Fonts & Material Icons**

### Backend
- **Python 3.8+**
- **Flask** web framework
- **Socket.IO** for WebSocket communication
- **OpenCV** for image processing
- **MediaPipe** for hand landmark detection
- **TensorFlow/Keras** for ML models
- **spaCy** for natural language processing
- **NLTK** for text processing

### ML Models
- **CNN-based sign recognition** (from external repository)
- **MediaPipe hand tracking** for real-time gesture detection
- **Text preprocessing** for ISL grammar

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
FLASK_ENV=development
SECRET_KEY=your-secret-key-here
MODEL_PATH=../sign_to_text _and_speech/Sign-Language-To-Text-and-Speech-Conversion-master/cnn8grps_rad1_model.h5
```

### Settings Configuration

Access the settings page to configure:
- Camera preferences and quality
- Speech language and speed
- Avatar rendering quality
- Recognition sensitivity and confidence thresholds

## 🎯 Key Features Explained

### Gesture Recognition System

The system uses MediaPipe for real-time hand tracking and a trained CNN model for sign classification:

```javascript
// Initialize gesture recognition
const gestureRecognition = new GestureRecognition();
await gestureRecognition.start(videoElement, canvasElement);

// Handle detected gestures
gestureRecognition.onGestureDetected = (gesture) => {
    console.log('Detected:', gesture.gesture, 'Confidence:', gesture.confidence);
};
```

### 3D Avatar Animation

Three.js-based avatar system with pre-defined sign animations:

```javascript
// Animate text with avatar
if (window.avatarController) {
    window.avatarController.animateText("HELLO WORLD");
}
```

### Real-Time Communication

Socket.IO enables seamless communication between frontend and backend:

```javascript
// Connect to backend
const socket = io('http://localhost:5000');

// Send video frames for processing
socket.emit('video_frame', { image: imageData });

// Receive predictions
socket.on('predictions', (data) => {
    updateTranslation(data.word, data.confidence);
});
```

## 🔌 API Endpoints

### Backend API

- `GET /api/status` - System status
- `POST /api/translate` - Text to sign translation
- `POST /api/speech` - Speech to text processing

### WebSocket Events

- `video_frame` - Send video frames for processing
- `predictions` - Receive gesture predictions
- `avatar_command` - Control avatar animations
- `hand_status` - Hand detection status

##  Customization

### Adding New Sign Animations

1. Create animation clips in `js/3d_engine/avatar_controller.js`
2. Add to the `animations` object
3. Map words to animations in `mapWordToAnimation()`

### Modifying UI Theme

Update CSS variables in `css/styles.css`:

```css
:root {
    --clr-primary: #3B82F6;
    --clr-secondary: #8B5CF6;
    /* ... more variables */
}
```

### Training Custom Models

Replace the existing model in:
```
sign_to_text _and_speech/Sign-Language-To-Text-and-Speech-Conversion-master/cnn8grps_rad1_model.h5
```

##  Troubleshooting

### Common Issues

1. **Camera not working**
   - Check browser permissions
   - Ensure HTTPS (localhost is exempt)
   - Verify camera is not in use by other applications

2. **Backend connection failed**
   - Ensure Flask server is running on port 5000
   - Check for firewall issues
   - Verify Python dependencies

3. **Avatar not loading**
   - Check WebGL support in browser
   - Verify Three.js is loading correctly
   - Check browser console for errors

4. **Speech recognition not working**
   - Check microphone permissions
   - Verify browser supports Web Speech API
   - Try HTTPS if not on localhost

### Debug Mode

Enable debug logging in browser console:

```javascript
// Enable verbose logging
localStorage.setItem('debug', 'true');
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Guidelines

- Follow existing code style
- Add comments for complex logic
- Test on multiple browsers
- Update documentation

## 📄 License

This project combines code from multiple sources:

- Main project: MIT License
- Sign-Kit Avatar: Original repository license
- Sign-to-Text Model: Original repository license

Please check individual repository licenses for specific terms.

## 🙏 Acknowledgments

- **Sign-Kit** for the 3D avatar system foundation
- **Sign-Language-To-Text-and-Speech-Conversion** for the ML model
- **MediaPipe** team for excellent hand tracking
- **Three.js** community for 3D web graphics

##  Support

For issues and questions:

1. Check the troubleshooting section
2. Review existing GitHub issues
3. Create a new issue with detailed information
4. Include browser, OS, and error details

##  Future Enhancements

- [ ] Multi-language support
- [ ] Cloud deployment
- [ ] Mobile app version
- [ ] Advanced emotion detection
- [ ] Custom avatar creation
- [ ] Sign language learning modules
- [ ] Integration with real AR glasses


