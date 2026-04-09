#!/bin/bash
# ==============================================================
# Trading Journal Pro - macOS Setup & Build Script
# For Apple Silicon (M1/M2/M3/M4) Macs
#
# Usage: bash scripts/setup_macos.sh
# ==============================================================

set -e  # Exit on any error

APP_NAME="TradingJournalPro"
PYTHON_VERSION="3.11"
NODE_VERSION="18"

# --- Colors for output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo ""
    echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
}

print_success() {
    echo -e "${GREEN}  ✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}  ⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}  ✗ $1${NC}"
}

# --- Navigate to project root ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"
echo "Working directory: $PROJECT_DIR"

# --- Step 1: Check/Install Homebrew ---
print_step "Checking Homebrew"

if command -v brew &> /dev/null; then
    print_success "Homebrew is installed"
else
    print_warning "Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add Homebrew to PATH for Apple Silicon Macs
    if [[ -f /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    print_success "Homebrew installed"
fi

# --- Step 2: Install Python ---
print_step "Checking Python"

if command -v python3 &> /dev/null; then
    CURRENT_PYTHON=$(python3 --version 2>&1 | awk '{print $2}')
    print_success "Python $CURRENT_PYTHON found"
else
    print_warning "Python not found. Installing via Homebrew..."
    brew install python
    print_success "Python installed"
fi

# --- Step 3: Install Node.js ---
print_step "Checking Node.js"

if command -v node &> /dev/null; then
    CURRENT_NODE=$(node --version)
    print_success "Node.js $CURRENT_NODE found"
else
    print_warning "Node.js not found. Installing via Homebrew..."
    brew install node
    print_success "Node.js installed"
fi

# --- Step 4: Create Virtual Environment ---
print_step "Setting Up Python Virtual Environment"

if [[ -d "venv" ]]; then
    print_success "Virtual environment already exists"
else
    python3 -m venv venv
    print_success "Virtual environment created"
fi

# Activate virtual environment
source venv/bin/activate
print_success "Virtual environment activated"

# --- Step 5: Install Backend Dependencies ---
print_step "Installing Backend Dependencies"

pip install --upgrade pip
pip install -r backend/requirements.txt
pip install pyinstaller
print_success "Backend dependencies installed"

# --- Step 6: Install Frontend Dependencies ---
print_step "Installing Frontend Dependencies"

cd frontend
npm install
cd ..
print_success "Frontend dependencies installed"

# --- Step 7: Generate macOS Icon (.icns) ---
print_step "Generating macOS Icon"

ICON_SRC="icons/app_512.png"
ICON_OUT="icons/app.icns"
ICONSET_DIR="TradingJournalPro.iconset"

if [[ -f "$ICON_OUT" ]]; then
    print_success "Icon already exists: $ICON_OUT"
elif [[ -f "$ICON_SRC" ]]; then
    mkdir -p "$ICONSET_DIR"
    sips -z 16 16     "$ICON_SRC" --out "$ICONSET_DIR/icon_16x16.png"     > /dev/null 2>&1
    sips -z 32 32     "$ICON_SRC" --out "$ICONSET_DIR/icon_16x16@2x.png"  > /dev/null 2>&1
    sips -z 32 32     "$ICON_SRC" --out "$ICONSET_DIR/icon_32x32.png"     > /dev/null 2>&1
    sips -z 64 64     "$ICON_SRC" --out "$ICONSET_DIR/icon_32x32@2x.png"  > /dev/null 2>&1
    sips -z 128 128   "$ICON_SRC" --out "$ICONSET_DIR/icon_128x128.png"   > /dev/null 2>&1
    sips -z 256 256   "$ICON_SRC" --out "$ICONSET_DIR/icon_128x128@2x.png"> /dev/null 2>&1
    sips -z 256 256   "$ICON_SRC" --out "$ICONSET_DIR/icon_256x256.png"   > /dev/null 2>&1
    sips -z 512 512   "$ICON_SRC" --out "$ICONSET_DIR/icon_256x256@2x.png"> /dev/null 2>&1
    cp "$ICON_SRC"                       "$ICONSET_DIR/icon_512x512.png"
    iconutil -c icns "$ICONSET_DIR" -o "$ICON_OUT"
    rm -rf "$ICONSET_DIR"
    print_success "Icon generated: $ICON_OUT"
else
    print_warning "Source icon not found: $ICON_SRC — app will use default macOS icon"
fi

# --- Step 8: Build the Application ---
print_step "Building Application"

python build_app.py --target macos

# --- Step 9: Post-Build ---
print_step "Setup Complete!"

APP_PATH="dist/${APP_NAME}.app"

if [[ -d "$APP_PATH" ]]; then
    print_success "Application built successfully: $APP_PATH"

    # Remove quarantine attribute
    xattr -cr "$APP_PATH" 2>/dev/null || true
    print_success "Quarantine attributes cleared"

    echo ""
    echo -e "${GREEN}  To run the application:${NC}"
    echo "    open $APP_PATH"
    echo ""

    # Ask to copy to Applications
    echo -e "${YELLOW}  Copy to /Applications? (y/n)${NC}"
    read -r REPLY
    if [[ "$REPLY" =~ ^[Yy]$ ]]; then
        cp -R "$APP_PATH" /Applications/
        print_success "Copied to /Applications/${APP_NAME}.app"
        echo "    You can now open it from Launchpad or Spotlight."
    fi
else
    print_error "Build failed - .app not found at $APP_PATH"
    exit 1
fi

echo ""
print_success "All done! 🎉"
echo ""
