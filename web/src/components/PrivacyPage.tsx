/** Privacy page (FR-A13, PR-5/6): what happens to your data, in plain language. */
import { useReveal } from "../lib/useReveal";

const ROWS: [string, string, string][] = [
  ["Where the AI runs", "Inside your browser (WebGPU / WASM)", "Our free server, in memory"],
  ["Does the scan leave your device?", "No, never. Works with Wi-Fi off.", "Yes, over HTTPS, for the analysis only"],
  ["Stored?", "No", "No disk writes; results expire ≤ 10 min; delete-now button"],
  ["DICOM identifiers", "Converted locally; every header field dropped", "All 18 HIPAA Safe-Harbor categories removed first"],
  ["Logs", "None", "Events only: no file names, patient fields or IPs"],
  ["Tracking & analytics", "None", "None"],
];

export default function PrivacyPage() {
  useReveal();
  return (
    <article className="mx-auto max-w-[1100px] px-[5vw] pb-24 pt-10 text-[16px] leading-relaxed text-ink-2">
      <p className="eyebrow animate-fade-in">Privacy &amp; data handling</p>
      <h1 className="display mt-4 animate-fade-in max-w-[18ch] text-[clamp(40px,6vw,76px)]">Your scan, your device, <em className="italic">your choice</em>.</h1>
      <p className="mt-6 max-w-[62ch] text-[17px] font-light text-ink-3">
        We designed around the <b className="font-medium text-ink-2">HIPAA Privacy and Security Rule principles</b> and India’s <b className="font-medium text-ink-2">DPDP Act 2023</b>. As a student research project we call it <b className="font-medium text-ink-2">HIPAA-aligned</b>: we apply the safeguards, but it is not a certified HIPAA-compliant service.
      </p>

      <div className="card reveal mt-14 overflow-hidden p-0">
        <table className="w-full text-left text-[15px]">
          <caption className="sr-only">Private mode compared with server mode</caption>
          <thead className="bg-paper-2">
            <tr>
              <th scope="col" className="eyebrow p-5"><span className="sr-only">Question</span></th>
              <th scope="col" className="p-5 font-serif text-lg font-normal text-emerald-800">Private mode</th>
              <th scope="col" className="p-5 font-serif text-lg font-normal text-terra-ink">Server mode</th>
            </tr>
          </thead>
          <tbody>{ROWS.map(([k, a, b]) => (
            <tr key={k} className="border-t border-ink/8">
              <th scope="row" className="p-5 font-normal text-ink-3">{k}</th><td className="p-5 text-ink">{a}</td><td className="p-5 text-ink">{b}</td>
            </tr>))}
          </tbody>
        </table>
      </div>

      <div className="mt-20 grid gap-x-16 gap-y-12 md:grid-cols-2">
        <section className="reveal">
          <h2 className="font-serif text-2xl text-ink">Why “demo data only” on the server</h2>
          <p className="mt-4">Under HIPAA, any vendor that handles patient data must sign a <b className="text-ink">Business Associate Agreement</b>. Free hosting platforms don’t, so the server must only see de-identified research data or the bundled samples. <b className="text-ink">Private mode</b> removes the question entirely: nothing is transmitted.</p>
        </section>
        <section className="reveal">
          <h2 className="font-serif text-2xl text-ink">Images can identify people too</h2>
          <p className="mt-4">A 3D head MRI that isn’t skull-stripped can be rendered into a recognisable face, so we warn when a scan looks un-stripped. DICOM files flagged with burned-in text are highlighted as well.</p>
        </section>
      </div>
    </article>
  );
}
