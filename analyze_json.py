import json

with open(r'E:\viewer_v2\arcos-cad\frontend\src\dummy-json\cad.json', 'r', encoding='utf-8') as f:
    raw_data = json.load(f)
    data = raw_data.get('data', raw_data)

counts = {}
layer_counts = {}

def count_entity(e, layer):
    t = e['type']
    l = layer
    counts[t] = counts.get(t, 0) + 1
    if l not in layer_counts:
        layer_counts[l] = {}
    layer_counts[l][t] = layer_counts[l].get(t, 0) + 1

for e in data.get('entities', []):
    count_entity(e, e.get('layer', '0'))

for b in data.get('blocks', {}).values():
    for e in b.get('entities', []):
        count_entity(e, e.get('layer', '0'))

print('Total Entities:', sum(counts.values()))
print('By Type:', counts)
for l, tc in layer_counts.items():
    print(f'Layer {l}: {tc}')

# Also print the actual layer objects
layers = data.get('layers', [])
print("Layer definitions:")
for l in layers:
    print(l)
