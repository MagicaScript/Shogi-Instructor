import os
import subprocess
import questionary
from rich.console import Console
from rich.panel import Panel
import typer
import sys
import platform
import shutil
import time
from pathlib import Path

# Initialize Typer with help disabled for the callback to keep it clean
app = typer.Typer(add_completion=False)
console = Console()

# Global flag to control interactivity
NON_INTERACTIVE = False

# Get project root directory (where this script is located)
PROJECT_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"

# Determine venv paths based on operating system
IS_WINDOWS = platform.system() == "Windows"
VENV_DIR = BACKEND_DIR / ".venv"
# Pathlib concatenation
if IS_WINDOWS:
    VENV_PYTHON = VENV_DIR / "Scripts" / "python.exe"
    VENV_PIP = VENV_DIR / "Scripts" / "pip.exe"
    NPM_CMD = "npm.cmd"
else:
    VENV_PYTHON = VENV_DIR / "bin" / "python"
    VENV_PIP = VENV_DIR / "bin" / "pip"
    NPM_CMD = "npm"

# All available tasks with descriptions
TASKS = [
    {
        "name": "build-all",
        "desc": "Execute the complete build process (backend + frontend)."
    },
    {
        "name": "build-backend",
        "desc": "Build the backend: create venv, install deps, and package with PyInstaller."
    },
    {
        "name": "build-frontend",
        "desc": "Build the frontend Electron app using npm."
    },
    {
        "name": "dev",
        "desc": "Start development servers (backend + frontend) concurrently."
    },
    {
        "name": "dev-backend",
        "desc": "Start backend development server only."
    },
    {
        "name": "dev-frontend",
        "desc": "Start frontend development server only."
    },
    {
        "name": "clean",
        "desc": "Clean build artifacts (dist, build, .venv, node_modules)."
    },
    {
        "name": "exit",
        "desc": "Exit the CLI tool."
    }
]


def run_command(command: list, cwd: Path = None, shell: bool = False):
    """
    Execute a shell command and handle errors gracefully.
    
    Args:
        command: List of command arguments to execute (Path objects will be converted to str)
        cwd: Working directory for the command (Path object)
        shell: Whether to run the command through the shell
    
    Returns:
        bool: True if command succeeded, False otherwise
    """
    # Convert all command parts and cwd to strings for subprocess
    cmd_str_list = [str(c) for c in command] if isinstance(command, list) else command
    cwd_str = str(cwd) if cwd else str(Path.cwd())
    
    display_cmd = ' '.join(cmd_str_list) if isinstance(cmd_str_list, list) else cmd_str
    console.print(Panel.fit(f"[cyan]Running: {display_cmd}[/cyan]\n[dim]Directory: {cwd_str}[/dim]"))
    
    try:
        subprocess.run(cmd_str_list, check=True, cwd=cwd_str, shell=shell)
        console.print(f"[green]✓ Command completed successfully.[/green]\n")
        return True
    except subprocess.CalledProcessError as e:
        console.print(f"[red]✗ Command failed with exit code {e.returncode}.[/red]\n")
        return False
    except FileNotFoundError:
        console.print(f"[red]✗ Command not found: {cmd_str_list[0]}[/red]\n")
        return False


def create_venv():
    """
    Create a Python virtual environment in the backend directory.
    If the venv already exists, prompt the user to recreate it (unless NON_INTERACTIVE).
    
    Returns:
        bool: True if venv was created or already exists, False on failure
    """
    console.print(Panel.fit("[bold cyan]Creating Python Virtual Environment[/bold cyan]"))
    
    if VENV_DIR.exists():
        console.print(f"[yellow]Virtual environment already exists at {VENV_DIR}[/yellow]")
        
        # Skip confirmation in non-interactive mode
        if NON_INTERACTIVE:
            console.print("[green]Using existing virtual environment (Non-interactive).[/green]")
            return True

        overwrite = questionary.confirm("Do you want to recreate it?").ask()
        if overwrite:
            shutil.rmtree(VENV_DIR)
        else:
            console.print("[green]Using existing virtual environment.[/green]")
            return True
    
    return run_command([sys.executable, "-m", "venv", ".venv"], cwd=BACKEND_DIR)


