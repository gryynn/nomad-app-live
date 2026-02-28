from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import sessions

app = FastAPI(
    title="NOMAD API",
    description="Universal audio capture & transcription backend",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(sessions.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "nomad-api"}
