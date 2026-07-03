import {
  BookOpen,
  FileCode,
  GitBranch,
  History,
  LibraryBig,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type SectionId =
  | "overview"
  | "definition"
  | "versions"
  | "instances"
  | "activity"
  | "settings";

export type MenuSection = {
  id: SectionId;
  labelKey: string;
  icon: LucideIcon;
  templateOnly?: boolean;
};

export const MENU_SECTIONS: MenuSection[] = [
  { id: "overview", labelKey: "sidebar.overview", icon: BookOpen },
  { id: "definition", labelKey: "sidebar.definition", icon: FileCode },
  { id: "versions", labelKey: "sidebar.versions", icon: GitBranch },
  {
    id: "instances",
    labelKey: "sidebar.instances",
    icon: LibraryBig,
    templateOnly: true,
  },
  { id: "activity", labelKey: "sidebar.activity", icon: History },
  { id: "settings", labelKey: "sidebar.settings", icon: Settings },
];
