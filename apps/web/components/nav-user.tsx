"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useMounted } from "@/hooks/use-mounted";
import { authClient, useSession } from "@package/auth";
import BoringAvatar from "boring-avatars";
import {
  CheckIcon,
  CodeIcon,
  EllipsisVerticalIcon,
  LanguagesIcon,
  LogOutIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export function NavUser() {
  const { isMobile } = useSidebar();
  const { data: session, isPending } = useSession();
  const mounted = useMounted();
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("NavUser");

  function setLocale(next: string) {
    document.cookie = `locale=${next};path=/;max-age=31536000`;
    router.refresh();
  }

  const user = session?.user;
  const name = user?.name || "User";
  const email = user?.email || "No email available";
  const avatar = user?.image || "";
  const avatarSeed = user?.email || user?.name || "User";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
            }
          >
            <Avatar className="size-8">
              <AvatarImage src={avatar} alt={name} />
              <AvatarFallback className="rounded-full overflow-hidden p-0 [&>svg]:!w-full [&>svg]:!h-full">
                {isPending || !mounted ? null : (
                  <BoringAvatar name={avatarSeed} variant="marble" size={32} />
                )}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {!mounted || isPending ? t("loading") : name}
              </span>
              <span className="text-foreground/70 truncate text-xs">
                {!mounted || isPending ? t("loadingSession") : email}
              </span>
            </div>
            <EllipsisVerticalIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8">
                    <AvatarImage src={avatar} alt={name} />
                    <AvatarFallback className="rounded-full overflow-hidden p-0 [&>svg]:!w-full [&>svg]:!h-full">
                      {mounted && (
                        <BoringAvatar
                          name={avatarSeed}
                          variant="marble"
                          size={32}
                        />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{name}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.open("/api", "_blank")}>
              <CodeIcon />
              {t("apiReference")}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <LanguagesIcon />
                {t("language")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => setLocale("en")}>
                  English
                  {locale === "en" && <CheckIcon className="ml-auto size-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocale("ja")}>
                  日本語
                  {locale === "ja" && <CheckIcon className="ml-auto size-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocale("ko")}>
                  한국어
                  {locale === "ko" && <CheckIcon className="ml-auto size-4" />}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      window.location.href = "/sign-in";
                    },
                  },
                });
              }}
            >
              <LogOutIcon />
              {t("logOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
