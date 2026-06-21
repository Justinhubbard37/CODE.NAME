export function SecretsPanel() {
  return (
    <div className="border border-neutral-800 bg-neutral-950 p-3 type-body font-mono text-neutral-300">
      <div className="type-body-strong text-neutral-200">Provider credentials</div>
      <div className="mt-1 type-meta text-neutral-400">
        Credentials are bound to approved provider connections by the Rust runtime.
      </div>
    </div>
  );
}
