# ADR-001: Model strategy

- **Status:** Proposed (needs faculty sign-off at Review #1)
- **Date:** 2026-10-09
- **Deciders:** Group BCAIAA20 · Guide: Prof. Jyoti Gavhane

## Context
The poster commits to *"fine-tuning an existing pretrained MONAI segmentation model on BraTS slices (T1ce + FLAIR)"* on free-tier GPUs, with binary output.

The obvious pretrained model is MONAI's `brats_mri_segmentation` bundle. It is:
- a **3D** SegResNet,
- with **4 input channels** (T1c, T1, T2, FLAIR),
- and **3 outputs** (TC, WT, ET).
- It was trained on BraTS 2018 and recommends ≥ 16 GB of GPU memory.

It cannot take 2D, 2-channel input as-is.

We also verified (MONAI 1.6.1) that building `FlexibleUNet(in_channels=2, pretrained=True)` **silently leaves the first convolution randomly initialised**: weights with mismatched shapes are skipped.

## Options
| | Option | Verdict |
|---|---|---|
| A | 2D MONAI `FlexibleUNet`, ImageNet-pretrained EfficientNet-B0 encoder. Stem adapted 3→2 channels by averaging the RGB filters × 3/2 | **Chosen (core)** |
| B | Adapt the 3D bundle: first conv 4→2 (keep the T1c and FLAIR filters), use the WT output, fine-tune on 3D patches with AMP | Stretch goal, time-boxed to 1 week |
| C | Run the bundle zero-shot on 4 modalities | Reference score only (`scripts/bundle_reference.py`) |

## Decision
**A** is the deliverable. **C** is run once for context. **B** is attempted only after milestone M3.

## Consequences
- ✅ Fits a free T4. Fast CPU inference for the app. Matches the poster's 2D / 2-channel / binary scope.
- ✅ Still honestly "fine-tuning a pretrained MONAI model".
- ⚠️ The encoder's pretraining is on natural images, not MRI. 2D means less 3D context. Both go on the limitations page.
- ✅ The A-vs-C comparison, plus the "pretrained vs scratch" ablation, gives the report a clear results story.
