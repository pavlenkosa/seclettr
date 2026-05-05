export class CallSetupTimeoutError extends Error {
  readonly stage: string;
  constructor(stage: string) {
    super(`Call setup timed out at stage: ${stage}`);
    this.stage = stage;
  }
}

export function withSetupStageTimeout<T>(
  promise: Promise<T>,
  ms: number,
  stage: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CallSetupTimeoutError(stage));
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err)   => { clearTimeout(timer); reject(err); }
    );
  });
}
