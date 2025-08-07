#!/bin/bash

# Activate virtual environment
source venv/bin/activate

# Set environment variables to disable tracing
export OPENAI_ENABLE_TRACING=false
export OPENAI_AGENTS_ENABLE_TRACING=false
export OPENAI_AGENTS_DISABLE_TRACING=1
export OTEL_SDK_DISABLED=true
export OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=false

# Load .env file
export $(cat .env | grep -v '^#' | xargs)

# Start the server
echo "Starting middle layer server on port 3001..."
echo "Tracing is disabled to avoid span_data.result errors"
python -m uvicorn server:app --host 0.0.0.0 --port 3001 --reload