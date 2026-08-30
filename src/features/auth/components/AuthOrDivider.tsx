export function AuthOrDivider() {
  return (
    <div className="relative py-0.5">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <span className="relative mx-auto block w-fit bg-card px-3 text-xs text-muted-foreground">
        or
      </span>
    </div>
  );
}
