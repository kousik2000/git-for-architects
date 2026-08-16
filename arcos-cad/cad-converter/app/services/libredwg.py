import subprocess
import os
import tempfile
import shutil
import uuid
from typing import Tuple

from app.config import CAD_CONVERSION_TIMEOUT

class LibreDWGConverter:
    @staticmethod
    def is_installed() -> bool:
        """Check if the dwg2dxf executable is available in the system PATH."""
        return shutil.which("dwg2dxf") is not None

    @staticmethod
    def convert_dwg_to_dxf(input_dwg_path: str, output_dxf_path: str) -> Tuple[bool, str]:
        """
        Executes dwg2dxf securely using subprocess argument arrays.
        Does NOT use shell=True.
        """
        if not LibreDWGConverter.is_installed():
            return False, "LibreDWG (dwg2dxf) is not installed or not in PATH."

        try:
            # Conceptually: dwg2dxf -o <output_path> <input_path>
            command = [
                "dwg2dxf",
                "-o",
                output_dxf_path,
                input_dwg_path
            ]
            
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=CAD_CONVERSION_TIMEOUT,
                check=False
            )
            
            if result.returncode != 0:
                error_msg = f"dwg2dxf failed with return code {result.returncode}.\nStderr: {result.stderr}"
                return False, error_msg
                
            if not os.path.exists(output_dxf_path):
                return False, "dwg2dxf completed but output DXF file was not found."
                
            return True, ""
            
        except subprocess.TimeoutExpired:
            return False, "CONVERSION_TIMEOUT"
        except Exception as e:
            return False, f"Unexpected error during conversion: {str(e)}"
