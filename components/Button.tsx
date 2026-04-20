"use client";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center font-bold uppercase tracking-wider transition-transform duration-150 active:scale-[0.97] select-none cursor-pointer border";

  const variants = {
    primary: "bg-[#E8FF00] text-[#0A0A0A] border-[#E8FF00] hover:bg-[#0A0A0A] hover:text-[#E8FF00]",
    secondary: "bg-[#0A0A0A] text-white border-[#0A0A0A] hover:bg-white hover:text-[#0A0A0A]",
    ghost: "bg-transparent text-[#0A0A0A] border-[#E5E5E5] hover:border-[#0A0A0A]",
  };

  const sizes = {
    sm: "px-4 py-2 text-xs",
    md: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-base",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
