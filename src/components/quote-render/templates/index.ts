import type { ReactElement } from "react";
import type { TemplateKey } from "@/domain/templates";
import type { Kit } from "../kit";
import type { DocModel, NumberingScheme } from "../model";
import { renderAtelier } from "./atelier";
import { renderBold } from "./bold";
import { renderCorporate } from "./corporate";
import { renderStudio } from "./studio";
import { renderSwiss } from "./swiss";

/** `edges`: the template draws on the page edges a break cuts (see PrintPlan.edges), at the cost of one more PDF render. */
export type TemplateRenderer = { numbering: NumberingScheme; render: (k: Kit, m: DocModel) => ReactElement[]; edges?: boolean };

export const renderers: Record<TemplateKey, TemplateRenderer> = {
  minimal: { numbering: "fromCover", render: renderSwiss },
  studio: { numbering: "none", render: renderStudio },
  editorial: { numbering: "fromIntro", render: renderAtelier },
  corporate: { numbering: "fromIntro", render: renderCorporate },
  bold: { numbering: "fromIntro", render: renderBold, edges: true },
};
