import { Metadata } from "next"
import { LoginForm } from "./login-form"

export const metadata: Metadata = {
  title: "Login | Anticloud",
  description: "Sign in to Anticloud file management platform",
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-6 md:p-10 selection:bg-primary/20">
      {/* Ambient background blur effects */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden">
        <div className="absolute left-1/2 top-1/2 -z-10 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 opacity-30 blur-[120px] animate-pulse duration-10000" />
        <div className="absolute left-[20%] top-[30%] -z-10 h-[400px] w-[400px] rounded-full bg-secondary/20 opacity-40 blur-[100px]" />
        <div className="absolute right-[20%] bottom-[20%] -z-10 h-[500px] w-[500px] rounded-full bg-chart-1/10 opacity-20 blur-[100px]" />
        <div className="absolute left-0 right-0 top-0 h-[500px] bg-gradient-to-b from-primary/5 to-transparent blur-[50px] opacity-20" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
      </div>

      <div className="z-10 flex w-full max-w-sm flex-col gap-6 relative animate-in fade-in zoom-in-95 duration-700 slide-in-from-bottom-6">
        <LoginForm />
      </div>
    </div>
  )
}
