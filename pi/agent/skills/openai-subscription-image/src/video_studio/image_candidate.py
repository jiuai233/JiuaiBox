"""Create one image candidate via OpenAI subscription, xAI, or owned Qwen Colab routes.

Dry-run is the default: no credentials, network, or output-directory writes.
recover --out ORIGINAL previews saved OpenAI results or xAI URLs; --execute only
restores those results, without credentials or another generation POST.
Runtime dependencies (requests, Pillow, jsonschema) are in the project's locked environment.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jsonschema
import requests
from PIL import Image

from .image_receipts import ImageReceiptError, codex_receipt, is_blocked, public_receipt, service_rewrites
from .qwen_options import NATIVE_OPTIONS

MODELS = {"openai": "gpt-image-2.6-flare", "xai": "grok-imagine-image-2.0", "codex-legacy": "gpt-6-luna", "qwen": "Qwen-Image-2.1"}
COMPILER_VERSION = "image-task/1"
AUTHORED_COMPILER_VERSION = "image-task/2"


def save(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_task(path: Path) -> dict:
    task = json.loads(path.read_text(encoding="utf-8-sig"))
    schema_path = Path(__file__).resolve().parents[2] / "schemas/character-assets.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    jsonschema.validate(task, {**schema, "$ref": "#/$defs/task"})
    references = task.get("generation", {}).get("references", [])
    ids = [item["id"] for item in references]
    if len(ids) != len(set(ids)):
        raise ValueError("generation.references must have unique source ids")
    for attribute, source in task.get("generation", {}).get("attribute_sources", {}).items():
        if source != "discard" and source not in ids:
            raise ValueError(f"Unknown source id {source!r} for attribute {attribute!r}")
    task.setdefault("prompt_mode", "authored")
    # A media label for native Qwen normalization, not a crew/authoring role.
    task.setdefault("role", "candidate")
    return task


def source_evidence(reference: dict, raw: bytes, directory: Path) -> dict:
    actual_sha = hashlib.sha256(raw).hexdigest()
    if "sha256" in reference and reference["sha256"] != actual_sha:
        raise ValueError(f"Reference hash changed: {reference['id']}")
    evidence = {"id": reference["id"], "bytes": len(raw)}
    if "origin" in reference:
        evidence["origin"] = reference["origin"]
    if "sha256" in reference:
        evidence["declared_sha256"] = reference["sha256"]
    if "metadata_path" in reference:
        path = (directory / reference["metadata_path"]).resolve()
        metadata = path.read_bytes()
        metadata_sha = hashlib.sha256(metadata).hexdigest()
        if "metadata_sha256" in reference and reference["metadata_sha256"] != metadata_sha:
            raise ValueError(f"Metadata hash changed: {reference['id']}")
        evidence["metadata"] = {"path": str(path), "sha256": metadata_sha, "bytes": len(metadata)}
        if "metadata_sha256" in reference:
            evidence["metadata"]["declared_sha256"] = reference["metadata_sha256"]
    return evidence


def resolve_prompt_references(prompt: str, inputs: list[dict], *, provider: str | None = None) -> str:
    """Resolve author source ids against the actual upload order, without prose changes."""
    labels = {item["id"]: (f"<image{item['index'] + 1}>" if provider == "qwen"
                           else f"<IMAGE_{item['index']}>") for item in inputs}

    def replace(match: re.Match) -> str:
        source = match.group(1)
        if source not in labels:
            raise ValueError(f"Unknown prompt reference id {source!r}; available ids: {list(labels)}")
        return labels[source]

    submitted = re.sub(r"(?<!\{)\{\{ref:([^{}]+)\}\}(?!\})", replace, prompt)
    if re.search(r"\{\{?\s*ref\b|\bref\s*:[^{}\n]*\}\}?", submitted, re.IGNORECASE):
        raise ValueError("Malformed prompt reference; use {{ref:ID}} with an exact source id")
    return submitted


def compile_task_prompt(task: dict, inputs: list[dict], *, provider: str | None = None) -> str:
    if task.get("prompt_mode", "authored") == "authored":
        prompt = task.get("prompt", "")
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("Generation requires a nonempty authored prompt")
        return resolve_prompt_references(prompt, inputs, provider=provider)
    if provider == "qwen":
        raise ValueError("Qwen requires authored text; prepare a new author packet")
    # Static-image project labels, not Qwen tags or a dedicated geometry channel.
    generation = task.get("generation", {})
    mode = generation.get("task_mode", "text_to_image")
    action = {"text_to_image": "Target image", "edit": "Edit", "reference_compose": "Compose"}[mode]
    parts = [f"{action}: {task['prompt']}"]
    if inputs:
        parts.append("Reference roles (use each image only for its stated purpose):\n" + "\n".join(
            f"<IMAGE_{item['index']}>: {item['role']} (source id: {item['id']})" for item in inputs
        ))
    labels = {item["id"]: f"<IMAGE_{item['index']}>" for item in inputs}
    for attribute, source in sorted(generation.get("attribute_sources", {}).items()):
        parts.append(f"Do not transfer {attribute} from the references." if source == "discard"
                     else f"Take {attribute} only from {labels[source]}.")
    if generation.get("preserve"):
        parts.append("Preserve: " + "; ".join(generation["preserve"]) + ".")
    if "creative_freedom" in generation:
        freedom = generation["creative_freedom"]
        parts.append("Creative freedom: " + ("; ".join(freedom) if freedom else "none") + ".")
    if task.get("constraints"):
        parts.append("Constraints: " + "; ".join(task["constraints"]) + ".")
    return "\n\n".join(parts)


def build_request(args: argparse.Namespace) -> tuple[str, dict, dict]:
    if getattr(args, "background", None) and args.provider != "openai":
        raise ValueError("--background requires --provider openai")
    if args.provider == "qwen":
        from . import qwen_candidate
        return qwen_candidate.build_request(args)
    if any(getattr(args, name, None) is not None for name in NATIVE_OPTIONS):
        raise ValueError("Qwen native options require --provider qwen")
    if args.provider not in ("openai", "xai", "codex-legacy"):
        raise ValueError(f"Unsupported image provider: {args.provider}")
    task_file = getattr(args, "task_file", None)
    task = None
    references = []
    cli_prompt_mode = getattr(args, "prompt_mode", None)
    if task_file:
        if args.image or args.image_role:
            raise ValueError("--task-file uses generation.references; omit --image and --image-role")
        task = load_task(task_file)
        prompt_mode = task.get("prompt_mode", "authored")
        if cli_prompt_mode is not None and cli_prompt_mode != prompt_mode:
            raise ValueError(f"--prompt-mode {cli_prompt_mode!r} conflicts with task-file prompt_mode {prompt_mode!r}; edit the task explicitly")
        prompt = task.get("prompt", "")
        references = task.get("generation", {}).get("references", [])
        paths = [(task_file.parent / item["path"]).resolve() for item in references]
        roles = [item["role"] for item in references]
    else:
        prompt_mode = cli_prompt_mode or "authored"
        prompt = args.prompt_file.read_text(encoding="utf-8-sig")
        paths = args.image or []
        roles = args.image_role or []
    if not prompt.strip():
        raise ValueError("Generation requires a nonempty prompt")
    if roles and len(roles) != len(paths):
        raise ValueError("Supply one --image-role for each --image, in the same order")
    if args.provider in ("openai", "xai") and len(paths) > 5:
        raise ValueError(f"{args.provider} multi-image editing accepts up to five source images")
    image_urls, inputs = [], []
    for index, path in enumerate(paths):
        raw = path.read_bytes()
        with Image.open(io.BytesIO(raw)) as image:
            image.load()
            mime = Image.MIME[image.format]
        image_urls.append(f"data:{mime};base64," + base64.b64encode(raw).decode())
        inputs.append({"index": index, "role": roles[index] if roles else "reference",
                       "path": str(path.resolve()), "sha256": hashlib.sha256(raw).hexdigest()})
        if task is not None:
            inputs[-1].update(source_evidence(references[index], raw, task_file.parent))
        elif prompt_mode == "authored":
            inputs[-1]["id"] = str(index)
            inputs[-1]["bytes"] = len(raw)
    submitted_prompt = compile_task_prompt(task, inputs) if task is not None else (
        resolve_prompt_references(prompt, inputs) if prompt_mode == "authored" else prompt
    )
    if roles and task is None and prompt_mode == "legacy":
        submitted_prompt = "Reference roles (use each image only for its stated purpose):\n" + "\n".join(
            f"<IMAGE_{item['index']}>: {item['role']}" for item in inputs
        ) + "\n\n" + prompt
    operation = "edit" if image_urls else "generate"
    model = args.model or MODELS[args.provider]
    if args.provider == "openai":
        if args.resolution or args.aspect_ratio or args.reasoning_effort:
            raise ValueError("OpenAI subscription uses size/quality; there is no outer reasoning model")
        endpoint = "https://chatgpt.com/backend-api/codex/images/" + ("edits" if image_urls else "generations")
        body = {"model": model, "prompt": submitted_prompt, "n": 1}
        if image_urls:
            body["images"] = [{"image_url": url} for url in image_urls]
        for name in ("quality", "size", "background"):
            if getattr(args, name, None) is not None:
                body[name] = getattr(args, name)
    elif args.provider == "xai":
        if args.quality == "high":
            raise ValueError("xAI quality supports low, medium, auto; select one of those")
        if args.size or args.reasoning_effort:
            raise ValueError("Use xAI resolution instead of size; no reasoning model is used")
        endpoint = "https://api.x.ai/v1/images/" + ("edits" if image_urls else "generations")
        body = {"model": model, "prompt": submitted_prompt, "n": 1, "response_format": "url"}
        if len(image_urls) == 1:
            body["image"] = {"type": "image_url", "url": image_urls[0]}
        elif image_urls:
            body["images"] = [{"url": url} for url in image_urls]
        if args.aspect_ratio:
            body["aspect_ratio"] = args.aspect_ratio
        if args.quality:
            body["quality"] = args.quality
        if args.resolution:
            body["resolution"] = args.resolution
    else:
        if args.resolution or args.aspect_ratio:
            raise ValueError("Codex uses the image tool's size, not xAI resolution/aspect_ratio")
        endpoint = "https://chatgpt.com/backend-api/codex/responses"
        content = [{"type": "input_text", "text": submitted_prompt}]
        for index, image_url in enumerate(image_urls):
            if roles and task is None and prompt_mode == "legacy":
                content.append({"type": "input_text", "text": f"Reference <IMAGE_{index}>: {roles[index]}"})
            content.append({"type": "input_image", "image_url": image_url})
        tool = {"type": "image_generation", "action": operation}
        if args.quality:
            tool["quality"] = args.quality
        if args.size:
            tool["size"] = args.size
        body = {
            "model": model, "store": False, "stream": True,
            "instructions": "Produce exactly one image using image_generation. Follow the user's prompt.",
            "input": [{"role": "user", "content": content}], "tools": [tool],
            "text": {"verbosity": "low"},
            "reasoning": {"effort": args.reasoning_effort or "low"},
            "include": ["reasoning.encrypted_content"], "parallel_tool_calls": False,
        }
    plan = {
        "provider": args.provider, "endpoint": endpoint, "request_model": model,
        "operation": operation, "prompt_mode": prompt_mode,
        "prompt": prompt, "raw_prompt": prompt, "submitted_prompt": submitted_prompt,
        "raw_prompt_sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        "submitted_prompt_sha256": hashlib.sha256(submitted_prompt.encode("utf-8")).hexdigest(),
        "service_prompt_rewrite": None, "service_prompt_rewrites": [],
        "input_sha256": inputs[0]["sha256"] if len(inputs) == 1 else None, "inputs": inputs,
        "requested_quality": args.quality, "requested_size": args.size,
        "requested_resolution": args.resolution, "requested_aspect_ratio": args.aspect_ratio,
        "reasoning_effort": body.get("reasoning", {}).get("effort"),
        "maximum_post_requests": 1, "automatic_retry": False,
        "output_directory": str(args.out), "simulation": False,
    }
    if task is not None or prompt_mode == "authored":
        normalized_input = {"task": task, "inputs": inputs}
        if task is None:
            normalized_input.update(prompt=prompt, prompt_mode=prompt_mode)
        canonical = json.dumps(normalized_input, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        trace = {
            "task": task, "task_file": str(task_file.resolve()) if task_file else None,
            "prompt_file": str(args.prompt_file.resolve()) if task is None else None,
            "prompt_mode": prompt_mode, "raw_prompt": prompt,
            "raw_prompt_sha256": plan["raw_prompt_sha256"],
            "submitted_prompt_sha256": plan["submitted_prompt_sha256"],
            "normalized_generation_input": normalized_input,
            "generation_input_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
            "compiler_version": AUTHORED_COMPILER_VERSION if prompt_mode == "authored" else COMPILER_VERSION,
            "prompt_dialect": f"{args.provider}-static-image-refs/2" if prompt_mode == "authored" else f"{args.provider}-static-image-roles/1",
            "source_bindings": {item["id"]: f"<IMAGE_{item['index']}>" for item in inputs},
            "condition_expression": {
                "references": "image_reference_plus_text" if inputs else "none",
                "reference_strength": "soft" if inputs else None,
                "note": "Ordinary image references and text do not guarantee geometry or pixel preservation.",
                **{key: "authoring_metadata" if prompt_mode == "authored" else "text"
                   for key in ("attribute_sources", "preserve", "creative_freedom", "constraints")},
                "metadata": "provenance_only", "output_parameters": "native_parameter",
            },
            "service_prompt_rewrite": None,
            "image_model": model if args.provider in ("openai", "xai") else None,
        }
        plan.update(trace)
        plan["source_ref"] = str((args.out / "run.json").resolve())
        plan["requested_parameters"] = {
            **trace, "provider": args.provider, "request_model": model, "operation": operation,
            "submitted_prompt": submitted_prompt, "inputs": inputs,
            "quality": args.quality, "size": args.size, "resolution": args.resolution,
            "aspect_ratio": args.aspect_ratio, "reasoning_effort": plan["reasoning_effort"],
        }
    if args.provider == "openai":
        plan["transport"] = "codex-subscription"
        plan["authentication"] = "codex-cli-oauth"
        plan["image_model"] = model
        plan["requested_background"] = args.background
        plan.setdefault("requested_parameters", {}).update(image_model=model, background=args.background,
                                                          transport=plan["transport"])
    return endpoint, body, plan


def auth_headers(provider: str) -> dict:
    if provider == "xai":
        auth = json.loads((Path.home() / ".pi/agent/auth.json").read_text(encoding="utf-8"))
        entry = auth["xai"]
        if entry.get("type") != "oauth":
            raise ValueError("Expected existing OAuth credential; sign in through the Pi host")
        access_token = entry["access"]
    else:
        # Codex manages login and token refresh; this client only reads its credentials.
        path = Path.home() / ".codex/auth.json"
        if not path.is_file():
            raise ValueError("Codex login not found; run `codex login` and sign in with ChatGPT")
        auth = json.loads(path.read_text(encoding="utf-8"))
        tokens = auth.get("tokens") or {}
        access_token = tokens.get("access_token")
        account_id = tokens.get("account_id")
        if not access_token or not account_id:
            raise ValueError("Codex ChatGPT login required; run `codex login` and sign in with ChatGPT")
    headers = {"Authorization": "Bearer " + access_token}
    if provider in ("openai", "codex-legacy"):
        headers.update({
            "ChatGPT-Account-Id": account_id, "originator": "codex_cli_rs",
            "User-Agent": "codex_cli_rs/0.159.0", "Accept": "text/event-stream",
            "OpenAI-Beta": "responses=experimental", "session-id": str(uuid.uuid4()),
        })
        if provider == "openai":
            headers.update({"Accept": "application/json", "x-codex-image-turn-id": str(uuid.uuid4())})
    return headers


def read_openai(response: requests.Response, out: Path) -> tuple[list, dict]:
    """Read Codex's standalone subscription image response, retaining native IDs."""
    value = response.json()
    save(out / "response.json", value)
    items = value.get("data", [])
    rewrite, rewrites = service_rewrites(items)
    error = value.get("error")
    receipt = {
        "response_id": value.get("id") or response.headers.get("x-request-id"),
        "imagegen_request_id": response.headers.get("x-codex-imagegen-request-id"),
        "generation_ids": [item["generation_id"] for item in items if item.get("generation_id")],
        "response_model": value.get("model"), "usage": value.get("usage"),
        "service_prompt_rewrite": rewrite, "service_prompt_rewrites": rewrites,
        "returned_parameters": {key: value[key] for key in ("created", "background", "quality", "size", "output_format") if key in value},
        "outcome": "blocked" if is_blocked(error) else "failed" if error else "no-image",
        "errors": [{"source": "response", "error": error}] if error else [],
    }
    save(out / "receipt.json", receipt)
    if error or not items:
        raise ImageReceiptError(receipt)
    return decode_openai(value, out, receipt)


