# Changelog

All notable changes to the app and server are documented here.  
For database schema changes and migration rules, see [docs/MIGRATIONS.md](docs/MIGRATIONS.md).

## [0.2.0] – 2025-02-17

### App (desktop)

- Version set to 0.2.0.
- Build: Windows (NSIS installer only, no portable), macOS (dmg), Linux (AppImage).
- DB schema version remains 1; migrations run automatically on startup (see `electron/db.ts` and `docs/MIGRATIONS.md`).

### Server

- Version set to 0.2.0 (in `server/package.json` and `_railway_deploy/package.json`).
- Deploy via GitHub: push to the connected branch (e.g. `main`) triggers Railway deploy when Root Directory is set to `server`.

### Release / DevOps

- GitHub Releases: create release for tag `v0.2.0`, attach built installers and `latest.yml` (and platform-specific yml) for auto-update.
- Railway: deploy server through GitHub (repo linked, Root Directory = `server`); optionally use CLI for ad-hoc deploy.

---

## [0.1.0] – (earlier)

- Initial releases.
- Server 0.1.0; desktop 0.0.1 → bumped to 0.2.0 for this release.
