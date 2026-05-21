import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";

interface UseMessageComposerTextInputOptions {
  text: string;
  sending: boolean;
  setText: Dispatch<SetStateAction<string>>;
  handleTypingState: (nextValue: string) => void;
  clearComposerError: () => void;
  stopTyping: () => void;
  onFocusChange?: (focused: boolean) => void;
}

interface UseMessageComposerTextInputResult {
  isTextFocused: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  textSelectionRef: MutableRefObject<{ start: number; end: number }>;
  resizeTextAreaToContent: () => void;
  resetTextAreaHeight: () => void;
  refocusTextarea: () => void;
  syncTextareaSelection: () => void;
  insertTextAtSelection: (value: string) => void;
  handleInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  handleTextFocus: () => void;
  handleTextBlur: () => void;
}

/**
 * Owns textarea-local mechanics for the message composer:
 * caret/selection tracking, autosize, focus handoff and inline text insertion.
 *
 * It intentionally does not own send/upload orchestration. The outer draft
 * runtime remains the owner of message actions and error semantics.
 */
export function useMessageComposerTextInput({
  text,
  sending,
  setText,
  handleTypingState,
  clearComposerError,
  stopTyping,
  onFocusChange,
}: UseMessageComposerTextInputOptions): UseMessageComposerTextInputResult {
  const [isTextFocused, setIsTextFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textSelectionRef = useRef({ start: 0, end: 0 });

  const resizeTextAreaToContent = useCallback(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
  }, []);

  const resetTextAreaHeight = useCallback(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
  }, []);

  const refocusTextarea = useCallback(() => {
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  const syncTextareaSelection = useCallback(() => {
    if (!textareaRef.current) return;
    textSelectionRef.current = {
      start: textareaRef.current.selectionStart,
      end: textareaRef.current.selectionEnd,
    };
  }, []);

  const insertTextAtSelection = useCallback((value: string) => {
    if (sending) return;

    const currentValue = textareaRef.current?.value ?? text;
    const start = Math.min(textSelectionRef.current.start, currentValue.length);
    const end = Math.min(textSelectionRef.current.end, currentValue.length);
    const nextValue = `${currentValue.slice(0, start)}${value}${currentValue.slice(end)}`;
    const nextCaretPosition = start + value.length;

    setText(nextValue);
    handleTypingState(nextValue);
    clearComposerError();
    textSelectionRef.current = {
      start: nextCaretPosition,
      end: nextCaretPosition,
    };

    setTimeout(() => {
      resizeTextAreaToContent();
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCaretPosition, nextCaretPosition);
    }, 0);
  }, [
    clearComposerError,
    handleTypingState,
    resizeTextAreaToContent,
    sending,
    setText,
    text,
  ]);

  const handleInput = useCallback((event: FormEvent<HTMLTextAreaElement>) => {
    const nextValue = event.currentTarget.value;
    setText(nextValue);
    handleTypingState(nextValue);
    clearComposerError();
    textSelectionRef.current = {
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
    };
    event.currentTarget.style.height = "auto";
    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`;
  }, [clearComposerError, handleTypingState, setText]);

  const handleTextFocus = useCallback(() => {
    setIsTextFocused(true);
    onFocusChange?.(true);
    clearComposerError();
    syncTextareaSelection();
  }, [clearComposerError, onFocusChange, syncTextareaSelection]);

  const handleTextBlur = useCallback(() => {
    setIsTextFocused(false);
    onFocusChange?.(false);
    stopTyping();
  }, [onFocusChange, stopTyping]);

  return {
    handleInput,
    handleTextBlur,
    handleTextFocus,
    insertTextAtSelection,
    isTextFocused,
    refocusTextarea,
    resetTextAreaHeight,
    resizeTextAreaToContent,
    syncTextareaSelection,
    textareaRef,
    textSelectionRef,
  };
}