def decode_openai(value: dict, out: Path, receipt: dict) -> tuple[list, dict]:
    """Decode the saved subscription result without any transport or credentials."""
    receipt = {key: field for key, field in receipt.items()
               if key not in ("failure_category", "decode_error_type")}
    images = []
    try:
        for item in value["data"]:
            raw = base64.b64decode(item["b64_json"], validate=True)
            metadata = {**receipt.get("returned_parameters", {}),
                        **{key: field for key, field in item.items() if key != "b64_json"}}
            images.append((raw, metadata))
    except Exception as error:
        receipt.update(outcome="failed", decode_error_type=type(error).__name__)
        save(out / "receipt.json", receipt)
        raise ImageReceiptError(receipt) from error
    receipt["outcome"] = "completed"
    save(out / "receipt.json", receipt)
    return images, public_receipt(receipt)


def read_codex(response: requests.Response, out: Path) -> tuple[list, dict]:
    events = []
    try:
        for line in response.iter_lines():
            line = line.decode("utf-8") if isinstance(line, bytes) else line
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            event = json.loads(data)
            events.append(event)
            if event.get("type") in ("response.completed", "response.done", "response.failed", "response.incomplete", "error"):
                break
    except Exception as error:
        _, receipt = codex_receipt(events, interrupted=True)
        receipt["transport_error_type"] = type(error).__name__
        save(out / "receipt.json", receipt)
        raise ImageReceiptError(receipt) from error
    finally:
        save(out / "events.json", events)
    items, receipt = codex_receipt(events)
    save(out / "receipt.json", receipt)
    if receipt["outcome"] != "completed":
        raise ImageReceiptError(receipt)
    images = []
    try:
        for item in items:
            if item.get("result"):
                metadata = {key: value for key, value in item.items() if key not in ("type", "result")}
                images.append((base64.b64decode(item["result"], validate=True), metadata))
    except Exception as error:
        receipt.update(outcome="failed", decode_error_type=type(error).__name__)
        save(out / "receipt.json", receipt)
        raise ImageReceiptError(receipt) from error
    return images, public_receipt(receipt)


