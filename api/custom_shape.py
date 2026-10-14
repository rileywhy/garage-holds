"""Custom Shape Lab API; independent of existing generator handlers."""
import importlib
import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
engine=importlib.import_module('tools.custom-shape-generator.geometry')

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=450000:
                raise ValueError('Drawing exceeds the supported size.')
            if self.headers.get('Content-Type','').split(';')[0]!='application/json':
                raise ValueError('Send a JSON drawing.')
            request=json.loads(self.rfile.read(length))
            if not isinstance(request,dict) or request.get('action') not in ('preview','stl'):
                raise ValueError('Unknown drawing action.')
            mesh=engine.build(request)
            if request['action']=='stl':
                body=mesh.export(file_type='stl'); content='model/stl'
            else:
                body=json.dumps(dict(vertices=mesh.vertices.tolist(),faces=mesh.faces.tolist(),volume_cm3=round(mesh.volume/1000,2),seatDepth=mesh.metadata["seatDepth"]),allow_nan=False).encode(); content='application/json'
            self.respond(200,body,content)
        except (ValueError,TypeError,KeyError,OverflowError) as error:
            self.respond(400,json.dumps(dict(error=str(error))).encode(),'application/json')
        except Exception:
            self.respond(500,b'{"error":"Could not generate this shape. Widen narrow features and try again."}','application/json')

    def respond(self,status,body,content):
        self.send_response(status)
        self.send_header('Content-Type',content)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        self.wfile.write(body)

if __name__=='__main__':
    from http.server import ThreadingHTTPServer
    ThreadingHTTPServer(('127.0.0.1',8791),handler).serve_forever()
