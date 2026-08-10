#!/usr/bin/env python3
"""
english_text — Multi-Engine Bridge

textAPIenglish_textimagegenerationtext：
  - Gemini 3 Pro（text，english_text）
  - MiniMax image-01（text，english_text）
  - Midjourney API（english_text，text）
  - DALL·E 3（english_text，text）
  - Stable Diffusion XL / FLUX local（english_text，text）

text：
  # automaticenglish_text
  python multi_engine_bridge.py \
    --prompt "A product on a white background" \
    --scene scene_03_premium \
    --category fashion

  # english_text
  python multi_engine_bridge.py \
    --prompt "..." \
    --reference-images product.jpg \
    --engine gemini \
    --output output.jpg
"""

import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional
import yaml

# english_text
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import (
    guess_mime, image_to_data_url, save_base64_image, setup_logger, get_api_key,
    gemini_image_generate_url, gemini_image_generation_config, get_gemini_image_model,
    get_openai_image_api_base, get_openai_image_model,
)
from common.resilient import (
    retry_with_backoff, get_rate_limiter, get_circuit_breaker,
    CircuitOpenError,
)
from common.metrics import track_api_call, get_tracker

logger = setup_logger(__name__)


# ============================================================
# english_text
# ============================================================

class EngineBase:
    """english_text"""
    name = "base"

    def __init__(self, config: dict, api_key: str):
        self.config = config
        self.api_key = api_key

    def generate(self, prompt: str, ref_images: list[str], output_file: str,
                 aspect_ratio: str, **kwargs) -> str:
        raise NotImplementedError

    @staticmethod
    def image_to_data_url(image_path: str) -> str:
        return image_to_data_url(image_path)

    @staticmethod
    def save_image(base64_data: str, output_file: str):
        save_base64_image(base64_data, output_file)

    def _handle_error(self, stage: str, exc: Exception) -> str:
        return f"[{self.name}] {stage} failed: {exc}"


