<div align="center">

# CORA

**Cyber Online Runtime Architecture** - the open-source framework for [CyberMP](https://github.com/Cyber-MP).

*Type-safe from UI to database. Modular by design. Built in the open.*

[Docs](https://coraframework.dev) · [Discord](#) · [Roadmap](#roadmap)

</div>

---

CORA is a modular roleplay framework for CyberMP, engineered the way the platform deserves: **end-to-end TypeScript**, schema-driven RPC contracts between server, client, and UI, real dependency management via npm, and per-module error isolation.

> CORA is an independent community project. It is not affiliated with or endorsed by the CyberMP team or CD PROJEKT RED.

## Packages

| Package | Description | Standalone? |
| --- | --- | --- |
| `@cora/lib` | Shared utilities (Result, locales, zones) | ✅ |
| `@cora/db` | Typed persistence layer with per-module migrations | ✅ |
| `@cora/ui` | React component kit for CEF UIs | ✅ |
| `@cora/core` | Framework kernel: players, modules, permissions, bridge | Phase 2 |

## Roadmap

- **Phase 1 (now):** standalone packages - db, lib, ui, CLI, server template
- **Phase 2:** core kernel + characters, inventory, money modules (headless-tested)
- **Phase 3:** game-ready 1.0 when CyberMP becomes publicly playable

## Contributing

We're building the founding community right now - see [CONTRIBUTING.md](CONTRIBUTING.md). Substantial changes go through the [RFC process](docs/rfcs/README.md).

## License

[MIT](LICENSE) © CORA Framework contributors
