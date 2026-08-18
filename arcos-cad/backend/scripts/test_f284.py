import sys
import os
sys.path.insert(0, r"E:\viewer_v2\arcos-cad\backend")
from cad.parsers.dxf_parser import ArcosDxfParser

parser = ArcosDxfParser(r"E:\viewer_v2\dxf_files\F2841747.dxf")
res = parser.parse()
print(res["statistics"])