class GeminiEngine(EngineBase):
    """Gemini 3 Pro text"""
    name = "gemini"

    def generate(self, prompt: str, ref_images: list[str], output_file: str,
                 aspect_ratio: str, **kwargs) -> str:
        import requests
        api_key = self.api_key or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return self._handle_error("config", ValueError("GEMINI_API_KEY not set"))

        parts = []
        for img in ref_images:
            if not os.path.exists(img):
                continue
            mime = self._guess_mime(img)
            with open(img, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            parts.append({"inlineData": {"mimeType": mime, "data": b64}})
        parts.append({"text": prompt})

        api_url = self.config.get("api_base") or gemini_image_generate_url()
        if "gemini-3-pro-image-preview" in api_url:
            api_url = gemini_image_generate_url()

        resp = requests.post(
            api_url,
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json={
                "generationConfig": gemini_image_generation_config(aspect_ratio),
                "contents": [{"parts": parts}],
            },
            timeout=int(kwargs.get("timeout", 120)),
        )
        resp.raise_for_status()
        data = resp.json()
        for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
            if part.get("inlineData"):
                self.save_image(part["inlineData"]["data"], output_file)
                return f"Gemini → {os.path.basename(output_file)}"
        return self._handle_error("response", RuntimeError("No image data"))

    @staticmethod
    def _guess_mime(path: str) -> str:
        return guess_mime(path)


class MiniMaxEngine(EngineBase):
    """MiniMax image-01 text"""
    name = "minimax"

    def generate(self, prompt: str, ref_images: list[str], output_file: str,
                 aspect_ratio: str, **kwargs) -> str:
        import requests
        api_key = self.api_key or os.getenv("MINIMAX_API_KEY")
        if not api_key:
            return self._handle_error("config", ValueError("MINIMAX_API_KEY not set"))

        host = (os.getenv("MINIMAX_API_HOST") or
                self.config.get("default_host", "https://api.minimaxi.com")).rstrip("/")
        model = (os.getenv("MINIMAX_IMAGE_MODEL") or
                 self.config.get("default_model", "image-01"))

        # MiniMax prompt english_text
        max_chars = self.config.get("prompt_max_chars", 1500)
        if len(prompt) > max_chars:
            prompt = prompt[:max_chars - 3] + "..."

        body = {
            "model": model,
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "response_format": "base64",
            "n": 1,
            "prompt_optimizer": True,
        }
        if ref_images:
            body["subject_reference"] = [
                {"type": "character", "image_file": self.image_to_data_url(p)}
                for p in ref_images if os.path.exists(p)
            ]

        resp = requests.post(
            f"{host}/v1/image_generation",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=body,
            timeout=int(kwargs.get("timeout", 90)),
        )
        resp.raise_for_status()
        payload = resp.json()
        base_resp = payload.get("base_resp") or {}
        if base_resp.get("status_code", 0) != 0:
            return self._handle_error("api",
                RuntimeError(f"code {base_resp['status_code']}: {base_resp.get('status_msg')}"))
        images = (payload.get("data") or {}).get("image_base64") or []
        if not images:
            return self._handle_error("response", RuntimeError("No image data"))
        self.save_image(images[0], output_file)
        return f"MiniMax → {os.path.basename(output_file)}"


class MidjourneyEngine(EngineBase):
    """
    Midjourney API text
    textpassedenglish_text（text GoAPI, UseAPI, Replicate）text
    """
    name = "midjourney"

    def generate(self, prompt: str, ref_images: list[str], output_file: str,
                 aspect_ratio: str, **kwargs) -> str:
        api_key = self.api_key or os.getenv("MIDJOURNEY_API_KEY")
        if not api_key:
            return self._handle_error("config", ValueError("MIDJOURNEY_API_KEY not set"))

        # detectiontextplatform（passed base URL text）
        api_base = self.config.get("api_base", "https://api.midjourney.com/v2")

        # GoAPI.net textAPI
        if "goapi" in api_base or "midjourney" in api_base:
            return self._generate_via_proxy(prompt, ref_images, output_file, aspect_ratio, api_key, api_base)
        # Replicate textAPI
        elif "replicate" in api_base:
            return self._generate_via_replicate(prompt, output_file, aspect_ratio, api_key, api_base)
        else:
            return self._generate_via_proxy(prompt, ref_images, output_file, aspect_ratio, api_key, api_base)

    def _generate_via_proxy(self, prompt: str, ref_images: list[str], output_file: str,
                            aspect_ratio: str, api_key: str, api_base: str) -> str:
        """passed GoAPI/UseAPI english_textgeneration"""
        import requests
        mj_prompt = self.build_mj_prompt(prompt, aspect_ratio)

        resp = requests.post(
            f"{api_base.rstrip('/')}/imagine",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"prompt": mj_prompt},
            timeout=60,
        )
        resp.raise_for_status()
        task_id = resp.json().get("task_id") or resp.json().get("id")
        if not task_id:
            return self._handle_error("response", RuntimeError("No task_id returned"))

        # english_text（text 3 text）
        for _ in range(30):
            time.sleep(6)
            r = requests.get(
                f"{api_base.rstrip('/')}/task/{task_id}",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=30,
            )
            r.raise_for_status()
            data = r.json()
            status = data.get("status", "").lower()
            if status in ("finished", "completed", "success"):
                image_url = (
                    data.get("image_url")
                    or data.get("output", {}).get("image_url")
                    or data.get("imageUrl")
                )
                if not image_url:
                    return self._handle_error("response", RuntimeError("No image_url in result"))
                # textimage
                img_resp = requests.get(image_url, timeout=60)
                img_resp.raise_for_status()
                os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
                with open(output_file, "wb") as f:
                    f.write(img_resp.content)
                return f"Midjourney → {os.path.basename(output_file)}"
            if status in ("failed", "error"):
                return self._handle_error("api", RuntimeError(data.get("error", "Task failed")))

        return self._handle_error("timeout", TimeoutError("Midjourney task timeout"))

    def _generate_via_replicate(self, prompt: str, output_file: str,
                                aspect_ratio: str, api_key: str, api_base: str) -> str:
        """passed Replicate API generation"""
        import requests
        # Replicate text Midjourney text ID
        model_id = "prompthero/openjourney:ad59bc811eb8d6e0acf8386c4dc7de2de2adfe1aac3f9caf0a8b8b8c5cd5c8d0"
        ar_map = {"1:1": "1:1", "4:3": "4:3", "3:4": "3:4", "16:9": "16:9", "9:16": "9:16"}
        resp = requests.post(
            "https://api.replicate.com/v1/predictions",
            headers={"Authorization": f"Token {api_key}", "Content-Type": "application/json"},
            json={
                "version": model_id.split(":")[1],
                "input": {
                    "prompt": prompt,
                    "aspect_ratio": ar_map.get(aspect_ratio, "1:1"),
                }
            },
            timeout=60,
        )
        resp.raise_for_status()
        prediction = resp.json()
        # text：texttask ID，english_text
        return self._handle_error("response",
            NotImplementedError("Replicate english_text，text _generate_via_proxy text"))

    def build_mj_prompt(self, base_prompt: str, aspect_ratio: str,
                        style: str = "raw", ref_url: Optional[str] = None) -> str:
        """text Midjourney english_text prompt"""
        ar_map = {"1:1": "--ar 1:1", "4:3": "--ar 4:3", "3:4": "--ar 3:4",
                   "16:9": "--ar 16:9", "9:16": "--ar 9:16"}
        ar_param = ar_map.get(aspect_ratio, "--ar 1:1")
        style_param = f"--style {style}" if style else ""
        ref_param = f"--cref {ref_url}" if ref_url else ""
        return f"{base_prompt} {ar_param} {style_param} {ref_param} --v 6 --s 250".strip()


