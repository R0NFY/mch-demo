export function safeError(err: unknown) {
  const anyErr = err as any;
  const out: Record<string, unknown> = {
    name: anyErr?.name ?? "Error",
    message: anyErr?.message ?? String(err),
  };

  if (anyErr?.code) out.code = anyErr.code;
  if (anyErr?.status) out.status = anyErr.status;
  if (anyErr?.$metadata) out.aws_metadata = anyErr.$metadata;

  // Avoid circular structures / huge objects.
  if (anyErr?.cause && typeof anyErr.cause === "object") {
    out.cause = { name: anyErr.cause.name, message: anyErr.cause.message };
  }

  return out;
}

