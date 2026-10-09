# Evaluation protocol (frozen before training, FR-E1/E2, risk R3)

1. **Split:** patient-level, size-stratified 70/15/15, seed 42 → `splits.json`. An automated test (`assert_no_leakage`) runs on every load.
2. **Model selection:** use only the **validation** patients (mean per-patient 3D Dice, no TTA). Early stopping patience is 8.
3. **Test set:** evaluated **once**, with the final frozen model, using `scripts/evaluate.py --split test`. If we evaluate it again for any reason, the report must say so.
4. **Unit of analysis:** the patient. Slice predictions are stacked back into the original 240×240×155 grid before computing metrics.
5. **Metrics (whole tumor = BraTS labels 1+2+4):** Dice, IoU, HD95 (mm, 1 mm³ spacing), sensitivity, precision, relative volume error. We also report patient-level detection sensitivity and false-positive rate.
6. **Reporting:** mean ± SD, median, min–max, n. Box plots. A table of all per-patient results. A gallery of the worst 5 cases with failure categories.
7. **Empty-mask conventions:** documented in `src/btp/evaluation/metrics.py`. NaN HD95 values are counted and reported, never silently dropped.
8. **Post-processing and TTA:** settings are fixed from the validation set (threshold 0.5, minimum component 50 voxels, flip-TTA on). An ablation reports the score with and without them.
9. **Context benchmarks:** human inter-rater agreement on whole tumor is ~0.85–0.90 Dice (Menze 2015). We also report the MONAI bundle zero-shot score (4-modality 3D; reference only).
10. **Reproducibility:** each reported number links to its config, seed, git commit and weights SHA-256 (`summary.json`).
