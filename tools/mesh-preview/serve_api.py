"""Run the hosted /api/preview_mesh handler locally for `next dev`.

`python serve_api.py` listens on 127.0.0.1:8790; set PREVIEW_API_URL to
http://127.0.0.1:8790 and PREVIEW_SECRET to any string in .env.local, and
export PREVIEW_SECRET in the shell that runs this, so the two sides agree.
"""

import argparse
import importlib.util
from http.server import ThreadingHTTPServer
from pathlib import Path

ENTRYPOINT = Path(__file__).resolve().parents[2] / "api/preview_mesh.py"


def load_handler():
    spec = importlib.util.spec_from_file_location("preview_mesh_api", ENTRYPOINT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8790)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), load_handler())
    print(f"Preview mesh API: http://127.0.0.1:{args.port}/api/preview_mesh", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
