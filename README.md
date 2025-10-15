# SecureSight
An AI enabled platform to automatically detect weapons, violence/scuffle and stampede situation from CCTV footage 

cd SecureSight/backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt


uvicorn app.main:app --reload


---

### 🧠 Notes

- ✅ This works automatically on **GitHub**, as long as:
  - The images are committed to the repo.
  - The paths are **relative to the README.md file’s location**.

- If your README is in a different directory (e.g., inside `/backend`), adjust the relative path accordingly:
  ```markdown
  ![User Settings](https://github.com/projectcsbs2024-svg/SecureSight/tree/backend/temp/backend/images/users_endpoint.png?raw=true)

  ###
  ```
  ---

  ![User Settings Sample](https://github.com/projectcsbs2024-svg/SecureSight/tree/backend/temp/backend/images/user_settings_endpoint.png?raw=true)


