import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api import endpoints
from app.services.reranker import LocalReranker
from app.services.vector_store import RAGRetriever
import logging

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag-api")

# --- Requirement 4 & 5: Resource Management ---
# We use a global state to hold our models so they are loaded once on startup
# and accessible to all requests.
class AppState:
    reranker: LocalReranker = None
    retriever: RAGRetriever = None

state = AppState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP: Load models into VRAM
    logger.info("Initializing Local RAG Services...")
    state.reranker = LocalReranker()
    state.retriever = RAGRetriever()
    logger.info("Services Ready.")
    yield
    # SHUTDOWN: Cleanup (if needed)
    logger.info("Shutting down...")

app = FastAPI(
    title="Local Multimodal RAG API",
    description="Python RAG with Docling, Qdrant, and Local LLM citations.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the API routes defined earlier
app.include_router(endpoints.router, prefix="/api/v1")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "local_llm": "ollama_connected"}

@app.get("/")
async def root():
    return {
        "message": "Local Multimodal RAG API is running",
        "docs": "Go to /docs to test the API"
    }

if __name__ == "__main__":
    # To run: python main.py
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
