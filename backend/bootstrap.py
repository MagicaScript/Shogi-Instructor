from src.api import config

if __name__ == "__main__":
    import os
    import sys
    import uvicorn

    # For pyinstaller compatibility
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")

    uvicorn.run(
        "src.api:app",
        host=config.listen.split(":")[0],
        port=int(config.listen.split(":")[1]),
        reload=False,
    )
