export interface RequestSequence {
  begin: () => number;
  isCurrent: (token: number) => boolean;
  invalidate: () => void;
}

export function createRequestSequence(): RequestSequence {
  let currentToken = 0;

  return {
    begin() {
      currentToken += 1;
      return currentToken;
    },
    isCurrent(token) {
      return token === currentToken;
    },
    invalidate() {
      currentToken += 1;
    },
  };
}