def read_xai(response: requests.Response, out: Path) -> tuple[list, dict]:
    value = response.json()
    save(out / "response.json", value)
    rewrite, rewrites = service_rewrites(value.get("data", []))
    error = value.get("error")
    receipt = {
        "response_id": value.get("id") or value.get("request_id") or response.headers.get("x-request-id"),
        "response_model": value.get("model"), "usage": value.get("usage"),
        "service_prompt_rewrite": rewrite, "service_prompt_rewrites": rewrites,
        "outcome": "blocked" if is_blocked(error) else "failed" if error else "no-image",
        "errors": [{"source": "response", "error": error}] if error else [],
    }
    save(out / "receipt.json", receipt)
    if error:
        raise ImageReceiptError(receipt)
    return download_xai(value, out, receipt)


def download_xai(value: dict, out: Path, receipt: dict) -> tuple[list, dict]:
    """Read accepted image bytes only; this path has no credentials or POST."""
    receipt = {key: field for key, field in receipt.items()
               if key not in ("transport_error_type", "failure_category", "download_http_status", "decode_error_type")}
    images = []
    try:
        for item in value.get("data", []):
            if item.get("b64_json"):
                raw = base64.b64decode(item["b64_json"], validate=True)
            else:
                # Separate request: never send the account bearer token to the image host.
                with requests.get(item["url"], timeout=90) as download:
                    download.raise_for_status()
                    raw = download.content
            metadata = {key: field for key, field in item.items() if key not in ("b64_json", "url")}
            images.append((raw, metadata))
    except Exception as failure:
        status = failure.response.status_code if isinstance(failure, requests.HTTPError) and failure.response is not None else None
        receipt.update(outcome="unconfirmed", transport_error_type=type(failure).__name__,
                       failure_category="download_url_expired" if status in (401, 403, 404, 410) else "download_failed")
        if status is not None:
            receipt["download_http_status"] = status
        save(out / "receipt.json", receipt)
        raise ImageReceiptError(receipt) from failure
    receipt["outcome"] = "completed" if images else "no-image"
    save(out / "receipt.json", receipt)
    if not images:
        raise ImageReceiptError(receipt)
    return images, public_receipt(receipt)


