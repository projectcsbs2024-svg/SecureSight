// src/api/userSettings.js
import api from "./api";
import { auth } from "../firebase"

export const fetchUserSettings = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const token = await user.getIdToken();

  const res = await api.get("/user_settings", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
};
