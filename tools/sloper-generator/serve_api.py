"""Run the hosted /api/sloper handler locally for `next dev`.

`python serve_api.py` listens on 127.0.0.1:8771; set SLOPER_API_URL to
http://127.0.0.1:8771 in .env.local and next.config.ts forwards /api/sloper
there. The local GUI (server.py) is separate and does not need this.
"""

import argparse
import importlib.util
from http.server import ThreadingHTTPServer
from pathlib import Path

ENTRYPOINT = Path(__file__).resolve().parents[2] / "api/sloper.py"


def load_handler():
    spec = importlib.util.spec_from_file_location("sloper_api", ENTRYPOINT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8771)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), load_handler())
    print(f"Sloper API: http://127.0.0.1:{args.port}/api/sloper", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
