import { Suspense } from "react";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <Suspense fallback={<div className="w-full max-w-sm" />}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