def store_images(images: list, out: Path) -> list[dict]:
    artifacts = []
    for index, (raw, metadata) in enumerate(images):
        # Retain bytes even if decoding fails; do not repeat the billed POST.
        candidate = out / f"image-{index}.bin"
        candidate.write_bytes(raw)
        with Image.open(io.BytesIO(raw)) as image:
            image.load()
            extension = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}[image.format]
            size = list(image.size)
        artifact = candidate.with_suffix("." + extension)
        candidate.replace(artifact)
        artifacts.append({"path": artifact.name, "sha256": hashlib.sha256(raw).hexdigest(),
                          "bytes": len(raw), "decoded_size": size, "returned_metadata": metadata})
    return artifacts


def recover_images(out: Path, *, execute: bool = False) -> dict:
    """Restore saved OpenAI bytes or download original accepted xAI URLs; no POST."""
    record = json.loads((out / "run.json").read_text(encoding="utf-8"))
    value = json.loads((out / "response.json").read_text(encoding="utf-8"))
    receipt = json.loads((out / "receipt.json").read_text(encoding="utf-8"))
    provider = record.get("provider")
    if provider not in ("openai", "xai"):
        raise ValueError("Image recovery requires an original OpenAI or xAI candidate directory")
    field = "b64_json" if provider == "openai" else "url"
    if value.get("error") or not value.get("data") or any(not item.get(field) for item in value["data"]):
        raise ValueError("No accepted image result in response.json; recovery cannot submit a request")
    if not execute:
        return {"status": "preview", "output_directory": str(out), "images": len(value["data"]),
                "maximum_post_requests": 0, "next_action": "Add --execute to restore saved results into this original directory."}
    # Preserve the previous transport result while current status describes this attempt.
    history = record.setdefault("recovery_attempts", [])
    attempt = {"started_at": datetime.now(timezone.utc).isoformat(), "previous_status": record.get("status"),
               "previous_transport_error_type": record.get("transport_error_type"),
               "previous_failure_category": record.get("failure_category")}
    try:
        decode = decode_openai if provider == "openai" else download_xai
        images, current = decode(value, out, receipt)
        artifacts = store_images(images, out)
        record.update(current, images=artifacts, status="completed", outcome="completed")
        for key in ("error_type", "error_detail", "transport_error_type", "failure_category", "download_http_status", "decode_error_type"):
            record.pop(key, None)
        record["next_action"] = "Inspect recovered images before use; no generation request was sent."
    except (ImageReceiptError, OSError, ValueError, KeyError) as error:
        if isinstance(error, ImageReceiptError):
            record.update(public_receipt(error.receipt))
        else:
            # Delivery succeeded but image decoding/storage did not complete.
            current = json.loads((out / "receipt.json").read_text(encoding="utf-8"))
            current.update(outcome="failed", failure_category="image_storage_failed", decode_error_type=type(error).__name__)
            save(out / "receipt.json", current)
            record.update(public_receipt(current))
        record.update(status=record["outcome"], error_type=type(error).__name__)
        expired = record.get("failure_category") == "download_url_expired"
        record["error_detail"] = ("Saved image URL expired or is no longer accessible; no POST was sent." if expired
                                  else "Image recovery/storage failed; inspect receipt.json and recover this same directory again.")
        record["next_action"] = ("Reconcile original accepted request with xAI; a replacement generation needs separate authorization." if expired
                                 else "Run recover --out on this original directory again; it only restores the saved results.")
    attempt.update(status=record["status"], failure_category=record.get("failure_category"),
                   finished_at=datetime.now(timezone.utc).isoformat())
    history.append(attempt)
    record["finished_at"] = attempt["finished_at"]
    save(out / "run.json", record)
    return record


