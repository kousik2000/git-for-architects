import os
import requests
from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.http import HttpResponse, JsonResponse

@api_view(['GET'])
def health_check(request):
    """Simple health check endpoint for the Django backend."""
    return Response({"status": "ok", "service": "django-backend"})

@api_view(['POST'])
def convert_dwg(request):
    """
    Accepts a DWG file, validates it, proxies it to the CAD Converter API,
    and returns the resulting DXF file.
    """
    if 'file' not in request.FILES:
        return Response({"code": "FILE_REQUIRED", "message": "A DWG file is required."}, status=400)
        
    uploaded_file = request.FILES['file']
    filename = uploaded_file.name or ""
    
    if not filename.lower().endswith(".dwg"):
        return Response({"code": "UNSUPPORTED_FILE_TYPE", "message": "Only DWG files are supported."}, status=400)
        
    converter_url = f"{settings.CAD_CONVERTER_URL}/convert"
    
    try:
        print(f"\n[Django] Forwarding '{filename}' to CAD Converter at: {converter_url}")
        
        # We forward the file to the fastAPI converter
        files = {'file': (filename, uploaded_file.file, uploaded_file.content_type)}
        
        response = requests.post(converter_url, files=files, stream=True)
        
        print(f"[Django] Received response from CAD Converter: HTTP {response.status_code}")
        
        if response.status_code == 200:
            # We stream the file back to the client
            django_response = HttpResponse(
                response.iter_content(chunk_size=8192),
                content_type=response.headers.get('Content-Type', 'application/dxf')
            )
            django_response['Content-Disposition'] = response.headers.get('Content-Disposition', f'attachment; filename="{filename.replace(".dwg", ".dxf")}"')
            return django_response
        else:
            # Forward the error response from the converter
            try:
                error_data = response.json()
            except ValueError:
                error_data = {"code": "CONVERTER_ERROR", "message": "The CAD converter returned an invalid response."}
            return Response(error_data, status=response.status_code)
            
    except requests.exceptions.RequestException as e:
        print(f"[Django] ERROR: Failed to reach CAD Converter at {converter_url}. Exception: {str(e)}")
        return Response(
            {"code": "CONVERTER_UNAVAILABLE", "message": f"Could not reach CAD converter API: {str(e)}"},
            status=503
        )

@api_view(['POST'])
def parse_dwg(request):
    """
    Accepts a DWG file, converts it to DXF using the CAD Converter API,
    and parses the result into ARCOS CAD JSON using ezdxf.
    """
    from cad.services.cad_processing import process_dwg_to_arcos_json, CADProcessingError
    
    if 'file' not in request.FILES:
        return Response({"code": "FILE_REQUIRED", "message": "A DWG file is required."}, status=400)
        
    uploaded_file = request.FILES['file']
    filename = uploaded_file.name or ""
    
    if not filename.lower().endswith(".dwg"):
        return Response({"code": "UNSUPPORTED_FILE_TYPE", "message": "Only DWG files are supported."}, status=400)
        
    try:
        json_data = process_dwg_to_arcos_json(uploaded_file, filename)
        return Response({"success": True, "data": json_data})
    except CADProcessingError as e:
        return Response({"code": "PROCESSING_ERROR", "message": str(e)}, status=500)
    except Exception as e:
        return Response({"code": "INTERNAL_ERROR", "message": f"An unexpected error occurred: {str(e)}"}, status=500)
