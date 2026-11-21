import { FileText, Layers, LayoutGrid, Rocket, Settings, Users, type LucideIcon } from "lucide-react";
import type { HelpTopicId } from "@/domain/help";

export const topicIcons: Record<HelpTopicId, LucideIcon> = {
  "primi-passi": Rocket,
  preventivi: FileText,
  clienti: Users,
  catalogo: Layers,
  template: LayoutGrid,
  impostazioni: Settings,
};

