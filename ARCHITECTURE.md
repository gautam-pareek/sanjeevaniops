# Architecture Overview

Architecture style:
- Modular
- Event-driven
- Local-first
- Human-in-the-loop

Core components:
- Python healing and decision engine
- Docker-based application monitoring
- Local LLaMA 3.1 for log reasoning
- SQLite for system memory
- FastAPI backend
- n8n for controlled automation
- Web dashboard (HTML/CSS/JS)

AI responsibilities:
- Log analysis
- Root cause explanation
- Recovery suggestions

AI restrictions:
- No execution
- No system access
- No self-triggered actions
