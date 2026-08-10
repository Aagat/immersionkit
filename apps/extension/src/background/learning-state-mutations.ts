let pendingMutation: Promise<void> = Promise.resolve();

export function runLearningStateMutation<T>(
  mutation: () => Promise<T>
): Promise<T> {
  const result = pendingMutation.then(mutation, mutation);
  pendingMutation = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function waitForLearningStateMutations(): Promise<void> {
  await pendingMutation;
}
