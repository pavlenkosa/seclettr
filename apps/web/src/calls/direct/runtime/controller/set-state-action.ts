import { type SetStateAction } from "react";

export function applySetStateAction<T>(current: T, action: SetStateAction<T>): T {
  return typeof action === "function" ? (action as (prev: T) => T)(current) : action;
}
