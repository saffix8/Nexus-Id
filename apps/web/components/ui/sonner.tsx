"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

// DESIGN.md §7: small-action toasts bottom-right. Tokens: surface card, 1px border,
// radius 8, dialog shadow; status colour only on the icon.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark" // NexusID is dark only (DESIGN.md §0)
      position="bottom-right"
      closeButton={false}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast font-sans text-sm group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:rounded-lg group-[.toaster]:shadow-dialog",
          title: "font-medium",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-danger",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-accent-text",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
