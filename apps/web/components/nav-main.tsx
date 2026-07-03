"use client";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { CirclePlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { isNavActive } from "@/lib/nav-utils";

export function NavMain({
  items,
  quickCreateUrl,
}: {
  items: {
    title: string;
    url: string;
    icon?: React.ReactNode;
  }[];
  quickCreateUrl?: string;
}) {
  const t = useTranslations("AppSidebar");
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            {quickCreateUrl ? (
              <Link href={quickCreateUrl} className="w-full">
                <SidebarMenuButton
                  tooltip={t("quickCreate")}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear w-full"
                >
                  <CirclePlusIcon />
                  <span>{t("quickCreate")}</span>
                </SidebarMenuButton>
              </Link>
            ) : (
              <SidebarMenuButton
                tooltip={t("quickCreate")}
                className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear"
              >
                <CirclePlusIcon />
                <span>{t("quickCreate")}</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              {item.url !== "#" ? (
                <Link href={item.url} className="w-full">
                  <SidebarMenuButton
                    tooltip={item.title}
                    className="w-full"
                    isActive={isNavActive(pathname, item.url)}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </Link>
              ) : (
                <SidebarMenuButton tooltip={item.title}>
                  {item.icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
