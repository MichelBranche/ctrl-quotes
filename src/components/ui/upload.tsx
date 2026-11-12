"use client";

import { useState } from "react";
import { HexColorPicker } from "react-colorful";

const allowed = new Set(["image/png", "image/jpeg", "image/svg+xml"]);
const maxBytes = 5 * 1024 * 1024;

export function FileUploader() {
  const [message, setMessage] = useState("PNG, SVG o JPG. Massimo 5 MB. Il file non viene caricato sul cloud.");
  const [error, setError] = useState(false);

  function take(file: File | undefined) {
    if (!file) return;
    if (!allowed.has(file.type) || file.size > maxBytes) {
      setError(true);
      setMessage("Formato o dimensione non validi. Usa PNG, JPG o SVG entro 5 MB.");
      return;
    }
    setError(false);
    setMessage(`File accettato in questa sessione: ${file.name}. Non è stato salvato.`);
  }

  return (
    <div
      className={error ? "dropzone is-error" : "dropzone"}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        take(event.dataTransfer.files[0]);
      }}
    >
      <p>{message}</p>
      <label className="btn btn-secondary">
        Scegli file
        <input
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={(event) => take(event.target.files?.[0])}
        />
      </label>
    </div>
  );
}

export function ColorPicker({ value = "#7C3AED" }: { value?: string }) {
  const [color, setColor] = useState(value);
  return (
    <div>
      <HexColorPicker color={color} onChange={setColor} />
      <p className="field-hint">Colore scelto: {color}. Il contrasto va verificato sul testo reale.</p>
    </div>
  );
}
