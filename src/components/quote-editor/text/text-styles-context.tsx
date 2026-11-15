"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { defaultTextStyles, type TextStyle, type TextStyleKey, type TextStyles } from "@/domain/text-styles";
import { saveTextStylesAction } from "@/server/actions/settings";

type Value = { styles: TextStyles; canEdit: boolean; save: (key: TextStyleKey, style: TextStyle) => void; reset: () => void };

const Ctx = createContext<Value>({ styles: defaultTextStyles, canEdit: false, save: () => {}, reset: () => {} });

/** The workspace text styles inside the editor: read by the toolbar and the inspector, saved on change. */
export function TextStylesProvider({ initial, canEdit, children }: { initial: TextStyles; canEdit: boolean; children: ReactNode }) {
  const [styles, setStyles] = useState(initial);
  const persist = (next: TextStyles, message: string) => {
    const before = styles;
    setStyles(next);
    void saveTextStylesAction(next).then((result) => {
      if (result.ok) toast.success(message);
      else {
        setStyles(before);
        toast.error(result.message);
      }
    });
  };
  return (
    <Ctx.Provider
      value={{
        styles,
        canEdit,
        save: (key, style) => persist({ ...styles, [key]: style }, "Stile salvato per tutto il workspace."),
        reset: () => persist(defaultTextStyles, "Stili di testo riportati ai predefiniti."),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useTextStyles = () => useContext(Ctx);
