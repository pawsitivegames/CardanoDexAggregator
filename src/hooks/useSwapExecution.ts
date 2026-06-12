import { useReducer, useEffect, useRef, useCallback } from "react";
import {
  swapReducer,
  type SwapState,
} from "../domain/executionMachine";

export function useSwapExecution() {
  const [state, dispatch] = useReducer(swapReducer, {
    step: "preview_ready",
  } satisfies SwapState);

  const isExecutingRef = useRef(false);

  const execute = useCallback(() => {
    if (isExecutingRef.current) return;
    isExecutingRef.current = true;
    dispatch({ type: "START_REFRESH" });
  }, []);

  const reset = useCallback(() => {
    isExecutingRef.current = false;
    dispatch({ type: "RESET" });
  }, []);

  const startBuild = useCallback(() => dispatch({ type: "START_BUILD" }), []);
  const startSign = useCallback(() => dispatch({ type: "START_SIGN" }), []);
  const startSubmit = useCallback(() => dispatch({ type: "START_SUBMIT" }), []);
  const txSubmitted = useCallback(
    (txHash: string) => dispatch({ type: "TX_SUBMITTED", txHash }),
    [],
  );
  const txTracking = useCallback(
    (txHash: string) => dispatch({ type: "TX_TRACKING", txHash }),
    [],
  );
  const txConfirmed = useCallback(
    (txHash: string, blockHeight: number) => {
      isExecutingRef.current = false;
      dispatch({ type: "TX_CONFIRMED", txHash, blockHeight });
    },
    [],
  );
  const fail = useCallback(
    (error: string) => {
      isExecutingRef.current = false;
      dispatch({ type: "FAIL", error });
    },
    [],
  );
  const expire = useCallback(
    (error: string) => {
      isExecutingRef.current = false;
      dispatch({ type: "EXPIRE", error });
    },
    [],
  );

  return {
    state,
    dispatch,
    isExecutingRef,
    execute,
    reset,
    startBuild,
    startSign,
    startSubmit,
    txSubmitted,
    txTracking,
    txConfirmed,
    fail,
    expire,
  };
}
