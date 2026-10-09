/** Model card page (FR-A13, UX-2): editorial layout, honest metrics, limitations. */
import { useEffect, useState } from "react";
import { api, type ModelCard } from "../lib/api";
import { useReveal } from "../lib/useReveal";

export default function AboutModel() {
  const [card, setCard] = useState<ModelCard | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { api.model().then(setCard).catch(() => setErr(true)); }, []);
  useReveal([card]);
  const tm = card?.test_metrics;
  return (
    <article className="mx-auto max-w-[1100px] px-[5vw] pb-24 pt-10 text-[16px] leading-relaxed text-ink-2">
      <p className="eyebrow animate-fade-in">The model · model card</p>
      <h1 className="display mt-4 animate-fade-in max-w-[18ch] text-[clamp(40px,6vw,76px)]">What it is, and what it <em className="italic">isn’t</em>.</h1>
      {err && <p className="mt-6 text-ink-3">Model details come from the analysis server, which is offline or waking up.</p>}
      {card?.synthetic && (
        <p className="mt-8 max-w-[70ch] rounded-2xl bg-amber-50 p-4 text-[15px] text-amber-950">
          Current weights are <b>demo weights trained on synthetic phantoms</b>. They prove the pipeline end to end; the BraTS-trained model replaces them after Phase 4.
        </p>
      )}

      <div className="mt-14 grid gap-5 sm:grid-cols-3">
        {[
          ["Version", card?.version ?? "—", ""],
          [card?.synthetic ? "Test Dice · synthetic phantoms" : "Test Dice · whole tumor", tm ? `${tm.dice.mean.toFixed(3)}` : "Pending", tm ? (card?.synthetic ? `n = ${tm.n_patients} phantoms · pipeline check, not a clinical result` : `± ${tm.dice.std.toFixed(3)} · n = ${tm.n_patients} held-out patients`) : "Measured once on held-out patients"],
          ["ONNX ⇄ PyTorch", card?.onnx ? card.onnx.parity_min_dice.toFixed(4) : "—", "Mask agreement (Dice)"],
        ].map(([k, v, s]) => (
          <div key={k} className="card reveal p-7">
            <p className="eyebrow">{k}</p>
            <p className="mt-4 font-serif text-4xl text-ink">{v}</p>
            <p className="mt-2 text-sm text-ink-3">{s}</p>
          </div>
        ))}
      </div>

      <div className="mt-20 grid gap-x-16 gap-y-14 md:grid-cols-2">
        <section className="reveal">
          <h2 className="font-serif text-2xl text-ink">Architecture</h2>
          <p className="mt-4">A 2D <b className="text-ink">MONAI FlexibleUNet</b> with an ImageNet-pretrained EfficientNet-B0 encoder, adapted to two MRI channels (T1ce + FLAIR) and fine-tuned for <b className="text-ink">binary whole-tumor segmentation</b>. Slices are segmented and stacked back into 3D. Exported to <b className="text-ink">ONNX</b>, so the identical model runs on the server or inside your browser. Uncertainty comes from flip test-time augmentation.</p>
        </section>
        <section className="reveal">
          <h2 className="font-serif text-2xl text-ink">How we measure, honestly</h2>
          <ul className="mt-4 space-y-3">
            <li>— Train, validation and test splits are made <b className="text-ink">by patient</b>, so no test-patient slice is ever seen in training.</li>
            <li>— Dice and HD95 are computed <b className="text-ink">per patient in 3D</b>. Per-slice averages would flatter the score.</li>
            <li>— The test set is evaluated <b className="text-ink">once</b>. For context, human experts agree with each other at roughly Dice 0.85–0.90.</li>
          </ul>
        </section>
        <section className="reveal">
          <h2 className="font-serif text-2xl text-ink">Intended use</h2>
          <p className="mt-4">Research, education and demonstrations of AI-assisted segmentation. <b className="text-ink">Not</b> for diagnosis, treatment planning or any clinical decision. Not a medical device.</p>
        </section>
        <section className="reveal">
          <h2 className="font-serif text-2xl text-ink">Known limitations</h2>
          <ul className="mt-4 space-y-3">
            <li>— Trained on BraTS gliomas, mostly from North American and European centres; other tumors, children, scanners and populations are untested.</li>
            <li>— Expects skull-stripped, co-registered, ~1 mm scans.</li>
            <li>— 2D slices give less 3D context. Binary output only: no split into enhancing tumor, necrosis and edema yet.</li>
            <li>— Small tumors and boundaries are the most error-prone. Use the uncertainty map.</li>
          </ul>
        </section>
      </div>
    </article>
  );
}
