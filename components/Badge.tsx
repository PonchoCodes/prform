interface BadgeProps {
  label: string;
  variant?: "A" | "B" | "C" | "default";
}

export function Badge({ label, variant = "default" }: BadgeProps) {
  const styles = {
    A: "bg-[#E8FF00] text-[#0A0A0A]",
    B: "bg-[#0A0A0A] text-white",
    C: "bg-[#E5E5E5] text-[#6B6B6B]",
    default: "bg-[#E5E5E5] text-[#0A0A0A]",
  };

  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-bold uppercase tracking-widest border border-transparent ${styles[variant]}`}
    >
      {label}
    </span>
  );
}
