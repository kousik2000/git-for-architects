import os
import uuid
import tempfile
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Response
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import MAX_UPLOAD_SIZE_BYTES
from app.services.libredwg import LibreDWGConverter
from app.schemas.responses import ErrorResponse, HealthResponse

app = FastAPI(title="ARCOS CAD Converter API")

# Allow specific origins if needed later, open for now in POC
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def cleanup_temp_dir(dir_path: str):
    """Background task to remove temporary working directory."""
    if os.path.exists(dir_path):
        shutil.rmtree(dir_path, ignore_errors=True)

@app.get("/")
def root():
    """Root endpoint for basic verification."""
    return JSONResponse(content={"service": "arcos-cad-converter", "status": "running", "message": "Please use the /convert endpoint for file conversion."})

@app.get("/health", response_model=HealthResponse)
def health_check():
    """Verify service health and LibreDWG availability."""
    libredwg_status = "installed" if LibreDWGConverter.is_installed() else "missing"
    status = "ok" if libredwg_status == "installed" else "error"
    
    response = HealthResponse(
        status=status,
        service="cad-converter",
        libredwg=libredwg_status
    )
    if status == "error":
        return JSONResponse(status_code=503, content=response.model_dump())
    return response

@app.post("/convert")
async def convert_dwg(background_tasks: BackgroundTasks, file: UploadFile = File(None)):
    if not file:
        return JSONResponse(
            status_code=400,
            content=ErrorResponse(
                code="FILE_REQUIRED",
                message="A DWG file is required."
            ).model_dump()
        )
        
    filename = file.filename or ""
    if not filename.lower().endswith(".dwg"):
        return JSONResponse(
            status_code=400,
            content=ErrorResponse(
                code="UNSUPPORTED_FILE_TYPE",
                message="Only DWG files are supported."
            ).model_dump()
        )
        
    if not LibreDWGConverter.is_installed():
        return JSONResponse(
            status_code=503,
            content=ErrorResponse(
                code="CONVERTER_UNAVAILABLE",
                message="LibreDWG is currently unavailable."
            ).model_dump()
        )

    # Validate file size by reading into memory or reading chunk by chunk
    # Since FastAPI loads UploadFile to disk (or memory if small), we can check the size.
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)
    
    if file_size > MAX_UPLOAD_SIZE_BYTES:
        return JSONResponse(
            status_code=413,
            content=ErrorResponse(
                code="FILE_TOO_LARGE",
                message="The DWG file exceeds the maximum allowed size."
            ).model_dump()
        )
        
    # Generate secure temp directory
    safe_uuid = str(uuid.uuid4())
    temp_dir = os.path.join(tempfile.gettempdir(), f"arcos-cad-{safe_uuid}")
    os.makedirs(temp_dir, exist_ok=True)
    
    # Schedule cleanup to run after response is sent
    background_tasks.add_task(cleanup_temp_dir, temp_dir)
    
    # Safe internal names
    input_path = os.path.join(temp_dir, "input.dwg")
    output_path = os.path.join(temp_dir, "output.dxf")
    
    # Save uploaded file
    try:
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                code="INTERNAL_ERROR",
                message="Failed to save the uploaded file securely."
            ).model_dump()
        )
    finally:
        file.file.close()
        
    # Convert using LibreDWG
    success, error_msg = LibreDWGConverter.convert_dwg_to_dxf(input_path, output_path)
    
    if not success:
        if error_msg == "CONVERSION_TIMEOUT":
            return JSONResponse(
                status_code=504,
                content=ErrorResponse(
                    code="CONVERSION_TIMEOUT",
                    message="DWG conversion timed out."
                ).model_dump()
            )
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(
                code="DWG_CONVERSION_FAILED",
                message="LibreDWG could not convert the DWG file.",
                details=error_msg
            ).model_dump()
        )
        
    # Build safe download filename based on original, falling back if empty
    download_filename = filename.replace(".dwg", ".dxf").replace(".DWG", ".dxf")
    if not download_filename:
        download_filename = "converted.dxf"
        
    return FileResponse(
        path=output_path,
        media_type="application/dxf",
        filename=download_filename,
        content_disposition_type="attachment"
    )
