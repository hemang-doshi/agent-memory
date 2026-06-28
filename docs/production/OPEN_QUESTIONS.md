# Open Questions

No product-owner-blocking questions are open right now.

Implementation decisions made without blocking:

| Date | Question | Decision | Rationale |
|---|---|---|---|
| 2026-06-28 | Should vector and reranker providers call external services by default? | No. Use local/mock/no-op defaults. | Required by PRD local-first constraints. |
| 2026-06-28 | Should MCP expose mutating tools by default? | No. Read-only by default, config-gated writes. | Required by PRD MCP safety constraints. |