def install_backend_deps():
    """
    Install Python dependencies from requirements.txt into the virtual environment.
    
    Returns:
        bool: True if installation succeeded, False otherwise
    """
    console.print(Panel.fit("[bold cyan]Installing Backend Dependencies[/bold cyan]"))
    
    # Check if venv exists
    if not VENV_PYTHON.exists():
        console.print("[red]Virtual environment not found. Please create it first.[/red]")
        return False
    
    # Check if requirements.txt exists
    requirements_path = BACKEND_DIR / "requirements.txt"
    if not requirements_path.exists():
        console.print(f"[red]requirements.txt not found at {requirements_path}[/red]")
        return False
    
    return run_command([VENV_PIP, "install", "-r", "requirements.txt"], cwd=BACKEND_DIR)


def package_backend():
    """
    Package the backend application using PyInstaller.
    Creates a single executable with all required dependencies bundled.
    
    Returns:
        bool: True if packaging succeeded, False otherwise
    """
    console.print(Panel.fit("[bold cyan]Packaging Backend with PyInstaller[/bold cyan]"))
    
    # Verify venv exists
    if not VENV_PYTHON.exists():
        console.print("[red]Virtual environment not found. Please create it first.[/red]")
        return False
    
    # Ensure PyInstaller is installed
    run_command([VENV_PIP, "install", "pyinstaller"], cwd=BACKEND_DIR)
    
    # Build PyInstaller command with all necessary options
    pyinstaller_cmd = [
        VENV_PYTHON, "-m", "PyInstaller",
        "-F", "bootstrap.py",           # Create a single file executable
        "--name", "backend",            # Name of the output executable
        "--noconsole",                  # No console window (GUI mode)
        "--collect-submodules", "src",
        "--collect-submodules", "uvicorn",
        "--collect-submodules", "fastapi",
        "--collect-submodules", "starlette",
        "--collect-submodules", "httpx"
    ]
    
    return run_command(pyinstaller_cmd, cwd=BACKEND_DIR)


def build_frontend():
    """
    Build the frontend Electron application using npm.
    Automatically installs node_modules if not present.
    
    Returns:
        bool: True if build succeeded, False otherwise
    """
    console.print(Panel.fit("[bold cyan]Building Frontend Electron App[/bold cyan]"))
    
    # Verify frontend directory exists
    if not FRONTEND_DIR.exists():
        console.print(f"[red]Frontend directory not found at {FRONTEND_DIR}[/red]")
        return False
    
    # Install npm dependencies if node_modules doesn't exist
    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        console.print("[yellow]node_modules not found. Installing dependencies first...[/yellow]")
        if not run_command([NPM_CMD, "install"], cwd=FRONTEND_DIR):
            return False
    
    # Run the electron build script
    return run_command([NPM_CMD, "run", "electron:build"], cwd=FRONTEND_DIR)


def build_backend():
    """
    Execute the complete backend build process:
    1. Create virtual environment
    2. Install dependencies
    3. Package with PyInstaller
    
    Returns:
        bool: True if all steps succeeded, False otherwise
    """
    console.print(Panel.fit("[bold magenta]Starting Backend Build Process[/bold magenta]"))
    
    if not create_venv():
        return False
    if not install_backend_deps():
        return False
    if not package_backend():
        return False
    
    console.print("[bold green]✓ Backend build completed![/bold green]")
    return True


def build_all():
    """
    Execute the complete build process for both backend and frontend.
    
    Returns:
        bool: True if all builds succeeded, False otherwise
    """
    console.print(Panel.fit("[bold magenta]Starting Full Build Process[/bold magenta]"))
    
    if not build_backend():
        console.print("[red]Backend build failed. Aborting.[/red]")
        return False
    
    if not build_frontend():
        console.print("[red]Frontend build failed.[/red]")
        return False
    
    console.print(Panel.fit("[bold green]✓ Full build completed successfully![/bold green]"))
    return True


