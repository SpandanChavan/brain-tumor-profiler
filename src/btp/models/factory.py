"""Model factory (FR-M1) — see docs/adr/001-model-choice.md.

Core model: MONAI ``FlexibleUNet`` with an ImageNet-pretrained EfficientNet encoder,
adapted from 3 RGB input channels to our 2 MRI channels (T1ce, FLAIR).

Why adapt manually: MONAI's pretrained EfficientNet loader skips weights whose shapes
don't match, so building with ``in_channels=2`` would leave the stem randomly
initialised. Instead we build with 3 channels, load ImageNet weights, then replace the
stem conv with a 2-channel conv initialised from the mean RGB filter (rescaled 3/2 so
activation magnitudes are preserved).
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import torch
from monai.networks.nets import FlexibleUNet
from torch import nn


def _adapt_first_conv(model: nn.Module, in_channels: int) -> nn.Module:
    for name, module in model.named_modules():
        if isinstance(module, nn.Conv2d) and module.in_channels == 3:
            w = module.weight.data
            new = nn.Conv2d(in_channels, module.out_channels, module.kernel_size, module.stride,
                            module.padding, module.dilation, module.groups,
                            bias=module.bias is not None, padding_mode=module.padding_mode)
            new.weight.data = w.mean(dim=1, keepdim=True).repeat(1, in_channels, 1, 1) * (3.0 / in_channels)
            if module.bias is not None:
                new.bias.data = module.bias.data.clone()
            # keep MONAI's "same" padding wrapper behaviour if present
            for attr in ("static_padding",):
                if hasattr(module, attr):
                    setattr(new, attr, getattr(module, attr))
            parent_name, _, child = name.rpartition(".")
            parent = model.get_submodule(parent_name) if parent_name else model
            setattr(parent, child, new)
            return model
    raise RuntimeError("Could not find a 3-channel first convolution to adapt.")


def build_model(cfg: dict[str, Any] | None = None) -> nn.Module:
    cfg = cfg or {}
    name = cfg.get("name", "flexible_unet")
    in_ch = int(cfg.get("in_channels", 2))
    out_ch = int(cfg.get("out_channels", 1))
    if name == "flexible_unet":
        backbone = cfg.get("backbone", "efficientnet-b0")
        pretrained = bool(cfg.get("pretrained", False))
        if pretrained and in_ch != 3:
            model = FlexibleUNet(in_channels=3, out_channels=out_ch, backbone=backbone,
                                 pretrained=True, spatial_dims=2)
            model = _adapt_first_conv(model, in_ch)
        else:
            model = FlexibleUNet(in_channels=in_ch, out_channels=out_ch, backbone=backbone,
                                 pretrained=pretrained, spatial_dims=2)
        return model
    if name == "unet":  # light fallback / ablation: no pretraining
        from monai.networks.nets import UNet
        return UNet(spatial_dims=2, in_channels=in_ch, out_channels=out_ch,
                    channels=(16, 32, 64, 128, 256), strides=(2, 2, 2, 2), num_res_units=2)
    raise ValueError(f"Unknown model name {name!r}")


def save_checkpoint(model: nn.Module, path: str | Path, *, model_cfg: dict, meta: dict | None = None) -> str:
    """Save weights + the config needed to rebuild them. Returns SHA-256 (SR-7)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": model.state_dict(),
                "model_cfg": {**model_cfg, "pretrained": False},
                "meta": meta or {}}, path)
    return sha256_file(path)


def load_checkpoint(path: str | Path, map_location: str = "cpu",
                    expected_sha256: str | None = None) -> tuple[nn.Module, dict]:
    path = Path(path)
    if expected_sha256 and sha256_file(path) != expected_sha256:
        raise RuntimeError(f"Weights integrity check failed for {path.name} (SR-7).")
    ckpt = torch.load(path, map_location=map_location, weights_only=False)
    model = build_model(ckpt["model_cfg"])
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, ckpt.get("meta", {})


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
