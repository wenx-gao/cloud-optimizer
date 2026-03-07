# Local Multimodal RAG

A private, local RAG system that processes PDF, Excel, and Images using Docling and Ollama.

## Features
- **Multimodal:** Handles tables and diagrams via Docling v2.
- **Local LLM:** Uses Ollama (Llama 3 8B) for private inference.
- **Reranking:** Implements BGE-Reranker for high accuracy.
- **Async Processing:** Background indexing with Celery and Redis.

## Setup
1. Clone the repo.
2. Ensure Docker Desktop is running.
3. Run `docker-compose up -d --build`.
4. Download the LLM: `docker exec -it rag-ollama ollama run llama3:8b`.
5. Access the API at `http://localhost:8000/docs`.

## How to Run
1. Start the system: `docker-compose up -d --build`
2. Download the model: `docker exec -it rag-ollama ollama run llama3:8b`
3. **Frontend:** Open `http://localhost:5173`
4. **API Docs:** Open `http://localhost:8000/docs`


graph TD
    User((User)) <-->|Socket.io| Backend[Express Backend]
    subgraph Agentic Workflow (LangGraph)
        Backend -->|Invoke| Reasoning[Reasoning Node: Gemini 2.0]
        Reasoning -->|Decision| Guardrail[Guardrail Node: Safety Check]
        Guardrail -->|Unsafe| END[End]
        Guardrail -->|Safe| Action[Action Node: Optimization Script]
        Action -->|Update| END
    end
    subgraph Observability
        Reasoning -.->|Metrics| Obs[Latency & Cost Tracker]
    end
    subgraph External Infrastructure
        Action -->|Execution| Scripts[Bash/Python Scripts]
        Reasoning <-->|MCP Protocol| MCP[Cloud Data MCP Server]
    end
    Obs -->|Real-time| Backend
    