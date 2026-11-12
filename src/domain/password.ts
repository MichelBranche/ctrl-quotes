export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push("Almeno 8 caratteri.");
  if (password.length > 128) issues.push("Massimo 128 caratteri.");
  if (!/[A-Za-z]/.test(password)) issues.push("Almeno una lettera.");
  if (!/[0-9]/.test(password)) issues.push("Almeno un numero.");
  return issues;
}

export function isPasswordValid(password: string): boolean {
  return passwordIssues(password).length === 0;
}
