from pathlib import Path
import subprocess
import questionary
from rich.console import Console
from rich.panel import Panel
import typer
import sys
import platform
import shutil
import time

app = typer.Typer()
console = Console()

# Get project root directory (where this script is located)
PROJECT_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"

# Determine venv paths based on operating system
IS_WINDOWS = platform.system() == "Windows"
VENV_DIR = BACKEND_DIR / ".venv"
VENV_PYTHON = (
    VENV_DIR / "Scripts" / "python.exe" if IS_WINDOWS else VENV_DIR / "bin" / "python"
)
VENV_PIP = VENV_DIR / "Scripts" / "pip.exe" if IS_WINDOWS else VENV_DIR / "bin" / "pip"
NON_INTERACTIVE = False

# All available tasks with descriptions
TASKS = [
    {
        "name": "build-all",
        "desc": "Execute the complete build process (backend + frontend).",
    },
    {
        "name": "build-backend",
        "desc": "Build the backend: create venv, install deps, and package with PyInstaller.",
    },
    {"name": "build-frontend", "desc": "Build the frontend Electron app using npm."},
    {
        "name": "dev",
        "desc": "Start development servers (backend + frontend) concurrently.",
    },
    {"name": "dev-backend", "desc": "Start backend development server only."},
    {"name": "dev-frontend", "desc": "Start frontend development server only."},
    {
        "name": "clean",
        "desc": "Clean build artifacts (dist, build, .venv, node_modules).",
    },
    {"name": "exit", "desc": "Exit the CLI tool."},
]


def run_command(
    command: list[str] | str, cwd: Path | str | None = None, shell: bool = False
):
    """
    Execute a shell command and handle errors gracefully.

    Args:
        command: List of command arguments to execute
        cwd: Working directory for the command
        shell: Whether to run the command through the shell

    Returns:
        bool: True if command succeeded, False otherwise
    """
    command_to_run = (
        [str(part) for part in command] if isinstance(command, list) else str(command)
    )
    cmd_str = (
        " ".join(command_to_run) if isinstance(command_to_run, list) else command_to_run
    )
    cwd_path = Path(cwd) if cwd else None
    cwd_display = str(cwd_path) if cwd_path else str(Path.cwd())
    console.print(
        Panel.fit(
            f"[cyan]Running: {cmd_str}[/cyan]\n[dim]Directory: {cwd_display}[/dim]"
        )
    )
    try:
        subprocess.run(command_to_run, check=True, cwd=cwd_path, shell=shell)
        console.print(f"[green]✓ Command completed successfully.[/green]\n")
        return True
    except subprocess.CalledProcessError as e:
        console.print(f"[red]✗ Command failed with exit code {e.returncode}.[/red]\n")
        return False
    except FileNotFoundError:
        missing = (
            command_to_run[0] if isinstance(command_to_run, list) else command_to_run
        )
        console.print(f"[red]✗ Command not found: {missing}[/red]\n")
        return False


