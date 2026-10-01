.DEFAULT_GOAL := help
ifeq ($(OS),Windows_NT)
PYTHON ?= py -3
LOCAL_NODE := $(firstword $(wildcard .tools/node-v22*-win-x64/node.exe))
ifneq ($(LOCAL_NODE),)
# Use the workspace's portable Node when available, including for npm children.
export PATH := $(abspath $(dir $(LOCAL_NODE)));$(PATH)
NPM ?= "$(LOCAL_NODE)" "$(dir $(LOCAL_NODE))node_modules/npm/bin/npm-cli.js"
else
NPM ?= npm.cmd
endif
else
PYTHON ?= python3
NPM ?= npm
endif
PORT ?= 8080
LOCAL_RUFF := $(firstword $(wildcard .tools/python-lint/bin/ruff.exe .tools/python-lint/bin/ruff))
ifneq ($(LOCAL_RUFF),)
RUFF ?= "$(LOCAL_RUFF)"
else
RUFF ?= $(PYTHON) -m ruff
endif

.PHONY: help run lan test test-browser test-journey check build test-netlify test-netlify-journey package lint-setup lint lint-python lint-js lint-fix
help:
	@echo make run          - Start for this computer, open browser
	@echo make lan          - Start for phones on the same Wi-Fi
	@echo make test         - Run server and HTTP regression tests
	@echo make test-browser - Run Chrome/Edge smoke and rendering checks
	@echo make test-journey - Complete the two-player journey through the UI
	@echo make check        - Run all Python local checks, sequentially
	@echo make build        - Build Netlify frontend and package function
	@echo make test-netlify - Test rules and packaged Netlify function
	@echo make test-netlify-journey - Full browser journey on packaged function
	@echo make package      - Build the complete Netlify upload ZIP
	@echo make lint-setup   - Install pinned Ruff into ignored workspace tools
	@echo make lint         - Check Python with Ruff and JavaScript syntax
	@echo make lint-fix     - Apply safe Ruff fixes to Python source and tests
	@echo Override: make lan PORT=55018 or make test PYTHON=python3

run:
	$(PYTHON) a-little-closer/server.py --host 127.0.0.1 --port $(PORT) --auto-port --open-browser

lan:
	$(PYTHON) a-little-closer/server.py --host 0.0.0.0 --port $(PORT) --auto-port --open-browser

test:
	$(PYTHON) -m unittest discover -s tests -t . -v

test-browser:
	$(PYTHON) -m tests.test_browser

test-journey:
	$(PYTHON) -m tests.test_journey

check:
	$(MAKE) lint-python
	$(MAKE) test
	$(MAKE) test-browser
	$(MAKE) test-journey

build:
	$(NPM) run build

test-netlify: build
	$(NPM) test
	$(NPM) run test:package

test-netlify-journey: build
	$(PYTHON) -m tests.test_journey --netlify

package: test-netlify
	$(NPM) run package

lint-setup:
	$(PYTHON) -m pip install --upgrade --target .tools/python-lint -r requirements-dev.txt

lint: lint-python lint-js

lint-python:
	$(RUFF) check a-little-closer tests

lint-js:
	$(NPM) run lint

lint-fix:
	$(RUFF) check --fix a-little-closer tests
