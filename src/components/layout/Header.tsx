import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { haptic } from "@/lib/telegram";

interface Props {
  title?: ReactNode;
  back?: boolean;
  right?: ReactNode;
}

export function Header({ title, back, right }: Props) {
  const nav = useNavigate();
  return (
    <header className="mb-3 flex items-center gap-3">
      {back && (
        <button
          onClick={() => {
            haptic.impact("light");
            nav(-1);
          }}
          className="glass flex size-10 items-center justify-center rounded-2xl text-lg"
        >
          ‹
        </button>
      )}
      {title && (
        <h1 className="flex-1 font-display text-2xl font-extrabold">{title}</h1>
      )}
      {right}
    </header>
  );
}
