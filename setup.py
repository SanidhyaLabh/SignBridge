#!/usr/bin/env python3
"""
SignSense AR Setup Script
Automatically installs dependencies and sets up the environment
"""

import subprocess
import sys
import os
from pathlib import Path

def run_command(command, description):
    """Run a command and handle errors"""
    print(f"\n{'='*50}")
    print(f"📦 {description}")
    print(f"{'='*50}")
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed successfully!")
        if result.stdout:
            print(f"Output: {result.stdout}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Error in {description}: {e}")
        if e.stderr:
            print(f"Error details: {e.stderr}")
        return False

def check_python_version():
    """Check if Python version is compatible"""
    print("🐍 Checking Python version...")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 8:
        print(f"✅ Python {version.major}.{version.minor}.{version.micro} is compatible")
        return True
    else:
        print(f"❌ Python {version.major}.{version.minor}.{version.micro} is not compatible. Requires Python 3.8+")
        return False

def install_python_dependencies():
    """Install Python dependencies"""
    backend_dir = Path("backend")
    requirements_file = backend_dir / "requirements.txt"
    
    if not requirements_file.exists():
        print(f"❌ Requirements file not found: {requirements_file}")
        return False
    
    commands = [
        (f"cd {backend_dir} && pip install --upgrade pip", "Upgrading pip"),
        (f"cd {backend_dir} && pip install -r requirements.txt", "Installing Python dependencies"),
        ("python -m spacy download en_core_web_sm", "Downloading spaCy English model"),
    ]
    
    for command, description in commands:
        if not run_command(command, description):
            return False
    
    return True

def check_node_version():
    """Check if Node.js is available"""
    print("📦 Checking Node.js availability...")
    try:
        result = subprocess.run("node --version", shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ Node.js {result.stdout.strip()} is available")
            return True
        else:
            print("⚠️  Node.js not found. Node.js is optional for this project.")
            return True
    except:
        print("⚠️  Node.js not found. Node.js is optional for this project.")
        return True

def install_node_dependencies():
    """Install Node.js dependencies (optional)"""
    commands = [
        ("npm install", "Installing Node.js dependencies"),
    ]
    
    for command, description in commands:
        if not run_command(command, description):
            print(f"⚠️  {description} failed. Node.js is optional, continuing...")
    
    return True

def create_env_file():
    """Create .env file if it doesn't exist"""
    env_file = Path("backend/.env")
    if env_file.exists():
        print("✅ .env file already exists")
        return True
    
    print("📝 Creating .env file...")
    env_content = """# SignSense AR Environment Variables
FLASK_ENV=development
SECRET_KEY=signsense_ar_secret_key_change_this_in_production
MONGO_URI=mongodb://localhost:27017/signsense_history
"""
    
    try:
        env_file.write_text(env_content)
        print("✅ .env file created successfully")
        return True
    except Exception as e:
        print(f"❌ Failed to create .env file: {e}")
        return False

def verify_installation():
    """Verify that key components are working"""
    print("\n🔍 Verifying installation...")
    
    # Test Python imports
    try:
        import flask
        print("✅ Flask is available")
    except ImportError:
        print("❌ Flask import failed")
        return False
    
    try:
        import cv2
        print("✅ OpenCV is available")
    except ImportError:
        print("❌ OpenCV import failed")
        return False
    
    try:
        import mediapipe as mp
        print("✅ MediaPipe is available")
    except ImportError:
        print("❌ MediaPipe import failed")
        return False
    
    try:
        import spacy
        print("✅ spaCy is available")
    except ImportError:
        print("❌ spaCy import failed")
        return False
    
    return True

def main():
    """Main setup function"""
    print("🚀 SignSense AR Setup Script")
    print("=" * 50)
    
    # Change to project directory
    project_dir = Path(__file__).parent
    os.chdir(project_dir)
    print(f"📁 Working directory: {project_dir.absolute()}")
    
    # Check Python version
    if not check_python_version():
        sys.exit(1)
    
    # Install Python dependencies
    if not install_python_dependencies():
        print("❌ Failed to install Python dependencies")
        sys.exit(1)
    
    # Check Node.js (optional)
    check_node_version()
    
    # Install Node.js dependencies (optional)
    install_node_dependencies()
    
    # Create .env file
    create_env_file()
    
    # Verify installation
    if verify_installation():
        print("\n🎉 Setup completed successfully!")
        print("\n📋 Next steps:")
        print("1. Start the backend server: cd backend && python app.py")
        print("2. Open your browser and navigate to: http://localhost:8000")
        print("3. Or open index.html directly in your browser")
        print("\n📚 For more information, see README.md")
    else:
        print("\n❌ Setup completed with errors. Please check the logs above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
