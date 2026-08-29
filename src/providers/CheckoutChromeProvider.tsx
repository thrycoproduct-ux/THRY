"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type CheckoutChromeContextValue = {
  /** True while address dialog or checkout progress should hide site chrome. */
  hideStoreChrome: boolean;
  setHideStoreChrome: (hidden: boolean) => void;
};

const CheckoutChromeContext = createContext<CheckoutChromeContextValue>({
  hideStoreChrome: false,
  setHideStoreChrome: () => {},
});

export function CheckoutChromeProvider({ children }: { children: ReactNode }) {
  const [hideStoreChrome, setHideStoreChromeState] = useState(false);

  const setHideStoreChrome = useCallback((hidden: boolean) => {
    setHideStoreChromeState(hidden);
  }, []);

  const value = useMemo(
    () => ({ hideStoreChrome, setHideStoreChrome }),
    [hideStoreChrome, setHideStoreChrome],
  );

  return (
    <CheckoutChromeContext.Provider value={value}>
      {children}
    </CheckoutChromeContext.Provider>
  );
}

export function useCheckoutChrome() {
  return useContext(CheckoutChromeContext);
}
