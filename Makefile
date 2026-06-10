# Seclettr — root-level wrappers around the unified CLI.
# Prefer: bash ./scripts/seclettr <command>
# or add a shell alias: alias sec='bash /path/to/scripts/seclettr'

.PHONY: seclettr install server-install dev-up dev-up-lan dev-lan-up dev-down \
        gen-dev-certs build test test-e2e lint typecheck \
        release-build release-install sonar android-sync help

SEC := bash ./scripts/seclettr

seclettr:
	$(SEC)

install:
	$(SEC) dev install

server-install:
	$(SEC) server install

dev-up:
	$(SEC) dev up

dev-up-lan: ; $(SEC) dev up --lan
dev-lan-up: ; $(SEC) dev up --lan

dev-down:
	$(SEC) dev down

gen-dev-certs:
	$(SEC) dev certs

test-e2e:
	$(SEC) ops e2e

release-build:
	$(SEC) release build

release-install:
	$(SEC) release install

sonar:
	$(SEC) sonar scan

android-sync:
	$(SEC) android sync

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

typecheck:
	pnpm typecheck

help:
	@$(SEC) help
