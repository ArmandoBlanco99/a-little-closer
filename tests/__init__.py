"""Test package; expose the standalone application without installing packages."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'a-little-closer'
sys.path.insert(0, str(APP))
