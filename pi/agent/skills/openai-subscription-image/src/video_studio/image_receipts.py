"""Structured image-tool receipts; no prompt inspection or automatic retries."""
from __future__ import annotations


class ImageReceiptError(ValueError):
    """A failed/unfinished request with an already archived provider receipt."""

    def __init__(self, receipt: dict):
        self.receipt = receipt
        super().__init__(f"Image request {receipt['outcome']}; inspect private receipt.json and provider logs")


def merge_image_items(events: list[dict]) -> list[dict]:
    """Retain done items absent from final output, merging duplicates by tool id."""
    items = []
    positions = {}
    for event in events:
        candidates = []
        if event.get("type") == "response.output_item.done":
            candidates.append(event.get("item", {}))
        if event.get("type") in ("response.completed", "response.done", "response.failed", "response.incomplete"):
            candidates.extend(event.get("response", {}).get("output") or [])
        for item in candidates:
            if item.get("type") != "image_generation_call":
                continue
            item_id = item.get("id")
            if item_id and item_id in positions:
                previous = items[positions[item_id]]
                # Terminal envelopes may use empty sentinels for fields that were
                # present in an earlier item. They cannot erase delivered bytes,
                # rewrites, or explicit failure evidence for that same tool id.
                for key, value in item.items():
                    if value is None:
                        continue
                    if key in ("error", "result", "revised_prompt") and not value:
                        continue
                    if key == "status" and previous.get("status") in ("failed", "error"):
                        continue
                    previous[key] = value
            elif not item_id and item in items:
                continue
            else:
                if item_id:
                    positions[item_id] = len(items)
                items.append(dict(item))
    return items


def is_blocked(error: object) -> bool:
    """Only explicit provider error codes classify content refusals."""
    return isinstance(error, dict) and error.get("code") in (
        "moderation_blocked", "content_policy_violation", "image_generation_safety_violation",
    )


def service_rewrites(items: list[dict]) -> tuple[object, list[dict]]:
    rewrites = [{"id": item.get("id"), "revised_prompt": item["revised_prompt"]}
                for item in items if item.get("revised_prompt") is not None]
    # Keep the common one-image field a string; preserve all multi-image rewrites.
    value = rewrites[0]["revised_prompt"] if len(rewrites) == 1 else (
        [item["revised_prompt"] for item in rewrites] if rewrites else None
    )
    return value, rewrites


def codex_receipt(events: list[dict], interrupted: bool = False) -> tuple[list[dict], dict]:
    items = merge_image_items(events)
    receipt = {"response_id": None, "usage": None, "response_status": None,
               "terminal_confirmed": False, "errors": []}
    outer_failed = False
    for event in events:
        kind = event.get("type")
        response = event.get("response", {})
        if response.get("id"):
            receipt["response_id"] = response["id"]
        if response.get("usage") is not None:
            receipt["usage"] = response["usage"]
        if response.get("status"):
            receipt["response_status"] = response["status"]
        if kind in ("response.completed", "response.done"):
            receipt["terminal_confirmed"] = response.get("status") not in ("failed", "incomplete")
        if kind in ("error", "response.failed") or response.get("status") == "failed":
            outer_failed = True
            error = event.get("error") or response.get("error")
            if error is None:
                error = {key: event[key] for key in ("type", "code", "message", "param") if key in event}
            receipt["errors"].append({"source": kind, "error": error})
        if kind == "response.incomplete" or response.get("status") == "incomplete":
            receipt["incomplete_details"] = response.get("incomplete_details")
    for item in items:
        if item.get("status") in ("failed", "error") or item.get("error"):
            receipt["errors"].append({"source": "image_generation_call", "id": item.get("id"),
                                      "status": item.get("status"), "error": item.get("error")})
    rewrite, rewrites = service_rewrites(items)
    receipt.update(service_prompt_rewrite=rewrite, service_prompt_rewrites=rewrites)
    if any(is_blocked(entry.get("error")) for entry in receipt["errors"]):
        outcome = "blocked"
    elif receipt["errors"] or outer_failed:
        outcome = "failed"
    elif interrupted or not receipt["terminal_confirmed"]:
        outcome = "unconfirmed"
    elif not any(item.get("result") for item in items):
        outcome = "no-image"
    else:
        outcome = "completed"
    receipt["outcome"] = outcome
    return items, receipt


def public_receipt(receipt: dict) -> dict:
    """Expose structured classification; free-form provider errors stay private."""
    public = {key: value for key, value in receipt.items() if key != "errors"}
    public["errors"] = []
    for entry in receipt.get("errors", []):
        error = entry.get("error")
        fields = {key: error[key] for key in ("type", "code", "param", "moderation_details") if key in error} if isinstance(error, dict) else {}
        public["errors"].append({**{key: value for key, value in entry.items() if key != "error"},
                                 "error": fields})
    public["receipt_ref"] = "receipt.json"
    return public