def dev_backend():
    """
    Start the backend development server.
    Automatically creates venv and installs dependencies if needed.
    
    Returns:
        bool: True if server started successfully, False otherwise
    """
    console.print(Panel.fit("[bold cyan]Starting Backend Development Server[/bold cyan]"))
    
    # Set up venv if it doesn't exist
    if not VENV_PYTHON.exists():
        console.print("[yellow]Virtual environment not found. Creating...[/yellow]")
        if not create_venv():
            return False
        if not install_backend_deps():
            return False
    
    # Start the development server
    return run_command([VENV_PYTHON, "-m", "src.main"], cwd=BACKEND_DIR)


def dev_frontend():
    """
    Start the frontend development server.
    Automatically installs node_modules if needed.
    
    Returns:
        bool: True if server started successfully, False otherwise
    """
    console.print(Panel.fit("[bold cyan]Starting Frontend Development Server[/bold cyan]"))
    
    # Verify frontend directory exists
    if not FRONTEND_DIR.exists():
        console.print(f"[red]Frontend directory not found at {FRONTEND_DIR}[/red]")
        return False
    
    # Install npm dependencies if needed
    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        console.print("[yellow]node_modules not found. Installing dependencies first...[/yellow]")
        if not run_command([NPM_CMD, "install"], cwd=FRONTEND_DIR):
            return False
    
    # Start the development server
    return run_command([NPM_CMD, "run", "dev"], cwd=FRONTEND_DIR)


def dev_concurrent():
    """
    Start both backend and frontend development servers concurrently.
    Both servers run in parallel and can be stopped with Ctrl+C.
    
    Returns:
        bool: True when servers are stopped gracefully
    """
    console.print(Panel.fit("[bold magenta]Starting Development Servers (Concurrent)[/bold magenta]"))
    
    # Prepare backend environment if needed
    if not VENV_PYTHON.exists():
        console.print("[yellow]Virtual environment not found. Creating...[/yellow]")
        if not create_venv():
            return False
        if not install_backend_deps():
            return False
    
    # Prepare frontend environment if needed
    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        console.print("[yellow]node_modules not found. Installing dependencies first...[/yellow]")
        if not run_command([NPM_CMD, "install"], cwd=FRONTEND_DIR):
            return False
    
    console.print("[bold cyan]Starting servers... Press Ctrl+C to stop both.[/bold cyan]\n")
    
    processes = []
    
    try:
        # Start backend server process
        backend_process = subprocess.Popen(
            [str(VENV_PYTHON), "-m", "src.main"],
            cwd=str(BACKEND_DIR)
        )
        processes.append(("Backend", backend_process))
        console.print("[green]✓ Backend server started[/green]")
        
        # Start frontend server process
        frontend_process = subprocess.Popen(
            [NPM_CMD, "run", "dev"],
            cwd=str(FRONTEND_DIR),
            shell=IS_WINDOWS
        )
        processes.append(("Frontend", frontend_process))
        console.print("[green]✓ Frontend server started[/green]")
        
        console.print("\n[bold yellow]Both servers are running. Press Ctrl+C to stop.[/bold yellow]\n")
        
        # Monitor processes until one stops or user interrupts
        while True:
            for name, proc in processes:
                if proc.poll() is not None:
                    console.print(f"[yellow]{name} server stopped unexpectedly.[/yellow]")
                    raise KeyboardInterrupt
            time.sleep(1)
            
    except KeyboardInterrupt:
        # Gracefully terminate all running processes
        console.print("\n[yellow]Stopping servers...[/yellow]")
        for name, proc in processes:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                console.print(f"[green]✓ {name} server stopped[/green]")
    
    return True


def clean_all():
    """
    Remove all build artifacts including:
    - Backend: .venv, dist, build, spec files
    - Frontend: dist, dist_electron, node_modules
    
    Returns:
        bool: True when cleaning is complete
    """
    console.print(Panel.fit("[bold cyan]Cleaning Build Artifacts[/bold cyan]"))
    
    # List of paths to clean with descriptions
    paths_to_clean = [
        (BACKEND_DIR / ".venv", "Backend venv"),
        (BACKEND_DIR / "dist", "Backend dist"),
        (BACKEND_DIR / "build", "Backend build"),
        (BACKEND_DIR / "backend.spec", "Backend spec file"),
        (FRONTEND_DIR / "dist", "Frontend dist"),
        (FRONTEND_DIR / "dist_electron", "Frontend electron dist"),
        (FRONTEND_DIR / "node_modules", "Frontend node_modules"),
    ]
    
    # Remove each path if it exists
    for path, desc in paths_to_clean:
        if path.exists():
            try:
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
                console.print(f"[green]✓ Removed: {desc}[/green]")
            except Exception as e:
                console.print(f"[red]✗ Failed to remove {desc}: {e}[/red]")
        else:
            console.print(f"[dim]- Not found: {desc}[/dim]")
    
    console.print("\n[green]Clean completed.[/green]")
    return True