class DALLEEngine(EngineBase):
    """OpenAI english_text（DALL·E 3 / gpt-image-2 via jojocode）"""
    name = "dalle"

    def generate(self, prompt: str, ref_images: list[str], output_file: str,
                 aspect_ratio: str, **kwargs) -> str:
        from common.utils import resolve_image_openai_api_key

        api_key = self.api_key or resolve_image_openai_api_key()
        if not api_key:
            return self._handle_error("config", ValueError("OPENAI_API_KEY not set"))

        import requests

        base = get_openai_image_api_base(self.config.get("api_base"))
        if base.endswith("/images/generations"):
            base = base.rsplit("/images/generations", 1)[0]
        model = get_openai_image_model(self.config.get("model"))

        size_map = {
            "1:1": "1024x1024",
            "3:4": "1024x1536",
            "4:3": "1536x1024",
            "9:16": "1024x1536",
            "16:9": "1536x1024",
        }
        size = size_map.get(aspect_ratio, "1024x1024")

        # yesenglish_text /images/edits english_text（english_text，english_textconsistency）；
        # textnoneenglish_text /images/generations。
        valid_refs = [p for p in (ref_images or []) if os.path.exists(p)]
        if valid_refs:
            opened = []
            try:
                files = []
                for p in valid_refs[:8]:
                    handle = open(p, "rb")
                    opened.append(handle)
                    files.append(("image[]", (os.path.basename(p), handle, guess_mime(p))))
                resp = requests.post(
                    f"{base}/images/edits",
                    headers={"Authorization": f"Bearer {api_key}"},
                    data={
                        "model": model,
                        "prompt": prompt[:4000],
                        "n": "1",
                        "size": size,
                        "response_format": "b64_json",
                    },
                    files=files,
                    timeout=180,
                )
            finally:
                for handle in opened:
                    handle.close()
        else:
            resp = requests.post(
                f"{base}/images/generations",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "prompt": prompt[:4000],
                    "n": 1,
                    "size": size,
                    "response_format": "b64_json",
                },
                timeout=120,
            )
        resp.raise_for_status()
        data = resp.json()
        b64 = (data.get("data") or [{}])[0].get("b64_json")
        if b64:
            import base64
            os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
            with open(output_file, "wb") as f:
                f.write(base64.b64decode(b64))
            return f"{model} → {os.path.basename(output_file)}"

        image_url = (data.get("data") or [{}])[0].get("url")
        if image_url:
            img_resp = requests.get(image_url, timeout=60)
            img_resp.raise_for_status()
            os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
            with open(output_file, "wb") as f:
                f.write(img_resp.content)
            return f"{model} → {os.path.basename(output_file)}"
        return self._handle_error("response", RuntimeError("No image data"))


