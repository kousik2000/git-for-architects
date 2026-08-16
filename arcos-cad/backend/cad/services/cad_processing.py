import os
import uuid
import tempfile
import requests
import shutil
from django.conf import settings
from cad.parsers.dxf_parser import ArcosDxfParser

class CADProcessingError(Exception):
    pass

def process_dwg_to_arcos_json(uploaded_file, filename):
    """
    Orchestrates the conversion of a DWG file to DXF via the Docker converter,
    and then parses the DXF into ARCOS CAD JSON using ezdxf.
    """
    converter_url = f"{settings.CAD_CONVERTER_URL}/convert"
    
    # Generate secure temp directory
    safe_uuid = str(uuid.uuid4())
    temp_dir = os.path.join(tempfile.gettempdir(), f"arcos-cad-django-{safe_uuid}")
    os.makedirs(temp_dir, exist_ok=True)
    
    temp_dxf_path = os.path.join(temp_dir, "temp.dxf")
    
    try:
        # 1. Forward the DWG to the FastAPI converter
        files = {'file': (filename, uploaded_file.file, uploaded_file.content_type)}
        response = requests.post(converter_url, files=files, stream=True)
        
        if response.status_code != 200:
            try:
                error_data = response.json()
            except ValueError:
                error_data = {"message": "The CAD converter returned an invalid response."}
            raise CADProcessingError(f"Conversion failed: {error_data.get('message', 'Unknown error')}")
            
        # 2. Save the resulting DXF locally
        with open(temp_dxf_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    
        # 3. Parse the DXF into ARCOS JSON
        parser = ArcosDxfParser(temp_dxf_path)
        json_data = parser.parse()
        
        # Override the document name to match original DWG instead of temp.dxf
        json_data["document"]["name"] = filename
        
        return json_data
        
    except requests.exceptions.RequestException as e:
        raise CADProcessingError(f"Could not reach CAD converter API: {str(e)}")
    except Exception as e:
        raise CADProcessingError(f"Parsing failed: {str(e)}")
    finally:
        # Cleanup
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
