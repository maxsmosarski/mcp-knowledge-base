#!/bin/bash

# Kill middle layer server on port 3001

PORT=3001

echo "Killing process on port $PORT..."

# Try to find and kill the process
PID=$(lsof -ti:$PORT 2>/dev/null)

if [ -z "$PID" ]; then
    echo "No process found on port $PORT"
else
    echo "Found process $PID on port $PORT"
    kill -9 $PID 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "Process killed successfully"
    else
        echo "Failed to kill process. You may need to run with sudo:"
        echo "  sudo ./kill.sh"
    fi
fi

# Also kill any python processes running server.py
pkill -f "python.*server.py" 2>/dev/null || true

echo "Done."