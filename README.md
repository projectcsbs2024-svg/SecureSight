# SecureSight
An AI enabled platform to automatically detect weapons, violence/scuffle and stampede situation from CCTV footage 

cd SecureSight/backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt


uvicorn app.main:app --reload

Optional backend email alert env vars:

`ALERT_EMAIL_ENABLED=true`
`ALERT_SMTP_HOST=smtp.yourprovider.com`
`ALERT_SMTP_PORT=587`
`ALERT_SMTP_USERNAME=your-user`
`ALERT_SMTP_PASSWORD=your-password`
`ALERT_FROM_EMAIL=alerts@yoursite.com`
`ALERT_SMTP_USE_TLS=true`
`ALERT_SMTP_USE_SSL=false`
`PUBLIC_API_BASE_URL=http://127.0.0.1:8000`

