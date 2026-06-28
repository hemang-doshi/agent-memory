# Architecture Decisions

## ADR-001: Preserve Deterministic Retrieval as Safety Baseline

### Context

V2 adds keyword, vector, hybrid retrieval, and optional reranking. Safety requirements state that command policy and unsafe-memory exclusion must remain deterministic.

### Decision

Deterministic retrieval remains the default mode. Keyword, vector, hybrid, and reranking layers may add candidates or reorder relevance, but they must not include memory that deterministic eligibility filters exclude.

### Consequences

Retrieval modules need a shared eligibility boundary. Vector and reranker implementations must consume already-filtered candidates or explicitly apply the same eligibility rules.

### Alternatives considered

Allowing rerankers to evaluate all memories was rejected because memory content is data, not authority, and low-trust or unsafe memory must not influence injection.

## ADR-002: Local-First Provider Abstractions

### Context

The PRD requires vector search and LLM reranking while forbidding external calls by default.

### Decision

Provider interfaces must default to no-op or local/mock implementations. External embedding and LLM adapters are opt-in configuration only and must fail closed when unavailable.

### Consequences

Tests can use mock providers without network access. CLI help and docs must clearly explain that external providers are disabled by default.

### Alternatives considered

Using a hosted provider as a default was rejected because it violates local-first behavior.

