# Governance

## Project model

Keryx currently uses a benevolent-maintainer model. Vladimir Perović is the project maintainer and has final responsibility for scope, security, releases, and repository administration.

## Decision principles

Changes are evaluated in this order:

1. Security of tokens, user-scoped data, and deployment defaults.
2. Protocol correctness and compatibility.
3. Simplicity and maintainability of the shared tool registry.
4. Operator experience and documentation.
5. New features.

## Contributions

Pull requests are welcome. Maintainers may request design discussion before accepting changes that add authentication systems, persistent state, arbitrary network access, destructive tools, or substantial dependencies.

## Releases

Until 1.0, compatibility may change between minor versions. Breaking changes must be documented in `CHANGELOG.md`, the pull request, and migration notes when operator action is required.

## Security decisions

Security reports are handled privately according to `SECURITY.md`. The maintainer may temporarily withhold details while a fix and release are prepared.

## Future governance

If the project gains regular external maintainers, this document should be expanded with reviewer roles, voting/consensus rules, release permissions, and a succession process.
