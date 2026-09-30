#!/bin/sh
cd "$(dirname "$0")" || exit 1
python3 a-little-closer/server.py --auto-port --open-browser
