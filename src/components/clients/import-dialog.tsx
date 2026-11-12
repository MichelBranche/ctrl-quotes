"use client";

import { useState } from "react";
import { CheckCircle2, FileUp } from "lucide-react";
import { useAction } from "@/components/data/use-action";
import { FormError } from "@/components/data/fields";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlays";
import { clientImportFields, csvLimits, type ColumnMapping } from "@/domain/csv";
import { commitImportAction, previewImportAction } from "@/server/actions/clients";
import type { ImportPreviewResult } from "@/server/client-import";
import { cn } from "@/lib/cn";

type Step = "file" | "map" | "done";

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>("file");
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [report, setReport] = useState<{ imported: number; duplicates: number; errors: number } | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const { pending, error, setError, run } = useAction();

  function reset() {
    setStep("file");
    setFileName("");
    setCsvText("");
    setPreview(null);
    setReport(null);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function take(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > csvLimits.maxBytes) {
      setError("Il file supera 1 MB. Dividilo in più file.");
      return;
    }
    if (!/\.(csv|txt)$/i.test(file.name) && !file.type.includes("csv") && !file.type.startsWith("text/")) {
      setError("Scegli un file CSV, esportato da Excel, Numbers o Google Fogli.");
      return;
    }
    const content = await file.text();
    setFileName(file.name);
    setCsvText(content);
    run(
      () => previewImportAction(content, null),
      (value) => {
        setPreview(value);
        setStep("map");
      },
    );
  }

  function remap(field: keyof ColumnMapping, column: number) {
    if (!preview) return;
    const mapping = { ...preview.mapping };
    for (const key of Object.keys(mapping) as Array<keyof ColumnMapping>) {
      if (column >= 0 && mapping[key] === column) mapping[key] = -1;
    }
    mapping[field] = column;
    run(() => previewImportAction(csvText, mapping), setPreview);
  }

  const rows = preview ? (problemsOnly ? preview.rows.filter((row) => row.status !== "valid") : preview.rows) : [];

  return (
    <Dialog open={open} title="Importa clienti da CSV" onClose={close}>
      {open ? (
        <div className="import-flow">
          <ol className="steps" aria-label="Passaggi">
            {(["file", "map", "done"] as const).map((item, index) => (
              <li key={item} className={cn(step === item && "is-current")} aria-current={step === item ? "step" : undefined}>
                <span>{index + 1}</span>
                {item === "file" ? "File" : item === "map" ? "Colonne e anteprima" : "Risultato"}
              </li>
            ))}
          </ol>
          <FormError message={error} />

          {step === "file" ? (
            <div
              className="dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void take(event.dataTransfer.files[0]);
              }}
            >
              <FileUp size={22} aria-hidden="true" />
              <p>
                Trascina qui un file CSV oppure sceglilo dal computer. La prima riga deve contenere i nomi delle colonne.
                <br />
                <span className="muted small">
                  Separatore virgola o punto e virgola, massimo {csvLimits.maxRows} righe e 1 MB. Niente viene salvato prima della conferma.
                </span>
              </p>
              <label className={cn("btn btn-secondary", pending && "is-disabled")}>
                {pending ? "Lettura in corso…" : "Scegli file CSV"}
                <input
                  className="visually-hidden"
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  disabled={pending}
                  onChange={(event) => void take(event.target.files?.[0])}
                />
              </label>
            </div>
          ) : null}

          {step === "map" && preview ? (
            <>
              <p className="muted small">
                {fileName}: {preview.totalRows} righe. Associa ogni campo alla colonna del file. Il nome è obbligatorio.
              </p>
              <div className="mapping-grid">
                {clientImportFields.map((field) => (
                  <div className="field" key={field.key}>
                    <label htmlFor={`map-${field.key}`}>
                      {field.label}
                      {field.required ? " *" : ""}
                    </label>
                    <select
                      id={`map-${field.key}`}
                      value={preview.mapping[field.key]}
                      disabled={pending}
                      onChange={(event) => remap(field.key, Number(event.target.value))}
                    >
                      <option value={-1}>Non importare</option>
                      {preview.headers.map((header, index) => (
                        <option key={`${header}-${index}`} value={index}>
                          {header || `Colonna ${index + 1}`}
                          {preview.sample[0]?.[index] ? `: ${preview.sample[0][index]?.slice(0, 24)}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {preview.mapping.name < 0 ? (
                <p className="alert" role="alert">
                  Scegli la colonna con il nome del cliente per vedere l&apos;anteprima.
                </p>
              ) : (
                <>
                  <div className="import-summary" aria-live="polite">
                    <span className="badge badge-success">{preview.valid} da importare</span>
                    <span className="badge badge-warning">{preview.duplicates} doppioni saltati</span>
                    <span className="badge badge-danger">{preview.errors} con errori</span>
                    <label className="checkline small">
                      <input type="checkbox" checked={problemsOnly} onChange={(event) => setProblemsOnly(event.target.checked)} /> Solo righe da
                      controllare
                    </label>
                  </div>
                  <div className="table-wrap import-table">
                    <table className="data">
                      <caption className="visually-hidden">Anteprima delle righe</caption>
                      <thead>
                        <tr>
                          <th scope="col">Riga</th>
                          <th scope="col">Cliente</th>
                          <th scope="col">Esito</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 200).map((row) => (
                          <tr key={row.line}>
                            <td>{row.line}</td>
                            <td>{row.name || <span className="muted">Senza nome</span>}</td>
                            <td>
                              {row.status === "valid" ? (
                                <span className="badge badge-success">Valida</span>
                              ) : (
                                <span className={cn("badge", row.status === "duplicate" ? "badge-warning" : "badge-danger")}>{row.reason}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > 200 ? <p className="muted small">Mostrate 200 righe su {rows.length}.</p> : null}
                  </div>
                </>
              )}
              <div className="dialog-actions">
                <Button variant="secondary" onClick={reset} disabled={pending}>
                  Cambia file
                </Button>
                <Button
                  loading={pending}
                  disabled={preview.valid === 0 || preview.mapping.name < 0}
                  onClick={() =>
                    run(
                      () => commitImportAction(csvText, preview.mapping),
                      (value) => {
                        setReport(value);
                        setStep("done");
                      },
                    )
                  }
                >
                  Importa {preview.valid} {preview.valid === 1 ? "cliente" : "clienti"}
                </Button>
              </div>
            </>
          ) : null}

          {step === "done" && report ? (
            <div className="import-done" role="status">
              <CheckCircle2 size={28} aria-hidden="true" />
              <p>
                <strong>
                  {report.imported} {report.imported === 1 ? "cliente importato" : "clienti importati"}.
                </strong>
                <br />
                {report.duplicates} doppioni e {report.errors} righe con errori non sono stati importati.
              </p>
              <div className="dialog-actions">
                <Button variant="secondary" onClick={reset}>
                  Importa un altro file
                </Button>
                <Button onClick={close}>Chiudi</Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
