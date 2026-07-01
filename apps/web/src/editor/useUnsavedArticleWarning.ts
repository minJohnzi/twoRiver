import { useEffect } from "react";

const DEFAULT_UNSAVED_MESSAGE = "You have unsaved article changes.";

export function useUnsavedArticleWarning(isDirty: boolean, message = DEFAULT_UNSAVED_MESSAGE): void {
  useEffect(() => {
    if (!isDirty) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = message;
      return message;
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, message]);
}