def recover_xai(out: Path, *, execute: bool = False) -> dict:
    """Compatibility entry for callers of the original xAI recovery helper."""
    return recover_images(out, execute=execute)


def recovery_main(argv: list[str]) -> int:
    command = argparse.ArgumentParser(description="Restore saved OpenAI results or xAI URLs without submitting generation.")
    command.add_argument("--out", required=True, type=Path, help="Original candidate directory containing response.json, receipt.json and run.json")
    command.add_argument("--execute", action="store_true", help="Restore results and update the original receipt/run; default is read-only preview")
    args = command.parse_args(argv)
    try:
        record = recover_images(args.out, execute=args.execute)
    except (OSError, ValueError) as error:
        record = {"status": "failed", "error_type": type(error).__name__, "error_detail": str(error)}
    print(json.dumps(record, ensure_ascii=False, indent=2))
    return 0 if record["status"] in ("preview", "completed") else 1


def parser(*, provider: str | None = None) -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__ if provider is None else "Generate/edit images through the existing OpenAI subscription login. Preview by default.")
    if provider is None:
        command.add_argument("--provider", required=True, choices=MODELS)
    else:
        command.set_defaults(provider=provider, resolution=None, aspect_ratio=None, reasoning_effort=None)
    source = command.add_mutually_exclusive_group(required=True)
    source.add_argument("--prompt-file", type=Path)
    source.add_argument("--task-file", type=Path, help="Authored task JSON with prompt and optional generation.references; paths are relative to this file")
    command.add_argument("--prompt-mode", choices=("authored", "legacy"),
                         help="Authored by default on all routes; resolves {{ref:ID}} (ids 0, 1, ... for prompt-file). Select legacy explicitly for old xAI/Codex task compilation.")
    command.add_argument("--image", type=Path, action="append", help="Local reference; repeat in submission order; omit for text-to-image")
    command.add_argument("--image-role", action="append", help="Purpose of each reference, e.g. identity or pose-only; supply one per image when used")
    command.add_argument("--out", required=True, type=Path, help="New candidate directory for an actual request")
    command.add_argument("--model", help="Image model for OpenAI subscription/xAI; outer model for codex-legacy")
    command.add_argument("--background", choices=("auto", "opaque", "transparent"), help="OpenAI subscription output background")
    command.add_argument("--quality", choices=("low", "medium", "high", "auto"), help="Omitted by default; not silently low")
    command.add_argument("--size", help="OpenAI subscription/Codex image tool size; service-reported dimensions remain authoritative")
    command.add_argument("--execute", action="store_true", help="Submit a real image request; omit for offline preview")
    if provider is None:
        command.add_argument("--resolution", choices=("1k", "2k"), help="xAI only; separately controlled from quality")
        command.add_argument("--aspect-ratio", help="xAI output ratio, e.g. 3:4; otherwise multi-image edits follow the first reference")
        command.add_argument("--reasoning-effort", choices=("low", "medium", "high"), help="Codex outer model only; default low, not image quality")
        from .qwen_options import add_options
        add_options(command)
    return command


