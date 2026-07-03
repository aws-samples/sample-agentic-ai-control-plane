"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageSquarePlusIcon, MessageSquareIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

export type PlaygroundConversation = {
  id: string;
  title: string;
  updatedAt: Date;
};

type ConversationListProps = {
  conversations: PlaygroundConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
};

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ConversationListProps) {
  const t = useTranslations("Playground");

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between border-b px-3 py-3">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <Button size="icon-sm" variant="ghost" onClick={onNew}>
          <MessageSquarePlusIcon className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-12 text-center">
            <MessageSquareIcon className="size-8 text-muted-foreground/30" />
            <p className="text-xs font-medium text-muted-foreground">
              {t("noConversations")}
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              {t("noConversationsHint")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-1.5">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(conv.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(conv.id);
                  }
                }}
                className={cn(
                  "group flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  activeId === conv.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <MessageSquareIcon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{conv.title}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2Icon className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
