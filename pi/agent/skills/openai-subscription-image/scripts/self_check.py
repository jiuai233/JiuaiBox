"""Validate an extracted bundle offline; never read a real login or generate images."""
import argparse
import base64
import contextlib
import hashlib
import io
import json
from pathlib import Path
import socket
import sys
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from PIL import Image  # noqa: E402
from video_studio import image_candidate as client  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / "MANIFEST.json").read_text(encoding="utf-8"))
    for item in manifest["files"]:
        assert hashlib.sha256((ROOT / item["path"]).read_bytes()).hexdigest() == item["sha256"], item["path"]
    assert Path(client.__file__).resolve().is_relative_to(ROOT / "src")
    assert "video_studio.qwen_candidate" not in sys.modules

    def forbidden(*args, **kwargs):
        raise AssertionError("Offline self-check attempted login access or network")

    checks = ["manifest_hashes", "bundled_engine_loaded_without_qwen_runtime"]
    with tempfile.TemporaryDirectory(prefix="image-auth-check-", dir=args.out.parent.resolve()) as temporary:
        home = Path(temporary)
        auth_path = home / ".codex/auth.json"
        auth_path.parent.mkdir()
        with patch.object(Path, "home", return_value=home):
            for value in (None, {"OPENAI_API_KEY": "offline-key", "tokens": None},
                          {"tokens": {"access_token": "offline-access"}}):
                if value is not None:
                    client.save(auth_path, value)
                try:
                    client.auth_headers("openai")
                except ValueError as error:
                    assert "codex login" in str(error)
                else:
                    raise AssertionError("Missing ChatGPT login was accepted")
            client.save(auth_path, {"tokens": {"access_token": "offline-access", "account_id": "offline-account"}})
            for provider in ("openai", "codex-legacy"):
                headers = client.auth_headers(provider)
                assert headers["Authorization"] == "Bearer offline-access"
                assert headers["ChatGPT-Account-Id"] == "offline-account"
    checks += ["codex_auth_field_mapping", "missing_chatgpt_login_rejected"]

    client.auth_headers = forbidden
    client.requests.post = forbidden
    client.requests.get = forbidden
    socket.socket.connect = forbidden

    def invoke(argv):
        with contextlib.redirect_stdout(io.StringIO()) as capture:
            code = client.main(argv, provider="openai")
        assert code == 0, capture.getvalue()
        return json.loads(capture.getvalue())

    with tempfile.TemporaryDirectory(prefix="image-self-check-", dir=args.out.parent.resolve()) as temporary:
        work = Path(temporary)
        source = work / "source.png"
        Image.new("RGB", (16, 16), "blue").save(source)
        raw = source.read_bytes()
        task, edit, out = work / "generate.json", work / "edit.json", work / "candidate"
        client.save(task, {"prompt": "A blue folded paper bird."})
        client.save(edit, {"prompt": "Make {{ref:source}} red.", "generation": {"task_mode": "edit", "references": [
            {"id": "source", "path": "source.png", "role": "synthetic self-check fixture"}]}})
        generation_argv = ["--task-file", str(task), "--out", str(out), "--model", "gpt-image-2.5-flare"]
        generation = invoke(generation_argv)
        editing = invoke(["--task-file", str(edit), "--out", str(out), "--model", "gpt-image-2.5-sunburst"])
        assert generation["endpoint"].endswith("/codex/images/generations")
        assert generation["request_model"] == "gpt-image-2.5-flare"
        assert generation["authentication"] == "codex-cli-oauth"
        assert editing["endpoint"].endswith("/codex/images/edits")
        assert editing["source_bindings"] == {"source": "<IMAGE_0>"}
        assert editing["inputs"][0]["sha256"] == hashlib.sha256(raw).hexdigest()
        assert not out.exists()
        checks += ["generation_preview", "reference_edit_preview", "preview_creates_no_candidate"]

        class Response:
            status_code, ok, is_redirect = 200, True, False
            headers = {"x-codex-imagegen-request-id": "offline-self-check"}

            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def json(self):
                return {"data": [{"b64_json": base64.b64encode(raw).decode(), "generation_id": "offline-fixture"}],
                        "quality": "medium", "size": "16x16"}

        calls = []

        def local_post(endpoint, **kwargs):
            calls.append(endpoint)
            return Response()

        client.auth_headers = lambda provider: {"Authorization": "Bearer offline-fixture"}
        client.requests.post = local_post
        generated = invoke([*generation_argv, "--execute"])
        assert generated["status"] == "completed" and len(calls) == 1
        assert (out / "image-0.png").read_bytes() == raw
        checks.append("simulated_response_storage")
        (out / "image-0.png").unlink()
        client.auth_headers = forbidden
        client.requests.post = forbidden
        recovered = invoke(["recover", "--out", str(out), "--execute"])
        assert recovered["status"] == "completed" and (out / "image-0.png").read_bytes() == raw
        checks.append("saved_response_recovery_without_http")

    report = {"ok": True, "bundle_root": str(ROOT), "engine": str(Path(client.__file__).resolve()),
              "python": sys.version.split()[0], "checks": checks, "real_generation_submitted": False,
              "real_credentials_read": False, "external_http_requests": 0}
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
