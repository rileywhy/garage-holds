"""Run the hosted /api/crack handler locally for `next dev`.

`python serve_api.py` listens on 127.0.0.1:8797; set CRACK_API_URL to
http://127.0.0.1:8797 in .env.local and next.config.ts forwards /api/crack
there. The Crack Lab has no standalone GUI: the lab page is its interface.
"""

import argparse
import importlib.util
from http.server import ThreadingHTTPServer
from pathlib import Path

ENTRYPOINT = Path(__file__).resolve().parents[2] / "api/crack.py"


def load_handler():
    spec = importlib.util.spec_from_file_location("crack_api", ENTRYPOINT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8797)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), load_handler())
    print(f"Crack API: http://127.0.0.1:{args.port}/api/crack", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
