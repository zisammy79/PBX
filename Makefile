.PHONY: help install dev-up dev-down db-migrate db-seed verify foundation-verify lint test build clean telephony-up telephony-down telephony-validate telephony-activate telephony-test stage7-verify ai-up ai-down ai-test stage8-test-deterministic stage8-test-live stage8-verify stage8-openai-contract-test stage8-openai-live-test pstn-config-validate pstn-outbound-test pstn-inbound-test stripe-contract-test stripe-test-mode-verify production-v1-safeguards production-v1-verify credential-runtime-contract-test deploy-validate deploy-dry-run demo-local-up demo-local-seed demo-local-smoke demo-local-status demo-local-reset demo-local-down

help:
	@echo "PBX Platform — available targets:"
	@echo "  install     Install dependencies"
	@echo "  dev-up      Start local infrastructure (PostgreSQL, Redis, NATS, MinIO)"
	@echo "  dev-down    Stop local infrastructure"
	@echo "  db-migrate  Run database migrations"
	@echo "  db-seed     Seed development data"
	@echo "  foundation-verify  Run full foundation verification gate"
	@echo "  telephony-up       Start Asterisk + telephony-controller"
	@echo "  telephony-down     Stop telephony stack"
	@echo "  telephony-validate  Run telephony config generator tests"
	@echo "  telephony-activate  Instructions for config activation via API"
	@echo "  telephony-test      Alias for stage7-verify"
	@echo "  stage7-verify       Full Stage 7 verification"
	@echo "  ai-up               Start AI media gateway"
	@echo "  ai-down             Stop AI media gateway"
	@echo "  ai-test             Run deterministic AI gateway tests"
	@echo "  stage8-test-deterministic  Deterministic provider conversation"
	@echo "  stage8-test-live    Live external provider test (requires credentials)"
	@echo "  stage8-verify       Stage 8 verification gate"
	@echo "  deploy-validate     Validate Slice G deployment assets"
	@echo "  deploy-dry-run      Production deploy dry-run (fixture env)"
	@echo "  demo-local-up       Start local product demo stack"
	@echo "  demo-local-seed     Seed demo tenant data"
	@echo "  demo-local-smoke    Verify local demo scenario"
	@echo "  demo-local-status   Show local demo service status"
	@echo "  demo-local-reset    Reset demo-owned records"
	@echo "  demo-local-down     Stop local demo services"
	@echo "  lint        Run linters"
	@echo "  test        Run test suites"
	@echo "  build       Build all packages"
	@echo "  clean       Remove build artifacts"

install:
	pnpm install

dev-up:
	docker compose -f infrastructure/docker/docker-compose.yml up -d

dev-down:
	docker compose -f infrastructure/docker/docker-compose.yml down

db-migrate:
	pnpm db:migrate

db-seed:
	pnpm --filter @pbx/database db:seed

verify: lint test build db-migrate-check
	@echo "All verification checks passed."

foundation-verify:
	bash scripts/foundation-verify.sh

telephony-up:
	bash scripts/telephony.sh up

telephony-down:
	bash scripts/telephony.sh down

telephony-validate:
	bash scripts/telephony.sh validate

telephony-activate:
	bash scripts/telephony.sh activate

telephony-test: stage7-verify

stage7-verify:
	bash scripts/stage7-verify.sh

ai-up:
	bash scripts/ai-up.sh

ai-down:
	bash scripts/ai-down.sh

ai-test:
	bash scripts/stage8-test-deterministic.sh

stage8-test-deterministic:
	bash scripts/stage8-test-deterministic.sh

stage8-test-live:
	@echo "Live provider test requires OPENAI_API_KEY or GEMINI_API_KEY and full Stage 8 routing — not yet implemented"
	@exit 1

stage8-verify:
	bash scripts/stage8-verify.sh

credential-runtime-contract-test:
	bash scripts/credential-runtime-contract-test.sh

stage8-openai-contract-test:
	bash scripts/stage8-openai-contract-test.sh

stage8-openai-live-test:
	bash scripts/stage8-openai-live-test.sh

pstn-config-validate:
	bash scripts/pstn-config-validate.sh

pstn-outbound-test:
	bash scripts/pstn-outbound-test.sh

pstn-inbound-test:
	bash scripts/pstn-inbound-test.sh

stripe-contract-test:
	bash scripts/stripe-contract-test.sh

stripe-test-mode-verify:
	bash scripts/stripe-test-mode-verify.sh

production-v1-safeguards:
	bash scripts/validate-production-safeguards.sh

production-v1-verify:
	bash scripts/production-v1-verify.sh

deploy-validate:
	bash scripts/validate-deployment-assets.sh

deploy-dry-run:
	bash scripts/deploy-production.sh --dry-run --env-file infrastructure/docker/.env.production.fixture

demo-local-up:
	bash scripts/demo/demo-up.sh

demo-local-seed:
	bash scripts/demo/demo-seed.sh

demo-local-smoke:
	bash scripts/demo/demo-smoke.sh

demo-local-status:
	bash scripts/demo/demo-status.sh

demo-local-reset:
	bash scripts/demo/demo-reset.sh

demo-local-down:
	bash scripts/demo/demo-down.sh

db-migrate-check:
	@echo "Checking migration status..."
	pnpm --filter @pbx/database db:check

lint:
	pnpm lint

test:
	pnpm test

build:
	pnpm build

clean:
	rm -rf apps/*/dist packages/*/dist services/*/dist node_modules/.cache
