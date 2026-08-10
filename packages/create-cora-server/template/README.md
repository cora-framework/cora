# __PROJECT_NAME__

A server project built on the CORA framework.

## Getting started

Install dependencies:

```sh
pnpm install
```

Run the test suite:

```sh
pnpm test
```

Build the project:

```sh
pnpm build
```

Apply database migrations (reads `cora.migrate.mjs` by default):

```sh
pnpm migrate
```

> **Note:** the `@cora` packages are not yet published to npm. Until the
> first release, link them via a pnpm workspace or `pnpm link` from the
> CORA monorepo.
