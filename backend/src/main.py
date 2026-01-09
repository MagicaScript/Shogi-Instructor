from src.api import config

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.api:app",
        host=config.listen.split(":")[0],
        port=int(config.listen.split(":")[1]),
        reload=True,
    )
