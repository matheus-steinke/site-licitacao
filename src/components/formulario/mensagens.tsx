import { CircleAlert, CircleCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

export function MensagemErro({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function MensagemOk({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <Alert role="status">
      <CircleCheck aria-hidden />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
