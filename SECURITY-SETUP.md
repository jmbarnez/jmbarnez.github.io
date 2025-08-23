# 🔒 SECURITY SETUP - CRITICAL INFORMATION

## 🚨 NEVER COMMIT THESE FILES TO GIT
- functions/service-account-key.json (contains private keys)
- Any *.gserviceaccount.json files
- .env files with actual secrets

## ✅ SAFE TO COMMIT
- .env (with placeholder values only)
- functions/service-account-key.example.json (template)

## 🛡️ PROTECTION IN PLACE
- .gitignore blocks all service account files
- Firebase deployment ignores sensitive files
- Environment variables contain only public config

## ⚠️ SECURITY CHECK
Run this to verify no sensitive files are tracked:
git ls-files | grep -E '(service-account|gserviceaccount)'
