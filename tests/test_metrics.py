import math

import numpy as np

from btp.evaluation.metrics import (
    case_metrics,
    dice,
    hd95,
    iou,
    precision,
    sensitivity,
    volume_error,
)


def cube(shape=(20, 20, 20), lo=5, hi=10):
    m = np.zeros(shape, bool)
    m[lo:hi, lo:hi, lo:hi] = True
    return m


def test_perfect_overlap():
    m = cube()
    assert dice(m, m) == 1.0 and iou(m, m) == 1.0 and hd95(m, m) == 0.0


def test_known_dice_value():
    a = np.zeros((10,), bool)
    a[:4] = True
    b = np.zeros((10,), bool)
    b[2:6] = True
    assert math.isclose(dice(a, b), 2 * 2 / 8)
    assert math.isclose(iou(a, b), 2 / 6)
    assert math.isclose(sensitivity(a, b), 0.5) and math.isclose(precision(a, b), 0.5)


def test_iou_dice_relation():
    a, b = cube(lo=4, hi=12), cube(lo=6, hi=14)
    d, j = dice(a, b), iou(a, b)
    assert math.isclose(j, d / (2 - d), rel_tol=1e-9)


def test_empty_conventions():
    e = np.zeros((5, 5, 5), bool)
    assert dice(e, e) == 1.0 and hd95(e, e) == 0.0
    assert dice(cube((5, 5, 5), 1, 3), e) == 0.0
    assert math.isnan(hd95(cube((5, 5, 5), 1, 3), e))
    assert math.isnan(sensitivity(e, e)) and math.isnan(volume_error(e, e))


def test_hd95_shift_respects_spacing():
    a = cube(lo=5, hi=10)
    b = np.roll(a, 2, axis=0)
    assert math.isclose(hd95(a, b), 2.0, abs_tol=1e-6)
    assert math.isclose(hd95(a, b, spacing=(2.0, 1.0, 1.0)), 4.0, abs_tol=1e-6)


def test_case_metrics_volume_in_ml():
    m = cube(lo=0, hi=10)  # 1000 voxels at 1 mm^3 = 1 mL
    r = case_metrics(m, m)
    assert math.isclose(r["vol_gt_ml"], 1.0) and r["detected"] and r["has_tumor"]
