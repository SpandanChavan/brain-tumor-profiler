// Copies the ONNX model + model card into /public for Private mode. ONNX Runtime's WASM is
// emitted by Vite itself (one hashed same-origin asset), so it is NOT copied here.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const repo = join(web, "..");

rmSync(join(web, "public", "ort"), { recursive: true, force: true }); // legacy copies (83 MB)
const model = join(repo, "models", "btp_model.onnx");
const modelOut = join(web, "public", "models");
mkdirSync(modelOut, { recursive: true });
if (existsSync(model)) {
  cpSync(model, join(modelOut, "btp_model.onnx"));
  const card = join(repo, "models", "model_card.json");
  if (existsSync(card)) cpSync(card, join(modelOut, "model_card.json"));
  console.log("prepare-assets: model copied");
} else {
  console.warn("prepare-assets: models/btp_model.onnx not found; Private mode needs VITE_MODEL_URL");
}
