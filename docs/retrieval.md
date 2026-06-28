# Retrieval

Retrieval modes:

```bash
agentmem retrieve "<task>" --mode deterministic
agentmem retrieve "<task>" --mode keyword
agentmem retrieve "<task>" --mode vector
agentmem retrieve "<task>" --mode hybrid --explain --json
agentmem explain-retrieval "<task>" --mode hybrid --json
```

`deterministic` is the default and remains the safety baseline. `keyword` uses the local SQLite FTS index. `vector` uses the local hash embedding provider and local vector index. `hybrid` merges deterministic, keyword, and vector candidates after the shared visibility gate.

Reranking is optional:

```bash
agentmem retrieve "<task>" --rerank --reranker mock --json
```

The default/no-op reranker preserves retrieval order. Reranking never makes unsafe memory injectable.

