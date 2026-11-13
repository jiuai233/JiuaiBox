"""Portable OpenAI subscription entry; uses the bundled production engine."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from video_studio.image_candidate import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main(provider="openai"))
