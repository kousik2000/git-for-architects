import requests

url = "http://192.168.0.100:8000/api/cad/parse/"
filepath = r"C:\Users\kousi\Downloads\Mr.Keerti 42x45 EE-15 Feb P-03.dwg"

with open(filepath, 'rb') as f:
    files = {'file': (filepath.split('\\')[-1], f)}
    r = requests.post(url, files=files)
    
if r.status_code == 200:
    with open("../../frontend/src/dummy-json/new_parsed_cad.json", "wb") as out:
        out.write(r.content)
    print("Success! JSON saved to new_parsed_cad.json")
else:
    print(f"Failed with status {r.status_code}")
    print(r.text)