def main(argv: list[str] | None = None, *, provider: str | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "recover":
        return recovery_main(argv[1:])
    args = parser(provider=provider).parse_args(argv)
    if args.provider == "qwen":
        if args.background:
            raise ValueError("--background requires --provider openai")
        from .qwen_candidate import run
        return run(args)
    endpoint, body, plan = build_request(args)
    if not args.execute:
        print(json.dumps({"dry_run": True, **plan}, ensure_ascii=False, indent=2))
        return 0
    args.out.mkdir(parents=True, exist_ok=False)
    record = {**plan, "status": "started", "started_at": datetime.now(timezone(timedelta(hours=8))).isoformat()}
    save(args.out / "run.json", record)
    save(args.out / "request.json", body)
    try:
        headers = auth_headers(args.provider)
        with requests.post(endpoint, headers=headers, json=body, stream=args.provider in ("openai", "codex-legacy"),
                           timeout=150, allow_redirects=False) as response:
            record["http"] = response.status_code
            if args.provider == "openai":
                record["imagegen_request_id"] = response.headers.get("x-codex-imagegen-request-id")
            if not response.ok or response.is_redirect:
                (args.out / "http-error.bin").write_bytes(response.content)
                try:
                    value = response.json()
                except ValueError:
                    value = None
                error = (value["error"] if isinstance(value.get("error"), dict) else value) if isinstance(value, dict) else None
                blocked = response.status_code != 401 and is_blocked(error)
                code = error.get("code", "") if isinstance(error, dict) else ""
                authentication = response.status_code == 401 or code in (
                    "invalid_api_key", "invalid_token", "authentication_error", "unauthenticated:bad-credentials",
                )
                receipt = {
                    "response_id": (value.get("id") if isinstance(value, dict) else None) or response.headers.get("x-request-id"),
                    "outcome": "blocked" if blocked else "failed",
                    "failure_category": "content_refusal" if blocked else (
                        "authentication" if authentication else "http_error"
                    ),
                    "errors": [{"source": "http", "error": error}],
                }
                if args.provider == "openai":
                    receipt["imagegen_request_id"] = record["imagegen_request_id"]
                save(args.out / "receipt.json", receipt)
                raise ImageReceiptError(receipt)
            reader = {"openai": read_openai, "xai": read_xai, "codex-legacy": read_codex}[args.provider]
            images, receipt = reader(response, args.out)
            record.update(receipt)
        if not images:
            record["outcome"] = "no-image"
            raise ValueError("Response contains no image")
        record["images"] = store_images(images, args.out)
        record["status"] = "completed"
    except Exception as error:
        # Avoid credential/temporary download URLs in stdout and the public manifest.
        if isinstance(error, ImageReceiptError):
            record.update(public_receipt(error.receipt))
            record["error_detail"] = str(error)
        outcome = record.get("outcome", "unconfirmed")
        if outcome == "completed":
            outcome = "failed"
        record.update(status=outcome, outcome=outcome, error_type=type(error).__name__)
        if type(error) is ValueError:
            record["error_detail"] = str(error)
    record["finished_at"] = datetime.now(timezone(timedelta(hours=8))).isoformat()
    save(args.out / "run.json", record)
    print(json.dumps(record, ensure_ascii=False, indent=2))
    return 0 if record["status"] == "completed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
