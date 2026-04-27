export interface OrderedTaskRunner {
  enqueue<T>(task: () => Promise<T> | T): Promise<T>;
}

export function createOrderedTaskRunner(): OrderedTaskRunner {
  let tail = Promise.resolve();

  return {
    enqueue(task) {
      const next = tail.then(() => task());
      tail = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    },
  };
}
