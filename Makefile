.DEFAULT_GOAL := help
ifeq ($(OS),Windows_NT)
PYTHON ?= py -3
else
PYTHON ?= python3
endif
PORT ?= 8080

.PHONY: help run lan test test-browser test-journey check
help:
	@echo make run          - Start for this computer, open browser
	@echo make lan          - Start for phones on the same Wi-Fi
	@echo make test         - Run server and HTTP regression tests
	@echo make test-browser - Run Chrome/Edge smoke and rendering checks
	@echo make test-journey - Complete the two-player journey through the UI
	@echo make check        - Run all automated checks, sequentially
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
	$(MAKE) test
	$(MAKE) test-browser
	$(MAKE) test-journey