class SDLocalEngine(EngineBase):
    """Stable Diffusion / FLUX localtext — passed AUTOMATIC1111 WebUI API text"""
    name = "sdxl_local"

    def generate(self, prompt: str, ref_images: list[str], output_file: str,
                 aspect_ratio: str, **kwargs) -> str:
        sd_url = self.api_key or os.getenv("SD_API_URL", "http://localhost:7860")
        if not sd_url:
            return self._handle_error("config", ValueError("SD_API_URL not set"))

        import requests
        from PIL import Image as PILImage
        import io

        ar_map = {
            "1:1": (1024, 1024),
            "3:4": (896, 1152),
            "4:3": (1152, 896),
            "16:9": (1280, 720),
            "9:16": (720, 1280),
        }
        width, height = ar_map.get(aspect_ratio, (1024, 1024))

        # 1. txt2img text
        payload = {
            "prompt": prompt,
            "negative_prompt": kwargs.get("negative_prompt", ""),
            "width": width,
            "height": height,
            "steps": kwargs.get("steps", 30),
            "cfg_scale": kwargs.get("cfg_scale", 7.0),
            "sampler_name": kwargs.get("sampler", "DPM++ 2M Karras"),
        }

        # 2. textyesenglish_text，text ControlNet (ip-adapter)
        if ref_images and os.path.exists(ref_images[0]):
            payload["alwayson_scripts"] = {
                "controlnet": {
                    "args": [
                        {
                            "input_image": self._image_to_b64(ref_images[0]),
                            "module": "ip-adapter_clip_sdxl",
                            "model": "ip-adapter-plus_sdxl_vit-h",
                            "weight": 0.8,
                            "guidance_start": 0.0,
                            "guidance_end": 1.0,
                        }
                    ]
                }
            }

        try:
            resp = requests.post(
                f"{sd_url.rstrip('/')}/sdapi/v1/txt2img",
                json=payload,
                timeout=300,
            )
            resp.raise_for_status()
            data = resp.json()
            images = data.get("images", [])
            if not images:
                return self._handle_error("response", RuntimeError("No images in SD response"))

            # SD text base64
            import base64
            img_b64 = images[0]
            os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
            with open(output_file, "wb") as f:
                f.write(base64.b64decode(img_b64))
            return f"SDXL Local → {os.path.basename(output_file)}"
        except requests.exceptions.ConnectionError as e:
            return self._handle_error("connection", ConnectionError(
                f"nonetextconnection SD WebUI ({sd_url})。english_text SD WebUI english_text API。"
            ))

    @staticmethod
    def _image_to_b64(image_path: str) -> str:
        """imagetext base64（SD WebUI english_text）"""
        import base64
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")


# ============================================================
# english_text
# ============================================================

ENGINE_REGISTRY = {
    "gemini": GeminiEngine,
    "minimax": MiniMaxEngine,
    "midjourney": MidjourneyEngine,
    "dalle": DALLEEngine,
    "sdxl_local": SDLocalEngine,
}


def create_engine(name: str, config: dict, api_key: Optional[str] = None):
    """english_text"""
    engine_cls = ENGINE_REGISTRY.get(name)
    if not engine_cls:
        raise ValueError(f"Unknown engine: {name}. Available: {list(ENGINE_REGISTRY.keys())}")
    return engine_cls(config, api_key)


# ============================================================
# english_text
# ============================================================

def load_engine_config(config_path: Optional[str] = None) -> dict:
    """text engine_config.yaml"""
    if config_path is None:
        config_path = os.path.join(os.path.dirname(__file__), "..", "engine_config.yaml")
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    return {}


def select_best_engine(
    scene_id: str,
    category: str = "general",
    quality: str = "standard",
    config: Optional[dict] = None,
) -> list[str]:
    """
    textscenetextcategoryenglish_text（english_text）。

    text:
        english_text（english_text）
    """
    if config is None:
        config = load_engine_config()

    rules = config.get("scene_engine_rules", {})
    candidates = []

    # text1：textscene
    by_scene = rules.get("by_scene", {}).get(scene_id, [])
    candidates.extend(by_scene)

    # text2：textcategory
    by_category = rules.get("by_category", {}).get(category, [])
    candidates.extend(by_category)

    # text3：english_text
    by_quality = rules.get("by_quality", {}).get(quality, [])

    # english_text
    seen = set()
    ordered = []
    for engine in candidates + by_quality + config.get("default_engine_priority", ["gemini"]):
        if engine not in seen:
            seen.add(engine)
            ordered.append(engine)

    return ordered


# ============================================================
# textgenerationAPI
# ============================================================

