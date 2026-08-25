import urllib.request
import json

body = b"--boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.dxf\"\r\n\r\n"
with open("F2841747_converter_test.dxf", "rb") as f:
    body += f.read()
body += b"\r\n--boundary--\r\n"

req = urllib.request.Request(
    "http://127.0.0.1:8000/api/cad/parse/",
    data=body,
    headers={"Content-Type": "multipart/form-data; boundary=boundary"}
)

try:
    r = urllib.request.urlopen(req)
    data = json.loads(r.read())
    with open("test_api.json", "w", encoding="utf-8") as out:
        json.dump(data, out, indent=2)
    print("Saved test_api.json")
except Exception as e:
    print(e)
