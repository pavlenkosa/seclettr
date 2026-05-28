# Seclettr — root-level wrappers. New code should prefer `seclettr` CLI.
# Backward-compat symlinks in scripts/ keep old targets working.

.PHONY: seclettr install server-install dev-up dev-up-lan dev-lan-up dev-down gen-dev-certs build test test-e2e lint typecheck release-build release-install help

seclettr:
	bash ./scripts/seclettr

install:
	bash ./scripts/dev/install.sh

server-install:
	bash ./scripts/server/install.sh

dev-up:
	bash ./scripts/dev/up.sh

dev-up-lan: ; bash ./scripts/dev/up-lan.sh
dev-lan-up: ; bash ./scripts/dev/up-lan.sh

dev-down:
	bash ./scripts/dev/down.sh

gen-dev-certs:
	bash ./scripts/dev/certs.sh

build:
	pnpm build

test:
	pnpm test

test-e2e:
	bash ./scripts/ops/e2e-smoke.sh

lint:
	pnpm lint

typecheck:
	pnpm typecheck

release-build:
	bash ./scripts/release/build.sh

release-install:
	bash ./scripts/release/install.sh

help:
	@echo ""
	@echo "Seclettr commands:"
	@echo ""
	@echo "  make seclettr        Run the unified CLI (try 'make seclettr help')"
	@echo "  bash ./scripts/seclettr help"
	@echo "  ln -s \$$PWD/scripts/seclettr ~/.local/bin/sec   (optional alias)"
	@echo ""
	@echo "  make install         Install local dev dependencies and toolchain"
	@echo "  make server-install  Install Docker + Compose on a deployment host"
	@echo "  make dev-up          Start the Docker-based dev environment (localhost only)"
	@echo "  make dev-up-lan      Start the dev environment exposed on LAN for call testing"
	@echo "  make dev-down        Stop the dev environment"
	@echo "  make gen-dev-certs   Generate TLS dev certs via mkcert (use --lan-ip for LAN)"
	@echo "  make build           Build all packages"
	@echo "  make test            Run the test suite"
	@echo "  make test-e2e        Run Playwright tests"
	@echo "  make lint            Run lint tasks"
	@echo "  make typecheck       Run type checks"
	@echo "  make release-build   Build release Docker images and bundle them"
	@echo "  make release-install Load bundled images, run migrations, and start the stack"
	@echo ""
