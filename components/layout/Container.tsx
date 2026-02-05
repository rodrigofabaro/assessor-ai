import type { ElementType, ReactNode } from "react";

type ContainerProps<T extends ElementType = "div"> = {
  children: ReactNode;
  className?: string;
  as?: T;
};

export default function Container<T extends ElementType = "div">({
  children,
  className,
  as,
}: ContainerProps<T>) {
  const Comp = as || "div";

  return (
    <Comp
      className={`mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8${className ? ` ${className}` : ""}`}
    >
      {children}
    </Comp>
  );
}
