import { useEffect, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { auth } from "../firebase";

export const useAuthToken = () => {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (user) {
        const token = await user.getIdToken(); // Get current token
        setUser(user);
        setToken(token);
      } else {
        setUser(null);
        setToken(null);
      }
    });

    // Cleanup on unmount
    return () => unsubscribe();
  }, []);

  return { user, token };
};
