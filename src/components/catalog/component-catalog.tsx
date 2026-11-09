"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, FilterBar, MetricCard, QuotePreview, SectionBlock, TemplateCard, Timeline } from "@/components/ui/data-display";
import { ClientAvatar } from "@/components/ui/data-display";
import { CurrencyInput, DateField, SelectField, TextField } from "@/components/ui/fields";
import { SegmentedControl, Tabs } from "@/components/ui/navigation";
import { ConfirmationDialog, Dialog, Drawer } from "@/components/ui/overlays";
import { EmptyState, PageHeader, Skeleton, StatusBadge } from "@/components/ui/status";
import { ColorPicker, FileUploader } from "@/components/ui/upload";
import { messages } from "@/i18n/it";

export function ComponentCatalog() {
  const [cents, setCents] = useState(320000);
  const [segment, setSegment] = useState("valore");
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="stack">
      <PageHeader title={messages.catalogPage.title} subtitle={messages.catalogPage.subtitle} />
      <section className="card" style={{ padding: 16 }}>
        <h2>Pulsanti</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button>Normale</Button>
          <Button forceState="hover">Hover</Button>
          <Button forceState="active">Active</Button>
          <Button forceState="focus">Focus</Button>
          <Button forceState="disabled">Disabilitato</Button>
          <Button loading>Caricamento</Button>
          <Button variant="secondary">Secondario</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
      </section>
      <section className="card" style={{ padding: 16 }}>
        <h2>Campi</h2>
        <div className="grid-2">
          <TextField label="Normale" name="normal" placeholder="Testo" />
          <TextField label="Focus" name="focus" forceState="focus" defaultValue="Focus" />
          <TextField label="Errore" name="error" forceState="error" error="Controlla questo campo." defaultValue="errato" />
          <TextField label="Disabilitato" name="disabled" forceState="disabled" defaultValue="Non modificabile" />
          <SelectField label="Selezione" name="select" options={[{ value: "a", label: "Ordinario" }, { value: "b", label: "Forfettario" }]} />
          <CurrencyInput label="Importo" cents={cents} onCents={setCents} />
          <DateField label="Data" name="date" />
        </div>
      </section>
      <section className="card" style={{ padding: 16 }}>
        <h2>Stati e feedback</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <StatusBadge tone="success">Accettato</StatusBadge>
          <StatusBadge tone="warning">In attesa</StatusBadge>
          <StatusBadge tone="danger">Rifiutato</StatusBadge>
          <StatusBadge tone="draft">Bozza</StatusBadge>
          <StatusBadge tone="info">Inviato</StatusBadge>
        </div>
        <div style={{ marginTop: 12 }}><Skeleton width="40%" /></div>
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => toast.success("Operazione completata")}>Mostra toast</Button>
        </div>
      </section>
      <section className="card" style={{ padding: 16 }}>
        <h2>Navigazione</h2>
        <Tabs tabs={[{ id: "uno", label: "Editor", panel: "Pannello editor" }, { id: "due", label: "Dettagli", panel: "Pannello dettagli" }]} />
        <div style={{ marginTop: 12 }}>
          <SegmentedControl
            value={segment}
            onChange={setSegment}
            options={[{ value: "valore", label: "Valore" }, { value: "numero", label: "Numero" }]}
          />
        </div>
        <div style={{ marginTop: 12 }}><FilterBar /></div>
      </section>
      <section className="card" style={{ padding: 16 }}>
        <h2>Overlay</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => setDialog(true)}>Apri dialog</Button>
          <Button variant="secondary" onClick={() => setDrawer(true)}>Apri drawer</Button>
          <Button variant="secondary" onClick={() => setConfirm(true)}>Conferma</Button>
        </div>
        <Dialog open={dialog} title="Dialog di esempio" onClose={() => setDialog(false)}>
          <p>Il focus resta nel dialog. Esc lo chiude.</p>
          <Button onClick={() => setDialog(false)}>Chiudi</Button>
        </Dialog>
        <Drawer open={drawer} title="Drawer" onClose={() => setDrawer(false)}>
          <p>Pannello laterale.</p>
        </Drawer>
        <ConfirmationDialog open={confirm} title="Confermi?" body="Azione di esempio, senza effetti." onClose={() => setConfirm(false)} onConfirm={() => toast.success("Confermato")} />
      </section>
      <section className="grid-2">
        <MetricCard label="Esempio" cents={825000} />
        <div className="card" style={{ padding: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <ClientAvatar name="Studio Esempio" />
          <span>Studio Esempio</span>
        </div>
      </section>
      <DataTable caption="Esempio tabella" columns={["Preventivo", "Importo"]} rows={[["Proposta esempio", "€ 1.200,00"]]} />
      <Timeline items={[{ id: "1", title: "Preventivo creato", meta: "Esempio" }]} />
      <div className="grid-2">
        <TemplateCard name="Editorial" active />
        <QuotePreview title="Proposta di esempio" client="Studio Esempio" />
      </div>
      <SectionBlock title="Il progetto">Testo di esempio del blocco.</SectionBlock>
      <EmptyState title="Stato vuoto" body="Nessun dato finto persistente." />
      <FileUploader />
      <ColorPicker />
    </div>
  );
}