def execute_task(task_name: str):
    """
    Execute a task by its name.
    
    Args:
        task_name: The name of the task to execute
    """
    # Map task names to their handler functions
    task_handlers = {
        "build-all": build_all,
        "build-backend": build_backend,
        "build-frontend": build_frontend,
        "dev": dev_concurrent,
        "dev-backend": dev_backend,
        "dev-frontend": dev_frontend,
        "clean": clean_all,
    }
    
    handler = task_handlers.get(task_name)
    if handler:
        handler()
    else:
        console.print(f"[red]Unknown task: {task_name}[/red]")


def main_menu_logic():
    """
    Display the main interactive menu and handle user selections.
    Loops until the user chooses to exit.
    """
    console.print(Panel.fit("[bold green]Welcome to Vue + Python Project CLI Tool![/bold green]"))
    while True:
        # Build menu options from TASKS list
        options = [
            questionary.Choice(
                title=f"{task['name']} - {task['desc']}",
                value=task["name"]
            ) for task in TASKS
        ]

        # Prompt user to select a task
        selected = questionary.select(
            "Choose a task to perform:",
            choices=options
        ).ask()

        # Handle exit or cancelled selection
        if selected is None or selected == "exit":
            console.print("[bold blue]Exiting. Goodbye![/bold blue]")
            break

        # Confirm before executing
        confirm = questionary.confirm(f"Proceed with `{selected}`?").ask()

        if confirm:
            execute_task(selected)
        else:
            console.print("[yellow]Cancelled. Returning to menu.[/yellow]")


@app.command(name="interactive")
def interactive_cmd():
    """Start the interactive CLI tool (Explicit command)."""
    main_menu_logic()


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    build_all_flag: bool = typer.Option(False, "--build-all", help="Build backend and frontend"),
    build_backend_flag: bool = typer.Option(False, "--build-backend", help="Build backend only"),
    build_frontend_flag: bool = typer.Option(False, "--build-frontend", help="Build frontend only"),
    dev_flag: bool = typer.Option(False, "--dev", help="Run backend and frontend dev servers"),
    dev_backend_flag: bool = typer.Option(False, "--dev-backend", help="Run backend dev server"),
    dev_frontend_flag: bool = typer.Option(False, "--dev-frontend", help="Run frontend dev server"),
    clean_flag: bool = typer.Option(False, "--clean", help="Clean all build artifacts"),
):
    """
    Project CLI Tool.
    
    Use flags to run tasks directly (e.g., --build-all) without interactivity.
    Run without arguments to start the interactive menu.
    """
    global NON_INTERACTIVE

    # If a subcommand (like 'interactive') is called, let it run
    if ctx.invoked_subcommand:
        return

    # If any flag is set, run that task and exit
    if build_all_flag:
        NON_INTERACTIVE = True
        build_all()
        raise typer.Exit()

    if build_backend_flag:
        NON_INTERACTIVE = True
        build_backend()
        raise typer.Exit()

    if build_frontend_flag:
        NON_INTERACTIVE = True
        build_frontend()
        raise typer.Exit()

    if dev_flag:
        NON_INTERACTIVE = True
        dev_concurrent()
        raise typer.Exit()

    if dev_backend_flag:
        NON_INTERACTIVE = True
        dev_backend()
        raise typer.Exit()

    if dev_frontend_flag:
        NON_INTERACTIVE = True
        dev_frontend()
        raise typer.Exit()

    if clean_flag:
        NON_INTERACTIVE = True
        clean_all()
        raise typer.Exit()

    # If no flags and no subcommand, default to interactive menu
    main_menu_logic()


if __name__ == "__main__":
    app()

