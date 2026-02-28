from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import sessions, tags, engines, upload, transcribe

app = FastAPI(
    title="NOMAD API",
    description="Universal audio capture & transcription backend",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://nomad.green-lab.local",
        "https://nomad.mgdesign.cloud",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers with /api prefix
app.include_router(sessions.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(tags.sessions_tags_router, prefix="/api")
app.include_router(engines.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(transcribe.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "nomad-api"}
