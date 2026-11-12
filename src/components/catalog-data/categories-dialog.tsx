"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { FormError } from "@/components/data/fields";
import { useAction } from "@/components/data/use-action";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlays";
import { createCategoryAction, deleteCategoryAction, renameCategoryAction } from "@/server/actions/catalog";
import type { Category } from "@/server/catalog";

export function CategoriesDialog({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: Category[] }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const { pending, error, run } = useAction();

  return (
    <Dialog open={open} title="Categorie del catalogo" onClose={onClose}>
      <div className="form-grid">
        <FormError message={error} />
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => createCategoryAction(name), () => setName(""));
          }}
        >
          <TextField label="Nuova categoria" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          <Button type="submit" loading={pending} disabled={name.trim().length < 2}>
            Aggiungi
          </Button>
        </form>
        {categories.length === 0 ? (
          <p className="muted small">Nessuna categoria. Le categorie aiutano a filtrare il catalogo.</p>
        ) : (
          <ul className="category-list">
            {categories.map((category) => (
              <li key={category.id}>
                {editing?.id === category.id ? (
                  <form
                    className="inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(() => renameCategoryAction(category.id, editing.name), () => setEditing(null));
                    }}
                  >
                    <label className="visually-hidden" htmlFor={`rename-${category.id}`}>
                      Nuovo nome per {category.name}
                    </label>
                    <input
                      id={`rename-${category.id}`}
                      className="qty-input wide"
                      value={editing.name}
                      maxLength={40}
                      onChange={(event) => setEditing({ id: category.id, name: event.target.value })}
                      autoFocus
                    />
                    <Button type="submit" variant="ghost" aria-label="Salva nome" disabled={pending}>
                      <Check size={16} aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" aria-label="Annulla" onClick={() => setEditing(null)}>
                      <X size={16} aria-hidden="true" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <span>
                      {category.name} <span className="muted small">({category.itemCount})</span>
                    </span>
                    <span className="row-actions">
                      <Button variant="ghost" aria-label={`Rinomina ${category.name}`} onClick={() => setEditing({ id: category.id, name: category.name })}>
                        <Pencil size={16} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Elimina ${category.name}`}
                        disabled={pending}
                        onClick={() => run(() => deleteCategoryAction(category.id))}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </Button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="field-hint">Eliminando una categoria le voci restano nel catalogo, senza categoria.</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onClose}>
            Chiudi
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
