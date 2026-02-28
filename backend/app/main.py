from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import engines, upload

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

# Include routers
app.include_router(engines.router, prefix="/api")
app.include_router(upload.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "nomad-api"}
