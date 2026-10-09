// Minimal types for @niivue/dcm2niix (the package ships JS only).
declare module "@niivue/dcm2niix" {
  interface Processor {
    b(value: "y" | "n" | "o"): Processor;
    z(value: "y" | "o" | "i" | "n" | "3"): Processor;
    run(): Promise<File[]>;
  }
  export class Dcm2niix {
    worker: Worker | null;
    init(): Promise<boolean>;
    input(files: File[] | FileList): Processor;
  }
}
