"""
Spanish NER recall layer — deploy-READY Vercel Python function (NOT deployed).

Plan reference: zoom-integration-plan.md §12. This is the OPTIONAL layer that
sits behind the required Node sanitizer. It is kept under scripts/spikes/ so
merging phase Z0B does NOT extend the deployed surface: `main` auto-deploys, and
a file at the repo root under api/ would go live. Shipping it means moving this
file to api/ner.py deliberately, in the phase that wires it (Z5).

CONTRACT
--------
POST  Authorization: Bearer <NER_SHARED_SECRET>
      {"text": "...", "attendees": ["Nombre Apellido", ...], "requestId": "..."}

200   {"status": "ok",
       "entities": [{"surface": "...", "start": 0, "end": 7, "label": "PER"}],
       "model": "es_core_news_md", "modelVersion": "3.8.0",
       "requestId": "..."}

4xx/5xx {"status": "unavailable", "sanitizationStatus": "flagged",
         "reason": "...", "requestId": "..."}

Two properties this contract exists to enforce:

1. **It returns ENTITIES, not sanitized text.** Redaction and `[persona N]`
   numbering stay in the Node layer, which is the single source of truth for
   token stability. A service that also redacted would give two components an
   opinion on the same output and they would drift.

2. **Failure is never silent degradation.** Any non-200, timeout, or malformed
   response obliges the caller to set `sanitization_status = 'flagged'`, which
   blocks minuta generation until a human reviews it. The response body says so
   explicitly so the rule is visible at the boundary, not just in the caller.
   Availability is never traded for recall.

Raw transcript text passes through this function. It is FNE-controlled
infrastructure, not a third-party model, which is why raw text may reach it at
all — but it must never log the body, and it does not.
"""

from __future__ import annotations

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler

MODEL_NAME = "es_core_news_md"
MAX_BODY_BYTES = 4_000_000  # under Vercel's 4.5 MB request-body limit

# Loaded once per instance. Fluid compute reuses instances across invocations,
# so the model load is paid on a cold start, not per request.
_nlp = None
_load_error: str | None = None


def _get_nlp():
    global _nlp, _load_error
    if _nlp is not None or _load_error is not None:
        return _nlp
    try:
        import spacy

        # The NER pipe is all this service exists for; the rest is latency.
        _nlp = spacy.load(MODEL_NAME, exclude=["lemmatizer", "textcat"])
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as 503
        _load_error = f"model load failed: {type(exc).__name__}"
    return _nlp


def _authorized(header_value: str | None) -> bool:
    secret = os.environ.get("NER_SHARED_SECRET", "")
    if not secret:
        return False
    if not header_value or not header_value.startswith("Bearer "):
        return False
    # Constant-time comparison — a timing oracle on a shared secret is cheap to
    # avoid and expensive to discover later.
    return hmac.compare_digest(header_value[len("Bearer ") :], secret)


class handler(BaseHTTPRequestHandler):
    # Silences the default stderr access log, which would echo request lines.
    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return

    def _respond(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _unavailable(self, code: int, reason: str, request_id: str = "") -> None:
        self._respond(
            code,
            {
                "status": "unavailable",
                # The caller MUST honour this: recall never degrades silently.
                "sanitizationStatus": "flagged",
                "reason": reason,
                "requestId": request_id,
            },
        )

    def do_GET(self) -> None:
        """Health probe. Reports readiness without exposing the secret."""
        nlp = _get_nlp()
        if nlp is None:
            self._unavailable(503, _load_error or "model unavailable")
            return
        self._respond(200, {"status": "ok", "model": MODEL_NAME})

    def do_POST(self) -> None:
        if not _authorized(self.headers.get("Authorization")):
            self._unavailable(401, "unauthorized")
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._unavailable(400, "invalid content-length")
            return

        if length <= 0:
            self._unavailable(400, "empty body")
            return
        if length > MAX_BODY_BYTES:
            self._unavailable(413, "body too large")
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._unavailable(400, "malformed json")
            return

        request_id = str(payload.get("requestId") or "")
        text = payload.get("text")
        if not isinstance(text, str) or not text:
            self._unavailable(400, "missing text", request_id)
            return

        nlp = _get_nlp()
        if nlp is None:
            self._unavailable(503, _load_error or "model unavailable", request_id)
            return

        try:
            doc = nlp(text)
        except Exception as exc:  # noqa: BLE001 - never leak internals
            self._unavailable(500, f"inference failed: {type(exc).__name__}", request_id)
            return

        # Every label is returned, not just PER. The Z0B spike measured that
        # Spanish NER routinely tags an ambiguous given name LOC/ORG/MISC
        # (Florencia -> LOC, Rosa -> MISC), so filtering to PER here would throw
        # away most of the recall this layer exists to add. The caller applies
        # its own non-person lexicon and shape filter.
        entities = [
            {
                "surface": ent.text,
                "start": ent.start_char,
                "end": ent.end_char,
                "label": ent.label_,
                "tokens": len(ent),
                "hasVerb": any(t.pos_ in ("VERB", "AUX") for t in ent),
            }
            for ent in doc.ents
        ]

        self._respond(
            200,
            {
                "status": "ok",
                "entities": entities,
                "model": MODEL_NAME,
                "modelVersion": _model_version(),
                "requestId": request_id,
            },
        )


def _model_version() -> str:
    try:
        import spacy

        meta = spacy.util.get_model_meta(spacy.util.get_package_path(MODEL_NAME))
        return str(meta.get("version", "unknown"))
    except Exception:  # noqa: BLE001
        return "unknown"
