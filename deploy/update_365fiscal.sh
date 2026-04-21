#!/bin/bash
# Quick update script for 365 Fiscal
# Run this after pushing changes to GitHub

set -e

APP_DIR="/opt/365_fiscal"
BACKEND_PORT=8089
SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')

echo "Pulling latest changes..."
cd ${APP_DIR}
git pull origin main || git pull origin master

echo "Updating backend..."
cd ${APP_DIR}/backend
source venv/bin/activate
pip install -r requirements.txt
export PYTHONPATH=${APP_DIR}/backend
alembic upgrade head

echo "Rebuilding frontend..."
cd ${APP_DIR}/frontend
npm install
npm run build

echo "Restarting services..."
systemctl restart 365fiscal-backend
systemctl restart nginx

echo "Update complete!"
echo "Backend: http://${SERVER_IP}:8089"
echo "Frontend: http://${SERVER_IP}:8070"
