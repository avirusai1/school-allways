# Superseded

This guide has been replaced by **[`BUILD_SPEC.md`](./BUILD_SPEC.md)** and the
`build/` directory.

The original version described *what* to build but not *how* — no request and
response schemas, no DTO definitions, no screen layouts, no code patterns to
copy. Cursor would have invented all of that, inconsistently, across 60 screens.

The replacement contains:

- **`BUILD_SPEC.md`** — global API contract, error-code registry, pagination,
  code structure, complete screen inventory, review checklist
- **`build/00-reference-implementation.md`** — one complete working vertical
  slice (controller, service, repository, DTOs, tests) that every module copies
- **`build/01`–`build/10`** — backend modules with full endpoint contracts
- **`build/11-design-system.md`** — the visual specification
- **`build/12`–`build/15`** — Flutter foundation, both apps screen by screen,
  and the four web surfaces

Start at `BUILD_SPEC.md` §0.
