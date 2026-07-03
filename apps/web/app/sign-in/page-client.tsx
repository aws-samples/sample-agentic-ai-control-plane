"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@package/auth";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

function setLocaleCookie(locale: string) {
  document.cookie = `locale=${locale};path=/;max-age=${60 * 60 * 24 * 365}`;
}

export default function SignInClient() {
  const t = useTranslations("SignIn");
  const ls = useTranslations("LanguageSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const switchLocale = (next: string) => {
    setLocaleCookie(next);
    router.refresh();
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    await authClient.signIn.social({
      provider: "cognito",
      callbackURL: "/dashboard",
    });
  };

  return (
    <div className="flex flex-col min-h-svh items-center justify-center bg-muted/40 p-4">
      <Image
        src="/aws-logo.png"
        alt="Logo"
        width={160}
        height={40}
        className="mx-auto mb-6"
        priority
      />
      <Card className="w-full max-w-sm">
        <CardContent>
          <Button
            size="lg"
            className="w-full"
            onClick={handleSignIn}
            disabled={isSigningIn}
          >
            {isSigningIn ? <Spinner className="mr-2" /> : null}
            {t("signIn")}
          </Button>
        </CardContent>
      </Card>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <button
          onClick={() => switchLocale("en")}
          className={`transition-colors ${locale === "en" ? "text-foreground font-medium" : "hover:text-foreground cursor-pointer"}`}
        >
          {ls("en")}
        </button>
        <span>/</span>
        <button
          onClick={() => switchLocale("ja")}
          className={`transition-colors ${locale === "ja" ? "text-foreground font-medium" : "hover:text-foreground cursor-pointer"}`}
        >
          {ls("ja")}
        </button>
      </div>
    </div>
  );
}
