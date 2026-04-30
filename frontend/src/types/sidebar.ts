import type { ReactNode } from "react";

export type SidebarDropdownItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  isActive?: boolean;
  onClick: () => void;
  iconColor?: string;
  iconBackground?: string;
};

export type SidebarItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  isActive?: boolean;
  onClick: () => void;
  dropdownItems?: SidebarDropdownItem[];
  iconColor?: string;
  iconBackground?: string;
};

export type SidebarSection = {
  id: string;
  title: string;
  items: SidebarItem[];
};
