#!/bin/bash
# FiftyFive Labs – start script (dev/build + run)
# Use ADMIN_TOKEN, IMAGE_API_KEY etc. from env. Never log secrets.

set -e
cd "$(dirname "$0")"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}FiftyFive Labs | AI Studio${NC}"
echo ""

if ! command -v npm &> /dev/null; then
  echo -e "${YELLOW}npm not found. Install Node.js first.${NC}"
  exit 1
fi
if ! command -v python3 &> /dev/null; then
  echo -e "${YELLOW}python3 not found. Install Python first.${NC}"
  exit 1
fi

echo -e "${BLUE}Building frontend...${NC}"
npm run build
echo -e "${GREEN}Build complete.${NC}"
echo ""

echo -e "${BLUE}Starting server...${NC}"
echo -e "${GREEN}Server:     ${NC}http://localhost:${PORT:-8000}"
echo -e "${GREEN}Admin:      ${NC}http://localhost:${PORT:-8000}/admin"
echo -e "${GREEN}API docs:   ${NC}http://localhost:${PORT:-8000}/docs"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

python3 -m uvicorn server.main:app --host 0.0.0.0 --port "${PORT:-8000}"
