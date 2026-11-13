import { Cog, Database, Globe, Layers, Monitor, Server, type LucideIcon } from "lucide-react";
import type { SectionKind } from "./shapes";

// The icon for each kind of part in an AI diagram, on its boxes and in the
// diagram key.
export const KIND_ICONS: Record<SectionKind, LucideIcon> = {
  frontend: Monitor,
  backend: Server,
  db: Database,
  service: Cog,
  external: Globe,
  infra: Layers,
};
