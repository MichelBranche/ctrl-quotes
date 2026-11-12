"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlays";
import { FormError, text } from "@/components/data/fields";
import { useAction } from "@/components/data/use-action";
import { useHref } from "@/components/data/controls";
import { createClientAction, updateClientAction } from "@/server/actions/clients";
import type { ClientRow } from "@/server/clients";

export function ClientFormDialog({ open, onClose, client }: { open: boolean; onClose: () => void; client: ClientRow | null }) {
  const { pending, error, setError, run } = useAction();
  const router = useRouter();
  const href = useHref();

  return (
    <Dialog
      open={open}
      title={client ? "Modifica cliente" : "Nuovo cliente"}
      onClose={() => {
        setError(null);
        onClose();
      }}
    >
      {open ? (
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const input = {
              kind: text(form, "kind"),
              name: text(form, "name"),
              status: text(form, "status") || "active",
              sector: text(form, "sector"),
              email: text(form, "email"),
              phone: text(form, "phone"),
              website: text(form, "website"),
              address: text(form, "address"),
              vatNumber: text(form, "vatNumber"),
              taxCode: text(form, "taxCode"),
            };
            run(
              () => (client ? updateClientAction(client.id, input) : createClientAction(input)),
              (value) => {
                onClose();
                if (!client) router.push(href({ id: value.id }), { scroll: false });
              },
            );
          }}
        >
          <FormError message={error} />
          <div className="grid-2">
            <SelectField
              label="Tipo"
              name="kind"
              defaultValue={client?.kind ?? "azienda"}
              options={[
                { value: "azienda", label: "Azienda" },
                { value: "privato", label: "Privato" },
              ]}
            />
            {client?.status === "archived" ? (
              <p className="field-hint">Il cliente è archiviato. Ripristinalo dal menu per cambiarne lo stato.</p>
            ) : (
              <SelectField
                label="Stato"
                name="status"
                defaultValue={client?.status ?? "active"}
                options={[
                  { value: "active", label: "Cliente attivo" },
                  { value: "prospect", label: "Prospect" },
                ]}
              />
            )}
          </div>
          <TextField label="Nome o ragione sociale" name="name" required minLength={2} maxLength={120} defaultValue={client?.name ?? ""} autoFocus />
          <TextField label="Settore" name="sector" maxLength={80} defaultValue={client?.sector ?? ""} placeholder="Per esempio: agenzia creativa" />
          <div className="grid-2">
            <TextField label="Email" name="email" type="email" defaultValue={client?.email ?? ""} />
            <TextField label="Telefono" name="phone" type="tel" defaultValue={client?.phone ?? ""} />
          </div>
          <TextField label="Sito web" name="website" defaultValue={client?.website ?? ""} placeholder="www.esempio.it" />
          <TextField label="Indirizzo" name="address" maxLength={200} defaultValue={client?.address ?? ""} />
          <div className="grid-2">
            <TextField label="Partita IVA" name="vatNumber" maxLength={20} defaultValue={client?.vatNumber ?? ""} />
            <TextField label="Codice fiscale" name="taxCode" maxLength={20} defaultValue={client?.taxCode ?? ""} />
          </div>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={pending}>
              {client ? "Salva modifiche" : "Crea cliente"}
            </Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}
