# brip-cli

> **Status: scaffold.** Commands are stubbed; each lands in its phase.

Command-line tools for the BRIP verification and settlement layer.

```bash
brip-cli help
brip-cli audit verify --entry <id> --anchor <anchor>   # Phase 2b
```

The headline command is `audit verify`: it re-derives the append-only audit hash
chain and proves a given entry against a signed transparency anchor — independently
of BRIP's servers. See [docs/SPEC.md](../../docs/SPEC.md) §5.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
