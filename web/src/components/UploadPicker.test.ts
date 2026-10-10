import { describe, expect, it } from "vitest";
import { assign, guessSlot } from "./UploadPicker";

const f = (name: string) => new File(["x"], name);

describe("upload auto-assignment", () => {
  it("recognises BraTS 2021 and 2023 naming", () => {
    expect(guessSlot("BraTS2021_00001_t1ce.nii.gz")).toBe("t1ce");
    expect(guessSlot("BraTS2021_00001_flair.nii.gz")).toBe("flair");
    expect(guessSlot("BraTS-GLI-00002-000-t1c.nii.gz")).toBe("t1ce");
    expect(guessSlot("BraTS-GLI-00002-000-t2f.nii.gz")).toBe("flair");
    expect(guessSlot("patient_T1.nii.gz")).toBeNull(); // plain T1 is not T1ce
    expect(guessSlot("scan.nii")).toBeNull();
  });

  it("assigns by name regardless of drop order and rejects unsupported files", () => {
    const { next, rejected } = assign([f("x_flair.nii.gz"), f("notes.pdf"), f("x_t1ce.nii.gz")], { t1ce: null, flair: null });
    expect(next.t1ce?.name).toBe("x_t1ce.nii.gz");
    expect(next.flair?.name).toBe("x_flair.nii.gz");
    expect(rejected).toEqual(["notes.pdf"]);
  });

  it("fills empty slots with unrecognised names", () => {
    const { next } = assign([f("a.nii.gz"), f("b.nii.gz")], { t1ce: null, flair: null });
    expect([next.t1ce?.name, next.flair?.name]).toEqual(["a.nii.gz", "b.nii.gz"]);
  });
});
