import os

# Maximum upload size in MB (defaults to 200MB)
MAX_UPLOAD_SIZE_MB = int(os.environ.get("MAX_UPLOAD_SIZE_MB", 200))
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

# Timeout for LibreDWG conversion in seconds (defaults to 120s)
CAD_CONVERSION_TIMEOUT = int(os.environ.get("CAD_CONVERSION_TIMEOUT", 120))
