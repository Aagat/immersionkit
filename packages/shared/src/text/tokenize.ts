export function tokenizePlainText(input: string) {
  return input.split(/\s+/).filter(Boolean);
}