def generate_with_best_engine(
    prompt: str,
    ref_images: list[str],
    output_file: str,
    scene_id: str = "general",
    category: str = "general",
    quality: str = "standard",
    preferred_engine: Optional[str] = None,
    engine_config: Optional[dict] = None,
    api_keys: Optional[dict] = None,
    aspect_ratio: str = "1:1",
    fallback: bool = True,
    **kwargs,
) -> dict:
    """
    english_textgenerationimage。

    text:
        prompt: image prompt
        ref_images: english_text
        output_file: outputtext
        scene_id: scene ID（english_text）
        category: textcategory
        preferred_engine: english_text
        fallback: english_textfailedtextyesnotext

    text:
        {"engine": "gemini", "success": True/False, "output_path": "...", "error": "..."}
    """
    config = engine_config or load_engine_config()

    if preferred_engine:
        engine_order = [preferred_engine]
    else:
        engine_order = select_best_engine(scene_id, category, quality, config)

    engines_config = config.get("engines", {})

    for engine_name in engine_order:
        eng_cfg = engines_config.get(engine_name, {})
        env_var = eng_cfg.get("provider_env", "")
        api_key = (api_keys or {}).get(engine_name) or os.getenv(env_var)
        if engine_name in ("dalle",) and not api_key:
            from common.utils import resolve_image_openai_api_key
            api_key = resolve_image_openai_api_key()

        if not api_key and engine_name not in ("sdxl_local",):
            continue

        try:
            limiter = get_rate_limiter(engine_name)
            breaker = get_circuit_breaker(engine_name)
            tracker = get_tracker()

            if not limiter.acquire(timeout=120):
                if not fallback:
                    continue
                continue

            def _do_generate():
                eng = create_engine(engine_name, eng_cfg, api_key)
                return eng.generate(
                    prompt=prompt,
                    ref_images=ref_images,
                    output_file=output_file,
                    aspect_ratio=aspect_ratio,
                    **kwargs,
                )

            start = time.time()
            try:
                result_msg = breaker.call(_do_generate)
            except CircuitOpenError as e:
                if not fallback:
                    return {
                        "engine": engine_name,
                        "success": False,
                        "output_path": None,
                        "error": str(e),
                    }
                continue

            elapsed = time.time() - start
            success = os.path.exists(output_file)
            tracker.record_api_call(engine_name, success, elapsed)
            if success:
                return {
                    "engine": engine_name,
                    "success": True,
                    "output_path": output_file,
                    "elapsed": round(elapsed, 1),
                    "message": result_msg,
                }
            if not fallback:
                return {
                    "engine": engine_name,
                    "success": False,
                    "output_path": None,
                    "error": result_msg or "Generation failed",
                }

        except Exception as e:
            tracker = get_tracker()
            tracker.record_api_call(
                engine_name, False, 0,
                error_type=type(e).__name__,
            )
            if not fallback:
                return {
                    "engine": engine_name,
                    "success": False,
                    "output_path": None,
                    "error": str(e),
                }
            continue

    return {
        "engine": "none",
        "success": False,
        "output_path": None,
        "error": "No engine available",
    }


# ============================================================
# CLItext
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="🎨 english_textimagegenerationtext — automaticenglish_textgenerationenglish_text",
    )
    parser.add_argument("--prompt", required=True, help="image prompt text")
    parser.add_argument("--reference-images", nargs="*", default=[], help="english_text")
    parser.add_argument("--output", "-o", required=True, help="outputimagetext")
    parser.add_argument("--aspect-ratio", default="1:1", help="english_text")
    parser.add_argument("--scene", default="scene_01_white_bg", help="scene ID")
    parser.add_argument("--category", default="general", help="textcategory")
    parser.add_argument("--engine", default=None, help="english_text（english_textautomatictext）")
    parser.add_argument("--quality", default="standard", choices=["premium", "standard", "draft"],
                        help="english_text")
    parser.add_argument("--no-fallback", action="store_true", help="english_text")

    args = parser.parse_args()

    result = generate_with_best_engine(
        prompt=args.prompt,
        ref_images=args.reference_images,
        output_file=args.output,
        scene_id=args.scene,
        category=args.category,
        quality=args.quality,
        preferred_engine=args.engine,
        fallback=not args.no_fallback,
        aspect_ratio=args.aspect_ratio,
    )

    if result["success"]:
        print(f"✅ [{result['engine']}] {result['message']} ({result['elapsed']}s)")
    else:
        print(f"❌ {result.get('error', 'Unknown error')}")
        sys.exit(1)


if __name__ == "__main__":
    main()
