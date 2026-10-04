import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const STYLES: Record<Variant, string> = {
  primary:
    "bg-[#1d1d1f] text-white hover:opacity-90 active:opacity-80",
  secondary:
    "bg-transparent text-[#1d1d1f] border border-black/[0.08] hover:bg-black/[0.04]",
  ghost: "bg-transparent text-[#007aff] hover:bg-[#007aff]/5",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export default function Button({ variant = "primary", className, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-opacity duration-150 disabled:opacity-40 ${STYLES[variant]} ${className ?? ""}`}
    />
  );
}
