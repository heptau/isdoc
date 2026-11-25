# ISDOC Viewer: helper targets. The app itself needs no build (the whole site is the docs/ folder).

PORT ?= 8765
URL  := http://localhost:$(PORT)

# "open" on macOS, "xdg-open" on Linux
OPEN := $(shell command -v open 2>/dev/null || command -v xdg-open 2>/dev/null)

.DEFAULT_GOAL := help
.PHONY: help serve

help: ## Show this help
	@echo "ISDOC Viewer"
	@echo
	@echo "Usage: make <target> [PORT=8765]"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

serve: ## Start a local web server and open the app in the browser (Ctrl+C stops it)
	@echo "Serving docs/ at $(URL)"
	@$(if $(OPEN),(sleep 1; $(OPEN) $(URL)) &,)
	@python3 -m http.server $(PORT) --bind 127.0.0.1 --directory docs
