"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, LockKeyhole, User } from "lucide-react"

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError(null)
    
    // TODO: Implement actual login logic with Better-Auth
    setTimeout(() => {
      setIsLoading(false)
    }, 1500)
  }

  return (
    <Card className="border-border/30 bg-background/40 shadow-2xl backdrop-blur-2xl supports-[backdrop-filter]:bg-background/20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
      <CardHeader className="space-y-3 pb-8 pt-10 text-center relative z-10">
        <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-2 shadow-inner ring-1 ring-primary/20">
          <LockKeyhole className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-3xl font-bold tracking-tight">
          Welcome back
        </CardTitle>
        <CardDescription className="text-base text-muted-foreground/80 px-4">
          Enter your credentials to access your workspace
        </CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 pb-10">
        <form onSubmit={onSubmit} className="grid gap-6">
          <div className="grid gap-2 group">
            <Label htmlFor="username" className="text-muted-foreground transition-colors group-focus-within:text-foreground">
              Username
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground/50 transition-colors group-focus-within:text-primary" />
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="Enter your username"
                required
                disabled={isLoading}
                className="pl-10 h-12 bg-background/50 border-border/50 focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-all duration-300 rounded-xl"
              />
            </div>
          </div>
          <div className="grid gap-2 group">
            <Label htmlFor="password" className="text-muted-foreground transition-colors group-focus-within:text-foreground">
              Password
            </Label>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground/50 transition-colors group-focus-within:text-primary" />
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                disabled={isLoading}
                className="pl-10 h-12 bg-background/50 border-border/50 focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-all duration-300 rounded-xl"
              />
            </div>
          </div>
          
          {error && (
            <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive font-medium border border-destructive/20 mt-1">
              {error}
            </div>
          )}
          
          <Button 
            className="w-full h-12 mt-2 bg-primary/90 hover:bg-primary transition-all duration-300 active:scale-[0.98] shadow-md hover:shadow-lg rounded-xl text-base" 
            type="submit" 
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : null}
            <span>{isLoading ? "Signing in..." : "Sign in"}</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
