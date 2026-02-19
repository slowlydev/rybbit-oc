import React, { ReactNode } from "react";

interface DisabledOverlayProps {
  children: ReactNode;
  message?: string;
  featurePath?: string;
  blur?: number;
  borderRadius?: number;
  showMessage?: boolean;
  style?: React.CSSProperties;
  requiredPlan?: "pro" | "standard" | "basic";
}

export const DisabledOverlay: React.FC<DisabledOverlayProps> = ({
  children,
}) => {
  return <>{children}</>;
};
