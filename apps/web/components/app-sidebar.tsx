"use client";

import * as React from "react";

import { NavDocuments } from "@/components/nav-documents";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  BookMarkedIcon,
  BotIcon,
  FileTextIcon,
  FlaskConicalIcon,
  LayoutDashboardIcon,
  NetworkIcon,
  SettingsIcon,
  WrenchIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations("AppSidebar");

  const data = {
    navMain: [
      {
        title: t("navMain.dashboard"),
        url: "/dashboard",
        icon: <LayoutDashboardIcon />,
      },
      {
        title: t("navMain.agents"),
        url: "/dashboard/agents",
        icon: <BotIcon />,
      },
    ],
    authorization: [
      {
        name: t("authorization.policyLibrary"),
        url: "/dashboard/policy-library",
        icon: <BookMarkedIcon />,
      },
      {
        name: t("authorization.gateway"),
        url: "/dashboard/policies",
        icon: <NetworkIcon />,
      },
      {
        name: t("authorization.tool"),
        url: "/dashboard/tools",
        icon: <WrenchIcon />,
      },
    ],
    toolManagement: [
      {
        name: t("toolManagement.registry"),
        url: "/dashboard/registry",
        icon: <FileTextIcon />,
      },
    ],
    test: [
      {
        name: t("test.playground"),
        url: "/dashboard/playground",
        icon: <FlaskConicalIcon />,
      },
    ],
    platform: [
      {
        name: t("platform.settings"),
        url: "/dashboard/platform/settings",
        icon: <SettingsIcon />,
      },
    ],
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5! gap-2"
              render={<Link href="/dashboard" />}
            >
              <Image
                src="/aws-logo.png"
                alt="Logo"
                width={160}
                height={40}
                className="h-5 w-auto shrink-0"
              />
              <span className="text-[12px] font-semibold tracking-tight whitespace-nowrap">
                {t("title")}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavDocuments label={t("authorization.label")} items={data.authorization} />
        <NavDocuments label={t("toolManagement.label")} items={data.toolManagement} />
        <NavDocuments label={t("test.label")} items={data.test} />
        <NavDocuments label={t("platform.label")} items={data.platform} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
