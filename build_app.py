"""
Trading Journal Pro - Cross-Platform Build Script
Automatically detects the operating system and builds the appropriate
executable (.exe on Windows, .app on macOS).

Usage:
    python build_app.py              # Auto-detect OS
    python build_app.py --target windows   # Force Windows build
    python build_app.py --target macos     # Force macOS build
"""
import os
import subprocess
import sys
import shutil
import platform
import argparse


# --- Constants ---
APP_NAME = "TradingJournalPro"
SPEC_DIR = "specs"
SPEC_FILES = {
    "windows": os.path.join(SPEC_DIR, "windows.spec"),
    "macos": os.path.join(SPEC_DIR, "macos.spec"),
}


def print_step(step):
    """Display a formatted build step header."""
    print(f"\n{'='*50}")
    print(f"  STEP: {step}")
    print(f"{'='*50}")


def print_info(message):
    """Display an informational message."""
    print(f"  ℹ  {message}")


def print_success(message):
    """Display a success message."""
    print(f"  ✓  {message}")


def print_error(message):
    """Display an error message."""
    print(f"  ✗  {message}")


def run_command(command, cwd=None, shell=True):
    """Execute a shell command and exit on failure."""
    try:
        subprocess.check_call(command, cwd=cwd, shell=shell)
    except subprocess.CalledProcessError:
        print_error(f"Failed to execute: {command}")
        sys.exit(1)


def detect_build_target():
    """Detect the current OS and return the build target name."""
    system = platform.system()
    if system == "Windows":
        return "windows"
    elif system == "Darwin":
        return "macos"
    else:
        print_error(f"Unsupported operating system: {system}")
        print_info("This application supports Windows and macOS only.")
        sys.exit(1)


def parse_arguments():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Build Trading Journal Pro for Windows or macOS"
    )
    parser.add_argument(
        "--target",
        choices=["windows", "macos"],
        default=None,
        help="Force a specific build target (default: auto-detect OS)",
    )
    return parser.parse_args()


def validate_spec_file(spec_path, root_dir):
    """Verify the spec file exists before attempting to build."""
    full_path = os.path.join(root_dir, spec_path)
    if not os.path.exists(full_path):
        print_error(f"Spec file not found: {full_path}")
        print_info(f"Expected spec files in '{SPEC_DIR}/' directory.")
        sys.exit(1)
    return full_path


def build_frontend(frontend_dir):
    """Install dependencies and build the React frontend."""
    print_step("Building Frontend (React + Vite)")

    if not os.path.exists(os.path.join(frontend_dir, "node_modules")):
        print_info("Installing frontend dependencies...")
        run_command("npm install", cwd=frontend_dir)

    print_info("Running production build...")
    run_command("npm run build", cwd=frontend_dir)
    print_success("Frontend built successfully")


def install_backend_deps(backend_dir):
    """Install Python backend dependencies."""
    print_step("Installing Backend Dependencies (Python)")

    requirements_path = os.path.join(backend_dir, "requirements.txt")
    if not os.path.exists(requirements_path):
        print_error(f"requirements.txt not found at: {requirements_path}")
        sys.exit(1)

    run_command(f'{sys.executable} -m pip install -r "{requirements_path}"')

    # Ensure PyInstaller is installed
    try:
        import PyInstaller  # noqa: F401
        print_success("PyInstaller already installed")
    except ImportError:
        print_info("Installing PyInstaller...")
        run_command(f"{sys.executable} -m pip install pyinstaller")

    print_success("Backend dependencies installed")


def clean_build_artifacts(root_dir):
    """Remove previous build and dist directories."""
    print_step("Cleaning Previous Builds")

    for folder in ["build", "dist"]:
        path = os.path.join(root_dir, folder)
        if os.path.exists(path):
            shutil.rmtree(path)
            print_info(f"Removed: {path}")

    print_success("Clean complete")


def run_pyinstaller(root_dir, spec_path, target):
    """Execute PyInstaller with the appropriate spec file."""
    print_step(f"Running PyInstaller ({target.upper()} build)")

    print_info(f"Using spec: {spec_path}")
    run_command(
        f"{sys.executable} -m PyInstaller --clean --noconfirm \"{spec_path}\"",
        cwd=root_dir,
    )
    print_success("PyInstaller build complete")


def show_post_build_info(root_dir, target):
    """Display platform-specific post-build instructions."""
    dist_dir = os.path.join(root_dir, "dist")

    print_step("Build Complete!")
    print(f"\n  Your application is ready in:\n  {dist_dir}\n")

    if target == "windows":
        exe_path = os.path.join(dist_dir, f"{APP_NAME}.exe")
        print(f"  Executable: {exe_path}")
        print(f"\n  Double-click {APP_NAME}.exe to run the application.\n")

    elif target == "macos":
        app_path = os.path.join(dist_dir, f"{APP_NAME}.app")
        print(f"  Application: {app_path}")
        print()
        print("  ─── macOS Security Notes ───")
        print()
        print("  If macOS blocks the app ('unidentified developer'), run:")
        print(f"    xattr -cr \"{app_path}\"")
        print()
        print("  Or: Right-click the .app → Open → Open again.")
        print()
        print("  To copy to Applications folder:")
        print(f"    cp -R \"{app_path}\" /Applications/")
        print()


def main():
    """Main build orchestration."""
    args = parse_arguments()

    # Determine build target
    target = args.target if args.target else detect_build_target()

    print("\n" + "=" * 50)
    print(f"  TRADING JOURNAL PRO - BUILD SYSTEM")
    print(f"  Target: {target.upper()}")
    print(f"  OS: {platform.system()} {platform.machine()}")
    print(f"  Python: {sys.version.split()[0]}")
    print("=" * 50)

    # Resolve paths
    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "frontend")
    backend_dir = os.path.join(root_dir, "backend")

    # Validate spec file exists
    spec_path = SPEC_FILES.get(target)
    validate_spec_file(spec_path, root_dir)

    # Build pipeline
    build_frontend(frontend_dir)
    install_backend_deps(backend_dir)
    clean_build_artifacts(root_dir)
    run_pyinstaller(root_dir, spec_path, target)
    show_post_build_info(root_dir, target)


if __name__ == "__main__":
    main()
