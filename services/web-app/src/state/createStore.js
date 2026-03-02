export function createStore(initialState) {
  let state = structuredClone(initialState);
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(nextStateOrReducer) {
    const nextState = typeof nextStateOrReducer === "function"
      ? nextStateOrReducer(state)
      : nextStateOrReducer;
    state = nextState;
    listeners.forEach((listener) => listener(state));
  }

  function patch(patchObject) {
    setState((prev) => ({ ...prev, ...patchObject }));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getState,
    setState,
    patch,
    subscribe
  };
}
