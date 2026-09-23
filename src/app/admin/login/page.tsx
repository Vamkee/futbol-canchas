import { Suspense } from "react";

import { LoginForm } from "./login-form";

export default function AdminLoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-bold text-slate-900">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-slate-500">
        Ingresa con el correo y contraseña de Supabase Auth.
      </p>
      <div className="mt-6">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}