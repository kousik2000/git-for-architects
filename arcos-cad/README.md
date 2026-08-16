# ARCOS CAD Converter API

This service is a standalone FastAPI HTTP wrapper around the `LibreDWG` (`dwg2dxf`) executable. It isolates the conversion logic from the main application to ensure security, stability, and maintainability.

## Why is LibreDWG Isolated?
CAD conversion tools can be unpredictable with varying memory requirements and potential security vulnerabilities when handling untrusted user files. By isolating LibreDWG inside its own Docker container:
1. We can limit its resource usage.
2. We prevent any malicious DWG file from compromising the main web backend.
3. We cleanly abstract the conversion tool (meaning we could swap LibreDWG for another engine later without touching Django).

## Local Development (Phase 1)

To build and run the converter locally:
```bash
cd arcos-cad
docker compose up --build
```

### Health Check
```bash
curl http://localhost:8080/health
```

### Convert a DWG
```bash
curl -X POST http://localhost:8080/convert \
  -F "file=@/path/to/your/file.dwg" \
  --output converted.dxf
```

## Security Considerations
- **No shell execution:** The API uses exact subprocess arguments.
- **Isolated temp directories:** Each conversion happens in a dedicated UUID folder.
- **Cleanup:** Temp folders are automatically removed after the response is sent.
- **Resource Limits:** Enforced via `MAX_UPLOAD_SIZE_MB` and `CAD_CONVERSION_TIMEOUT` environment variables.
