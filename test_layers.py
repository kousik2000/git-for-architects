import urllib.request
import json

boundary = b"boundary"
body = b"--boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.dxf\"\r\n\r\n"
with open("F2841747_converter_test.dxf", "rb") as f:
    body += f.read()
body += b"\r\n--boundary--\r\n"

req = urllib.request.Request(
    "http://192.168.0.100:8000/api/cad/parse/",
    data=body,
    headers={"Content-Type": "multipart/form-data; boundary=boundary"}
)

try:
    r = urllib.request.urlopen(req)
    data = json.loads(r.read())
    layers = data['data']['layers']
    print(f"Total Layers: {len(layers)}")
    print(f"Visible Layers: {sum(1 for l in layers if l['visible'] and not l['frozen'])}")
    print(f"Frozen Layers: {sum(1 for l in layers if l['frozen'])}")
    print(f"Locked Layers: {sum(1 for l in layers if l['locked'])}")
except Exception as e:
    print(e)
