// src/api/userSettings.js
import api from "./api";

export const fetchUserSettings = async () => {
  const response = await api.get("/user_settings/tokenid");
  return response.data;
};
