import { HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["glass rounded-3xl p-4", className].join(" ")}
      {...rest}
    />
  );
}
