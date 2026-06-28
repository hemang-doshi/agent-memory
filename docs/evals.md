# Evals

Deterministic local eval:

```bash
agentmem eval --json
```

Live-agent local harness:

```bash
agentmem eval live --json
agentmem eval live --write-report --json
```

The live harness compares scripted no-memory and memory-enabled actions across required scenarios. It is reproducible and useful for regression testing, but it does not prove external agent behavior or universal quality improvements.

