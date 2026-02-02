# SanjeevaniOps — System Definition

SanjeevaniOps is a local-first, explainable application reliability and recovery system.

Core principles:
- Detect failures, do not guess
- Explain causes, do not hallucinate
- Automate only safe, reversible actions
- Escalate to humans on repeated failure
- AI is reasoning-only, never executing

Hard constraints:
- No cloud providers
- No Kubernetes
- No autonomous AI execution
- No AI-driven code modification in production

The system prioritizes safety, observability, and human control over speed.

## Cost & Dependency Constraints (Non-Negotiable)

This project MUST follow the rules defined in:
docs/constraints.md

Summary:
- No paid APIs or services
- No cloud providers
- No token-based AI usage
- All AI models must be local
- All tools must be free and open-source

Any suggestion that violates these constraints must be rejected.
