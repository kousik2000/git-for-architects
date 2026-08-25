import json

with open(r'E:\viewer_v2\arcos-cad\frontend\src\dummy-json\cad.json', 'r', encoding='utf-8') as f:
    raw_data = json.load(f)
    data = raw_data.get('data', raw_data)

text_total = 0
text_modelspace = 0
text_block = 0
layer_counts = {}
sample_text = None

def process_entity(e, layer, is_block):
    global text_total, text_modelspace, text_block, sample_text
    if e['type'] == 'TEXT':
        text_total += 1
        if is_block:
            text_block += 1
        else:
            text_modelspace += 1
            
        layer_counts[layer] = layer_counts.get(layer, 0) + 1
        
        if sample_text is None and layer == "0" and not is_block:
            sample_text = e
            
for e in data.get('entities', []):
    process_entity(e, e.get('layer', '0'), False)

for b in data.get('blocks', {}).values():
    for e in b.get('entities', []):
        process_entity(e, e.get('layer', '0'), True)

print("Total TEXT entities:", text_total)
print("Modelspace TEXT:", text_modelspace)
print("Block TEXT:", text_block)
print("TEXT by layer:")
for l, c in layer_counts.items():
    print(f"  Layer {l}: {c}")

if sample_text:
    print("\nSample TEXT on Layer 0:")
    print(json.dumps(sample_text, indent=2))
