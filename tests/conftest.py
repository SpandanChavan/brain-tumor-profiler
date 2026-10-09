import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from btp.synthetic import make_phantom, save_phantom_nifti  # noqa: E402


@pytest.fixture(scope="session")
def phantom():
    return make_phantom(seed=7)


@pytest.fixture()
def phantom_files(tmp_path, phantom):
    return save_phantom_nifti(phantom, tmp_path, "SYNTH_TEST")
