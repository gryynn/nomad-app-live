from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import sessions, tags

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
app.include_router(tags.router)
app.include_router(tags.sessions_tags_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "nomad-api"}
