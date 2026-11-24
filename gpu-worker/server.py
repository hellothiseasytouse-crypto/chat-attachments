import os
import secrets
from typing import Any

import torch
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from airllm import AutoModel

MODEL_ID = os.getenv("MODEL_ID", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B")
WORKER_API_KEY = os.getenv("WORKER_API_KEY", "")
MAX_INPUT_TOKENS = int(os.getenv("MAX_INPUT_TOKENS", "4096"))
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "768"))

if not WORKER_API_KEY:
    raise RuntimeError("Set WORKER_API_KEY before starting the worker.")

app = FastAPI(title="NOXEN AirLLM GPU Worker", version="1.0.0")
model = None

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str = "airllm"
    messages: list[ChatMessage]
    max_tokens: int = Field(default=512, ge=1, le=1024)
    temperature: float = Field(default=0.6, ge=0.0, le=1.5)
    stream: bool = False

def require_auth(authorization: str | None):
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not supplied or not secrets.compare_digest(supplied, WORKER_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid worker key.")

@app.on_event("startup")
def load_model():
    global model
    # AirLLM streams model layers from local disk; first boot may take a long time
    # and requires substantial persistent disk space for the downloaded weights.
    model = AutoModel.from_pretrained(
        MODEL_ID,
        compression=os.getenv("AIRLLM_COMPRESSION") or None,
        delete_original=os.getenv("AIRLLM_DELETE_ORIGINAL", "false").lower() == "true",
        trust_remote_code=True,
    )

@app.get("/health")
def health(authorization: str | None = Header(default=None)):
    require_auth(authorization)
    return {
        "ok": model is not None,
        "model_id": MODEL_ID,
        "backend": "AirLLM",
        "cuda_available": torch.cuda.is_available(),
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }

@app.post("/v1/chat/completions")
def chat(request: ChatRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    if request.stream:
        raise HTTPException(status_code=400, detail="Streaming is not enabled in this worker yet.")
    if model is None:
        raise HTTPException(status_code=503, detail="Model is still loading.")

    messages = [{"role": item.role, "content": item.content} for item in request.messages]
    tokenizer = model.tokenizer
    if getattr(tokenizer, "chat_template", None):
        template_options = {"thinking": True, "thinking_effort": os.getenv("KIMI_REASONING_EFFORT", "low")} if "Kimi-K3" in MODEL_ID else {}
        encoded = tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            return_tensors="pt",
            return_dict=True,
            **template_options,
        )
        input_ids = encoded["input_ids"]
        if input_ids.shape[-1] > MAX_INPUT_TOKENS:
            raise HTTPException(status_code=413, detail="Prompt exceeds the configured input token limit.")
        generation = model.generate(
            **{key: value.to(model.device) for key, value in encoded.items()},
            max_new_tokens=min(request.max_tokens, MAX_NEW_TOKENS),
            temperature=request.temperature,
            do_sample=request.temperature > 0,
            use_cache=True,
            return_dict_in_generate=True,
        )
        prompt_length = input_ids.shape[-1]
        generated = generation.sequences[0][prompt_length:]
    else:
        prompt = "\n".join(item["role"].upper() + ": " + item["content"] for item in messages) + "\nASSISTANT:"
        encoded = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=MAX_INPUT_TOKENS)
        generation = model.generate(
            encoded["input_ids"].to(model.device),
            max_new_tokens=min(request.max_tokens, MAX_NEW_TOKENS),
            temperature=request.temperature,
            do_sample=request.temperature > 0,
            use_cache=True,
            return_dict_in_generate=True,
        )
        generated = generation.sequences[0][encoded["input_ids"].shape[-1]:]

    answer = tokenizer.decode(generated, skip_special_tokens=True).strip()
    return {
        "id": "noxen-airllm-completion",
        "object": "chat.completion",
        "model": MODEL_ID,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": answer}, "finish_reason": "stop"}],
    }
