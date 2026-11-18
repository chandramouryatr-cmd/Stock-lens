"""Ask Claude about something on the page (Anthropic API).

The API key is read from the ANTHROPIC_API_KEY environment variable, or from a file named
anthropic-key.txt in the stock-lens folder (that file is git-ignored). The key never reaches the browser.
"""
import os

import anthropic

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY_FILE = os.path.join(ROOT, "anthropic-key.txt")
MODEL = os.environ.get("STOCK_LENS_MODEL", "claude-opus-5-5")

SYSTEM = """You are the helper inside Stock Lens, a personal research tool for Indian listed stocks (NSE/BSE) built on free public data: Screener.in, Ministry of Corporate Affairs records, Yahoo Finance and Google News.

The reader is Mourya, an individual investor who is also improving his English. Write in plain, simple English. When you must use a finance word or a harder word, put a short meaning in brackets right after it, for example "dilution (new shares making each existing share a smaller slice)".

Keep answers short: usually under 150 words, unless he asks for more detail. Give the reason behind a point, not only the conclusion. When the page context below has the company's numbers and they help, use them and say which numbers you used. If something is not in the context and you are not sure, say so instead of guessing; your own knowledge of a company may be out of date.

You are not a licensed financial adviser. Explain, compare and point out what to check, but do not tell him to buy, sell or hold a particular stock, and do not predict prices.

You may use **bold** and short "- " bullet lists. Do not use tables or headings."""


def _key():
    k = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not k and os.path.exists(KEY_FILE):
        with open(KEY_FILE, encoding="utf-8") as f:
            k = f.read().strip()
    return k


def status():
    return {"configured": bool(_key()), "model": MODEL}


def _clean(messages):
    if not isinstance(messages, list) or not messages:
        raise ValueError("No question was sent.")
    out = []
    for m in messages[-16:]:
        role, text = (m or {}).get("role"), str((m or {}).get("content") or "").strip()
        if role not in ("user", "assistant") or not text:
            continue
        out.append({"role": role, "content": text[:6000]})
    while out and out[0]["role"] != "user":  # the conversation must start with the user
        out.pop(0)
    if not out or out[-1]["role"] != "user":
        raise ValueError("The last message must be your question.")
    return out


def ask(body):
    key = _key()
    if not key:
        raise LookupError("NO_KEY")
    messages = _clean(body.get("messages"))
    context = str(body.get("context") or "")[:8000]
    system = SYSTEM + ("\n\nWhat Mourya is looking at in Stock Lens right now:\n" + context if context else "")
    client = anthropic.Anthropic(api_key=key, timeout=90.0, max_retries=2)
    try:
        resp = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=system,
            messages=messages,
            output_config={"effort": "low"},  # short explanations: low effort is quick and cheap
            # If Claude declines for a safety reason, the API retries on a suitable fallback model.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError:
        raise RuntimeError("The Anthropic API key was not accepted. Check the key in anthropic-key.txt.")
    except anthropic.PermissionDeniedError:
        raise RuntimeError("This API key is not allowed to use the model. Check your Anthropic account.")
    except anthropic.RateLimitError:
        raise RuntimeError("Too many questions in a short time, or the account has no credit left. Wait a minute and try again.")
    except anthropic.APIStatusError as e:
        msg = getattr(e, "message", "") or str(e)
        if "credit" in msg.lower() or "billing" in msg.lower():
            raise RuntimeError("Your Anthropic account has no credit left. Add credit in the Anthropic Console.")
        raise RuntimeError(f"Claude could not answer right now ({e.status_code}). Try again shortly.")
    except anthropic.APIConnectionError:
        raise RuntimeError("Could not reach Claude. Check the internet connection.")

    if resp.stop_reason == "refusal":
        return {"answer": "Claude declined to answer this one. Try asking it in a different way.", "refused": True}
    text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
    if resp.stop_reason == "max_tokens":
        text += "\n\n(The answer was cut off because it was too long.)"
    usage = getattr(resp, "usage", None)
    return {
        "answer": text or "Claude returned an empty answer. Try asking again.",
        "model": resp.model,
        "tokens": {"in": getattr(usage, "input_tokens", None), "out": getattr(usage, "output_tokens", None)},
    }