def create_venv():
    """
    Create a Python virtual environment in the backend directory.
    If the venv already exists, prompt the user to recreate it.
    In non-interactive mode, the existing venv is reused.

    Returns:
        bool: True if venv was created or already exists, False on failure
    """
    console.print(
        Panel.fit("[bold cyan]Creating Python Virtual Environment[/bold cyan]")
    )

    if VENV_DIR.exists():
        console.print(
            f"[yellow]Virtual environment already exists at {VENV_DIR}[/yellow]"
        )
        if NON_INTERACTIVE:
            console.print("[green]Using existing virtual environment.[/green]")
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
        console.print(
            "[red]Virtual environment not found. Please create it first.[/red]"
        )
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
    console.print(
        Panel.fit("[bold cyan]Packaging Backend with PyInstaller[/bold cyan]")
    )

    # Verify venv exists
    if not VENV_PYTHON.exists():
        console.print(
            "[red]Virtual environment not found. Please create it first.[/red]"
        )
        return False

    # Ensure PyInstaller is installed
    run_command([VENV_PIP, "install", "pyinstaller"], cwd=BACKEND_DIR)

    # Build PyInstaller command with all necessary options
    pyinstaller_cmd = [
        VENV_PYTHON,
        "-m",
        "PyInstaller",
        "-F",
        "bootstrap.py",  # Create a single file executable
        "--name",
        "backend",  # Name of the output executable
        "--noconsole",  # No console window (GUI mode)
        "--collect-submodules",
        "src",
        "--collect-submodules",
        "uvicorn",
        "--collect-submodules",
        "fastapi",
        "--collect-submodules",
        "starlette",
        "--collect-submodules",
        "httpx",
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
        console.print(
            "[yellow]node_modules not found. Installing dependencies first...[/yellow]"
        )
        npm_cmd = "npm.cmd" if IS_WINDOWS else "npm"
        if not run_command([npm_cmd, "install"], cwd=FRONTEND_DIR):
            return False

    # Run the electron build script
    npm_cmd = "npm.cmd" if IS_WINDOWS else "npm"
    return run_command([npm_cmd, "run", "electron:build"], cwd=FRONTEND_DIR)


def build_backend():
    """
    Execute the complete backend build process:
    1. Create virtual environment
    2. Install dependencies
    3. Package with PyInstaller

    Returns:
        bool: True if all steps succeeded, False otherwise
    """
    console.print(
        Panel.fit("[bold magenta]Starting Backend Build Process[/bold magenta]")
    )

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

    console.print(
        Panel.fit("[bold green]✓ Full build completed successfully![/bold green]")
    )
    return True


def dev_backend():
    """
    Start the backend development server.
    Automatically creates venv and installs dependencies if needed.

    Returns:
        bool: True if server started successfully, False otherwise
    """
    console.print(
        Panel.fit("[bold cyan]Starting Backend Development Server[/bold cyan]")
    )

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
    console.print(
        Panel.fit("[bold cyan]Starting Frontend Development Server[/bold cyan]")
    )

    # Verify frontend directory exists
    if not FRONTEND_DIR.exists():
        console.print(f"[red]Frontend directory not found at {FRONTEND_DIR}[/red]")
        return False

    # Install npm dependencies if needed
    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        console.print(
            "[yellow]node_modules not found. Installing dependencies first...[/yellow]"
        )
        npm_cmd = "npm.cmd" if IS_WINDOWS else "npm"
        if not run_command([npm_cmd, "install"], cwd=FRONTEND_DIR):
            return False

    # Start the development server
    npm_cmd = "npm.cmd" if IS_WINDOWS else "npm"
    return run_command([npm_cmd, "run", "dev"], cwd=FRONTEND_DIR)


def dev_concurrent():
    """
    Start both backend and frontend development servers concurrently.
    Both servers run in parallel and can be stopped with Ctrl+C.

    Returns:
        bool: True when servers are stopped gracefully
    """
    console.print(
        Panel.fit(
            "[bold magenta]Starting Development Servers (Concurrent)[/bold magenta]"
        )
    )

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
        console.print(
            "[yellow]node_modules not found. Installing dependencies first...[/yellow]"
        )
        npm_cmd = "npm.cmd" if IS_WINDOWS else "npm"
        if not run_command([npm_cmd, "install"], cwd=FRONTEND_DIR):
            return False

    console.print(
        "[bold cyan]Starting servers... Press Ctrl+C to stop both.[/bold cyan]\n"
    )

    processes = []

    try:
        # Start backend server process
        backend_process = subprocess.Popen(
            [VENV_PYTHON, "-m", "src.main"], cwd=BACKEND_DIR
        )
        processes.append(("Backend", backend_process))
        console.print("[green]✓ Backend server started[/green]")

        # Start frontend server process
        npm_cmd = "npm.cmd" if IS_WINDOWS else "npm"
        frontend_process = subprocess.Popen(
            [npm_cmd, "run", "dev"], cwd=FRONTEND_DIR, shell=IS_WINDOWS
        )
        processes.append(("Frontend", frontend_process))
        console.print("[green]✓ Frontend server started[/green]")

        console.print(
            "\n[bold yellow]Both servers are running. Press Ctrl+C to stop.[/bold yellow]\n"
        )

        # Monitor processes until one stops or user interrupts
        while True:
            for name, proc in processes:
                if proc.poll() is not None:
                    console.print(
                        f"[yellow]{name} server stopped unexpectedly.[/yellow]"
                    )
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


def main_menu():
    """
    Display the main interactive menu and handle user selections.
    Loops until the user chooses to exit.
    """
    while True:
        # Build menu options from TASKS list
        options = [
            questionary.Choice(
                title=f"{task['name']} - {task['desc']}", value=task["name"]
            )
            for task in TASKS
        ]

        # Prompt user to select a task
        selected = questionary.select(
            "Choose a task to perform:", choices=options
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


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    build_all: bool = typer.Option(
        False, "--build-all", help="Run full build without prompts."
    ),
    build_backend: bool = typer.Option(
        False, "--build-backend", help="Run backend build without prompts."
    ),
    build_frontend: bool = typer.Option(
        False, "--build-frontend", help="Run frontend build without prompts."
    ),
    dev: bool = typer.Option(False, "--dev", help="Run dev servers without prompts."),
    dev_backend: bool = typer.Option(
        False, "--dev-backend", help="Run backend dev server without prompts."
    ),
    dev_frontend: bool = typer.Option(
        False, "--dev-frontend", help="Run frontend dev server without prompts."
    ),
    clean: bool = typer.Option(
        False, "--clean", help="Clean build artifacts without prompts."
    ),
):
    """Run a task via flags or start the interactive menu."""
    task_flags = {
        "build-all": build_all,
        "build-backend": build_backend,
        "build-frontend": build_frontend,
        "dev": dev,
        "dev-backend": dev_backend,
        "dev-frontend": dev_frontend,
        "clean": clean,
    }
    selected = [name for name, enabled in task_flags.items() if enabled]

    if selected:
        if len(selected) > 1:
            console.print("[red]Please pass only one task flag at a time.[/red]")
            raise typer.Exit(code=1)
        global NON_INTERACTIVE
        NON_INTERACTIVE = True
        execute_task(selected[0])
        raise typer.Exit()

    if ctx.invoked_subcommand is None:
        interactive()


@app.command()
def interactive():
    """Start the interactive CLI tool."""
    console.print(
        Panel.fit("[bold green]Welcome to Vue + Python Project CLI Tool![/bold green]")
    )
    main_menu()


if __name__ == "__main__":
    app()
