# Use Python 3.11 slim for maximum compatibility with MediaPipe and ML libraries
FROM python:3.11-slim

# Install system dependencies required by MediaPipe and OpenCV (libGLESv2, libGL, etc.)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libgles2 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory to the root of the project
WORKDIR /app

# Copy the entire repository
COPY . /app

# Upgrade pip and install core build tools
RUN pip install --upgrade pip setuptools wheel

# Install all backend requirements
RUN pip install -r backend/requirements.txt

# Download required spaCy models
RUN python -m spacy download en_core_web_sm

# Change the working directory into the backend folder so relative paths (like hand_landmarker.task) work
WORKDIR /app/backend

# Use the PORT environment variable provided by Render, defaulting to 10000
ENV PORT=10000
EXPOSE $PORT

# Start Gunicorn server
CMD gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT app:app
