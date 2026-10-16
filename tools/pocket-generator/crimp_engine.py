"""Load the existing Crimp Lab engine without mixing standalone module names."""

import importlib
import sys
from pathlib import Path
from types import ModuleType

PACKAGE = "garage_holds_crimp_engine"
if PACKAGE not in sys.modules:
    package = ModuleType(PACKAGE)
    package.__path__ = [str(Path(__file__).resolve().parents[1] / "crimp-generator")]
    sys.modules[PACKAGE] = package
parameters = importlib.import_module(f"{PACKAGE}.parameters")
geometry = importlib.import_module(f"{PACKAGE}.geometry")
